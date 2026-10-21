// Records the SHAPE of Maccabi's password sign-in, to build a sign-in that needs no browser.
//
//   node scripts/discover-login.mjs
//
// It opens the browser and signs in exactly as scripts/live-run.mjs does (ID → "sign in with password"
// → password), with the DevTools Network domain on, and prints every request to the login origin's
// /infosec/ and /saml/ paths and the portal's token endpoint: method, path, which headers were sent
// (names, plus the shape of Authorization), the request body with every secret replaced, the
// response status, and the response JSON reduced to its keys and value types. Nothing printed is
// a value: the ID number and the password are replaced by <ID> and <PASSWORD> wherever they appear,
// in every spelling the wire gives them (as typed, JSON-escaped, URL-encoded), and a JSON body's
// credential fields are blanked by name besides; anything that looks like a JWT or a long token
// becomes <jwt>/<token>, and response values are never printed, only their types (scripts/redact.mjs,
// which test/session.test.ts holds to this).
//
// The report is the input for a browserless sign-in (the same chain Oren Yomtov's maccabi-health
// replays over fetch for the SMS path, docs/AUTH.md there) with the password step in place of the
// SMS step. Run it once; it signs in once, like any run, and ends the member's other sessions.
import { credentials, openBrowser, signIn, START } from './maccabi-browser.mjs';
import { redactor, shape } from './redact.mjs';
import { sleep } from './stage.mjs';

/** The sign-in chain's hosts and paths, and the portal's token bootstrap: what maccabi-session.mjs replays. */
const WATCH = /^https:\/\/(mac\.maccabi4u\.co\.il\/(infosec|saml|login)|online\.maccabi4u\.co\.il\/(saml|sonline\/TokenServerAPI))/;
const HEADERS_OF_INTEREST = ['authorization', 'relay', 'content-type', 'accept', 'origin', 'referer', 'x-requested-with'];

async function main() {
  const creds = credentials();
  const redact = redactor(creds);
  const page = await openBrowser({ startUrl: START, keep: false });
  const { send, sessionId } = page;
  await send('Network.enable', {}, sessionId);

  const requests = new Map(); // requestId -> record
  const order = [];
  page.on('Network.requestWillBeSent', (ev, sid) => {
    if (sid !== sessionId || !WATCH.test(ev.request.url)) return;
    const headers = {};
    for (const [k, v] of Object.entries(ev.request.headers)) {
      const key = k.toLowerCase();
      if (!HEADERS_OF_INTEREST.includes(key)) continue;
      headers[key] = key === 'authorization' ? v.replace(/^(\w+)\s+.*$/, '$1 <token>') : redact(v);
    }
    const rec = { url: redact(ev.request.url.split('?')[0]), query: redact(new URL(ev.request.url).search), method: ev.request.method, headers, body: redact(ev.request.postData), hasPostData: ev.request.hasPostData };
    requests.set(ev.requestId, rec);
    order.push(ev.requestId);
  });
  page.on('Network.responseReceived', (ev, sid) => {
    const rec = sid === sessionId && requests.get(ev.requestId);
    if (!rec) return;
    rec.status = ev.response.status;
    rec.mime = ev.response.mimeType;
    rec.location = ev.response.headers.location || ev.response.headers.Location;
    const setCookie = Object.entries(ev.response.headers).filter(([k]) => k.toLowerCase() === 'set-cookie').map(([, v]) => v).join('\n');
    if (setCookie) rec.cookiesSet = setCookie.split('\n').map((c) => c.split('=')[0].trim());
  });
  page.on('Network.loadingFinished', async (ev, sid) => {
    const rec = sid === sessionId && requests.get(ev.requestId);
    if (!rec) return;
    if (!rec.hasPostData && rec.method !== 'GET') {
      try { rec.body = redact((await send('Network.getRequestPostData', { requestId: ev.requestId }, sessionId)).postData); } catch { /* none */ }
    }
    if (rec.mime && rec.mime.includes('json')) {
      try {
        const { body, base64Encoded } = await send('Network.getResponseBody', { requestId: ev.requestId }, sessionId);
        rec.responseShape = shape(JSON.parse(base64Encoded ? Buffer.from(body, 'base64').toString() : body));
      } catch (e) { rec.responseShape = 'unreadable: ' + e.message; }
    }
  });

  await sleep(2000);
  await signIn(page);
  await sleep(4000); // the portal's own bootstrap (token endpoint) right after landing
  console.log('\n=== Sign-in request shapes (secrets replaced, response values reduced to types) ===\n');
  let n = 0;
  for (const id of order) {
    const r = requests.get(id);
    console.log(`#${++n} ${r.method} ${r.url}${r.query || ''}`);
    console.log('   headers: ' + JSON.stringify(r.headers));
    if (r.body !== undefined) console.log('   body: ' + (typeof r.body === 'string' ? r.body.slice(0, 600) : JSON.stringify(r.body)));
    console.log(`   -> ${r.status ?? '?'} ${r.mime || ''}${r.location ? ' location: ' + redact(r.location) : ''}${r.cookiesSet ? ' set-cookie: ' + r.cookiesSet.join(', ') : ''}`);
    if (r.responseShape !== undefined) console.log('   response: ' + JSON.stringify(r.responseShape));
  }
  console.log('\nPaste the block above back; it contains no values.');
}

main().then(
  () => process.exit(),
  (e) => {
    console.error(e.message);
    process.exit(1);
  },
);
