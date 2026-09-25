/* Development build only: an experiment, not a feature. It walks Maccabi's imaging-viewer handoff
   for one imaging_study row, to learn whether the extension can reach the viewer at all before
   anything is built on it. The viewer is MedDream on meddreamy.maccabi4u.co.il; the chain was mapped
   by orenyomtov/maccabi-health (MIT), packages/core/src/readers/imaging-viewer.ts, from a Node client
   that keeps its own cookie jar and reads Location headers. An extension can do neither: Chrome owns
   the cookies, and a redirect:'manual' fetch is opaque. So this tries the two ways that are open:

     fetch -- the extension follows each hop's redirects itself and reads response.url, posting the
              two auto-submitting forms (SAML, then F5's `dummy` nonce) out of the markup;
     tab   -- a background tab on the results lobby navigates to the handoff and Chrome runs the
              whole chain; the extension then reads the viewer with the cookies that left behind.

   Replies carry statuses, where each hop landed (origin and path with ids masked, query *keys*
   only), form-field and cookie *names*, counts and pixel geometry. Never a UID, a token, a cookie
   value, a name or an image. */
import { jwtClaims, type Json } from '../../core';
import { MACCABI_ORIGIN } from '../shared/state';
import { extensionFetch, sessionOf, snapshot } from './tab';

export const LOGIN_ORIGIN = 'https://mac.maccabi4u.co.il';
export const VIEWER_ORIGIN = 'https://meddreamy.maccabi4u.co.il';
const LOBBY = MACCABI_ORIGIN + '/sonline/testsResults/TestsResults/lobby/';
const ACS_PATH = '/saml/sp/profile/post/acs';
/** No more forms than the mapped chain has (SAML, then the F5 nonce), plus slack for a surprise. */
const MAX_FORMS = 4;
/** Their largest measured instance was 4.5 MB (RGB ultrasound); a cine series is what would run away. */
const PIXEL_LIMIT = 64 * 1024 * 1024;

export function handoffUrl(mid: string, checksum: string, studyUid: string): string {
  return MACCABI_ORIGIN + '/sonline/TestResultsAPI/webapi/mac/pdf/members/0/' + mid + '/meddream/token/' +
    encodeURIComponent(studyUid) + '?checksum=' + encodeURIComponent(checksum);
}

/**
 * Where a hop landed, safe to report: origin and path with every id-like segment masked, and the
 * query string's keys without their values. The handoff path carries the member id and the study
 * UID, and the viewer's URLs carry the study, series and image UIDs and the HIS token.
 */
export function where(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return '(not a URL)';
  }
  const path = u.pathname
    .split('/')
    .map((s) => (/^\d+(\.\d+)+$/.test(s) ? '<uid>' : /^\d{4,}$/.test(s) ? '<n>' : s.length > 40 ? '<long>' : s))
    .join('/');
  const keys = [...new Set(u.searchParams.keys())];
  return u.origin + path + (keys.length ? '?' + keys.join('&') : '');
}

export interface Form {
  action: string | null;
  fields: Map<string, string>;
}

/** Only the entities a server emits inside an attribute value. */
function decodeEntities(v: string): string {
  return v.replace(/&(amp|lt|gt|quot|#39|apos);/g, (e) =>
    ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'" })[e] ?? e);
}

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp('\\b' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s"\'>]+))', 'i').exec(tag);
  const v = m?.[1] ?? m?.[2] ?? m?.[3];
  return v === undefined ? undefined : decodeEntities(v);
}

/**
 * The first form in a page and its inputs. The two intermediate pages are auto-submitting forms whose
 * hidden inputs are in the markup as they are; nothing needs the page's script. A regex, because this
 * runs in the service worker, which has no DOMParser.
 */
export function formOf(html: string): Form | null {
  const open = /<form\b[^>]*>/i.exec(html);
  if (!open) return null;
  const fields = new Map<string, string>();
  for (const [tag] of html.slice(open.index).matchAll(/<input\b[^>]*>/gi)) {
    const name = attr(tag, 'name');
    if (name !== undefined && !fields.has(name)) fields.set(name, attr(tag, 'value') ?? '');
  }
  return { action: attr(open[0], 'action') ?? null, fields };
}

export interface Geometry {
  rows: number;
  columns: number;
  samplesPerPixel: number;
  bitsAllocated: number;
  numberOfFrames: number;
  photometricInterpretation?: string;
  transferSyntaxUID?: string;
  expectedBytes: number;
}

const whole = (v: unknown, min: number): v is number => Number.isSafeInteger(v) && (v as number) >= min;

/** The size /pixels must have: the buffer has no header, so this is its only integrity check. */
export function geometry(meta: Json): Geometry | null {
  if (!meta || typeof meta !== 'object') return null;
  const { rows, columns, samplesPerPixel, bitsAllocated, numberOfFrames } = meta;
  if (!whole(rows, 1) || !whole(columns, 1) || !whole(samplesPerPixel, 1) || !whole(bitsAllocated, 8) || bitsAllocated % 8) return null;
  const frames = whole(numberOfFrames, 1) ? numberOfFrames : 1;
  return {
    rows, columns, samplesPerPixel, bitsAllocated, numberOfFrames: frames,
    ...(typeof meta.photometricInterpretation === 'string' ? { photometricInterpretation: meta.photometricInterpretation } : {}),
    ...(typeof meta.transferSyntaxUID === 'string' ? { transferSyntaxUID: meta.transferSyntaxUID } : {}),
    expectedBytes: rows * columns * samplesPerPixel * (bitsAllocated / 8) * frames,
  };
}

export function isJpeg(b: Uint8Array): boolean {
  return b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[b.length - 2] === 0xff && b[b.length - 1] === 0xd9;
}

/** A `checksum_id` string anywhere in a parsed value. */
export function findChecksum(v: unknown, depth = 0): string | null {
  if (!v || typeof v !== 'object' || depth > 8) return null;
  for (const [k, x] of Object.entries(v)) {
    if (k === 'checksum_id' && typeof x === 'string' && /^[A-Za-z0-9]{1,128}$/.test(x)) return x;
    const found = findChecksum(x, depth + 1);
    if (found) return found;
  }
  return null;
}

export interface Hop {
  hop: string;
  status?: number;
  at?: string;
  contentType?: string;
  bytes?: number;
  /** Input names of the form in the page, if there is one. */
  form?: string[];
  /** Cookie names Chrome holds for the login and viewer hosts after this hop. */
  cookies?: { login: string[]; viewer: string[] };
  ms: number;
  note?: string;
}

export interface StudyReport {
  /** Studies the viewer's /his granted, and whether the one asked for is among them. */
  hisStudies?: number;
  granted?: boolean;
  modality?: string;
  series?: { modality?: string; instances: number; sopClasses: string[]; framesInStructure: unknown[] }[];
  image?: {
    geometry: Geometry | null;
    thumbnail?: { status: number; contentType: string; bytes: number; jpeg: boolean };
    pixels?: { status: number; contentType: string; bytes: number; matchesGeometry: boolean };
  };
}

export interface ProbeResult {
  hops: Hop[];
  /** 'viewer read' when the image reads worked; otherwise the first thing that stopped the chain. */
  outcome: string;
  study?: StudyReport;
}

export interface ProbeDeps {
  fetch(url: string, init: RequestInit): Promise<Response>;
  cookieNames(origin: string): Promise<string[]>;
  now(): number;
}

async function hopOf(deps: ProbeDeps, name: string, r: Response, t0: number, body?: Uint8Array): Promise<Hop> {
  const bytes = body ?? new Uint8Array(await r.clone().arrayBuffer());
  const type = r.headers.get('content-type') || '';
  const form = /html/i.test(type) ? formOf(new TextDecoder().decode(bytes)) : null;
  return {
    hop: name,
    status: r.status,
    at: where(r.url),
    contentType: type,
    bytes: bytes.length,
    ...(form ? { form: [...form.fields.keys()] } : {}),
    cookies: { login: await deps.cookieNames(LOGIN_ORIGIN), viewer: await deps.cookieNames(VIEWER_ORIGIN) },
    ms: deps.now() - t0,
  };
}

function formPost(fields: Record<string, string>): RequestInit {
  return {
    method: 'POST',
    credentials: 'include',
    redirect: 'follow',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  };
}

async function json(r: Response): Promise<Json> {
  try {
    return JSON.parse(await r.text());
  } catch {
    return undefined;
  }
}

/**
 * The reads a viewer session unlocks, for the study's first image: /structure, then that image's
 * /metadata, /thumbnail and (if asked) /pixels. The `storageId` comes from /his (fetch mode) or
 * from the viewer page's own requests (tab mode).
 */
export async function readStudy(
  deps: ProbeDeps,
  study: string,
  storageId: string,
  opts: { pixels: boolean; csrf?: string | null },
  hops: Hop[],
  out: StudyReport,
): Promise<{ outcome: string; thumbnail?: Uint8Array }> {
  const headers: Record<string, string> = { accept: '*/*', ...(opts.csrf ? { 'X-CSRF-TOKEN': opts.csrf } : {}) };
  const get = (suffix: string) =>
    deps.fetch(VIEWER_ORIGIN + '/studies/' + encodeURIComponent(study) + suffix + (suffix.includes('?') ? '&' : '?') + 'storageId=' + encodeURIComponent(storageId),
      { credentials: 'include', redirect: 'follow', headers });
  let t0 = deps.now();
  const s = await get('/structure');
  hops.push(await hopOf(deps, 'structure', s, t0));
  if (!s.ok) return { outcome: 'structure answered ' + s.status };
  const tree = await json(s);
  if (!tree || !Array.isArray(tree.series)) return { outcome: 'structure is not the expected JSON' };
  out.series = tree.series.map((x: Json) => ({
    modality: typeof x?.modality === 'string' ? x.modality : undefined,
    instances: Array.isArray(x?.instances) ? x.instances.length : 0,
    sopClasses: [...new Set<string>((x?.instances || []).map((i: Json) => String(i?.sopClassUID)))],
    framesInStructure: [...new Set((x?.instances || []).map((i: Json) => i?.numberOfFrames))],
  }));
  const series = tree.series.find((x: Json) => Array.isArray(x?.instances) && x.instances.length);
  const inst = series?.instances[0];
  if (!series || !inst) return { outcome: 'structure lists no images' };
  const img = '/series/' + encodeURIComponent(series.seriesInstanceUID) + '/images/' + encodeURIComponent(inst.sopInstanceUID);

  t0 = deps.now();
  const m = await get(img + '/metadata');
  hops.push(await hopOf(deps, 'metadata', m, t0));
  if (!m.ok) return { outcome: 'metadata answered ' + m.status };
  const g = geometry(await json(m));
  out.image = { geometry: g };

  t0 = deps.now();
  const th = await get(img + '/thumbnail');
  const thBytes = new Uint8Array(await th.arrayBuffer());
  hops.push(await hopOf(deps, 'thumbnail', th, t0, thBytes));
  out.image.thumbnail = { status: th.status, contentType: th.headers.get('content-type') || '', bytes: thBytes.length, jpeg: isJpeg(thBytes) };

  if (opts.pixels && g && g.expectedBytes <= PIXEL_LIMIT) {
    t0 = deps.now();
    const p = await get(img + '/pixels');
    const pBytes = new Uint8Array(await p.arrayBuffer());
    hops.push(await hopOf(deps, 'pixels', p, t0, pBytes));
    out.image.pixels = { status: p.status, contentType: p.headers.get('content-type') || '', bytes: pBytes.length, matchesGeometry: pBytes.length === g.expectedBytes };
  }
  const ok = out.image.thumbnail.jpeg && (!out.image.pixels || out.image.pixels.matchesGeometry);
  return { outcome: ok ? 'viewer read' : 'viewer answered, but not with an image', thumbnail: out.image.thumbnail.jpeg ? thBytes : undefined };
}

/**
 * The whole chain from the extension. Every fetch follows its redirects, because a manual one is
 * opaque here; the values the Node client read out of Location (the SAML page's URL, the HIS token)
 * are in response.url instead. The Referer the portal's own click sends cannot be set from a service
 * worker, and every POST carries Origin: chrome-extension://..., so a refusal at a form hop is the
 * first thing to suspect.
 */
export async function fetchProbe(
  deps: ProbeDeps,
  opts: { handoff: string; study: string; pixels: boolean },
): Promise<ProbeResult & { thumbnail?: Uint8Array }> {
  const hops: Hop[] = [];
  let t0 = deps.now();
  let r = await deps.fetch(opts.handoff, { credentials: 'include', redirect: 'follow', headers: { accept: 'text/html,application/xhtml+xml' } });
  hops.push(await hopOf(deps, 'handoff', r, t0));
  if (new URL(r.url || opts.handoff).origin === MACCABI_ORIGIN) return { hops, outcome: 'the handoff stayed on the portal (logged out, or no redirect to the login host)' };

  // SAML form, then F5's nonce form; stop as soon as a URL carries the HIS token.
  for (let i = 0; i < MAX_FORMS && !new URL(r.url).searchParams.get('token'); i++) {
    const form = formOf(await r.clone().text());
    if (!form) break;
    let fields: Record<string, string>;
    let name: string;
    if (form.fields.has('SAMLResponse')) {
      fields = { SAMLResponse: form.fields.get('SAMLResponse')!, RelayState: form.fields.get('RelayState') ?? '' };
      name = 'saml-post';
    } else if (form.fields.has('dummy')) {
      // As the Node client does, validated live: the nonce alone, not the form's other inputs.
      fields = { dummy: form.fields.get('dummy')! };
      name = 'policy-post';
    } else break;
    const action = new URL(form.action ?? VIEWER_ORIGIN + ACS_PATH, r.url).toString();
    t0 = deps.now();
    r = await deps.fetch(action, formPost(fields));
    hops.push(await hopOf(deps, name, r, t0));
  }
  const final = new URL(r.url);
  const token = final.origin === VIEWER_ORIGIN ? final.searchParams.get('token') : null;
  if (!token) return { hops, outcome: 'no HIS token in the URL the chain ended on' };
  const csrf = r.headers.get('x-csrf-token');
  hops[hops.length - 1].note = 'x-csrf-token header ' + (csrf ? 'present' : 'absent');

  t0 = deps.now();
  const h = await deps.fetch(VIEWER_ORIGIN + '/his?token=' + encodeURIComponent(token), {
    credentials: 'include',
    redirect: 'follow',
    headers: { accept: '*/*', ...(csrf ? { 'X-CSRF-TOKEN': csrf } : {}) },
  });
  hops.push(await hopOf(deps, 'his', h, t0));
  const his = h.ok ? await json(h) : undefined;
  const ids: Json[] = Array.isArray(his?.studyIds) ? his.studyIds : [];
  const granted = ids.find((x) => x?.studyUid === opts.study);
  const study: StudyReport = { hisStudies: ids.length, granted: !!granted, modality: typeof granted?.modality === 'string' ? granted.modality : undefined };
  if (!h.ok) return { hops, outcome: 'his answered ' + h.status, study };
  if (!granted || typeof granted.storageId !== 'string') return { hops, outcome: 'his did not grant the study asked for', study };
  const read = await readStudy(deps, opts.study, granted.storageId, { pixels: opts.pixels, csrf }, hops, study);
  return { hops, outcome: read.outcome, study, thumbnail: read.thumbnail };
}

// ---- Chrome glue: everything below talks to tabs, cookies and the portal. ----

const chromeDeps: ProbeDeps = {
  fetch: (url, init) => fetch(url, init),
  async cookieNames(origin) {
    const host = new URL(origin).hostname;
    return [...new Set((await chrome.cookies.getAll({ domain: host })).map((c) => c.name))].sort();
  },
  now: () => Date.now(),
};

/** Runs in the portal tab: a checksum_id anywhere in the page's own storage, and where it was. */
function checksumInPage(): { value: string; from: string } | null {
  const find = (v: unknown, depth: number): string | null => {
    if (!v || typeof v !== 'object' || depth > 8) return null;
    for (const [k, x] of Object.entries(v)) {
      if (k === 'checksum_id' && typeof x === 'string' && /^[A-Za-z0-9]{1,128}$/.test(x)) return x;
      const f = find(x, depth + 1);
      if (f) return f;
    }
    return null;
  };
  for (const [name, store] of [['sessionStorage', sessionStorage], ['localStorage', localStorage]] as const) {
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i)!;
      let parsed: unknown;
      try {
        parsed = JSON.parse(store.getItem(key) || '');
      } catch {
        continue;
      }
      const value = find(parsed, 0);
      if (value) return { value, from: name + ':' + key };
    }
  }
  return null;
}

/**
 * The member's checksum_id, the handoff's fourth input. The page's own storage first. The only
 * other source known is TokenServerAPI .../token/full, which also returns a session token -- the kind
 * of call the repo's rules keep out of the extension -- so it is asked only when the caller passes
 * tokenFull: true, and never from anything but this development probe.
 */
async function checksum(tabId: number, jwt: string | null, tokenFull: boolean): Promise<{ value: string | null; from: string }> {
  const [res] = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: checksumInPage });
  const inPage = res?.result as { value: string; from: string } | null | undefined;
  if (inPage) return inPage;
  if (!tokenFull) return { value: null, from: 'not in the page storage; pass tokenFull: true to ask TokenServerAPI' };
  const r = await extensionFetch({
    url: '/sonline/TokenServerAPI/webapi/mac/v4/members/token/full?checksum=&sr_id=',
    method: 'GET',
    redirect: 'manual',
    headers: { Authorization: 'Bearer ' + jwt },
  });
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(r.bytes));
  } catch {
    /* reported below */
  }
  const value = findChecksum((parsed as Json)?.current_customer_info) ?? findChecksum(parsed);
  return { value, from: 'TokenServerAPI token/full (HTTP ' + r.status + ')' };
}

/** The member's imaging_study rows, from the list the export already reads. Their request_id is the study UID. */
async function imagingStudies(mid: string, jwt: string | null): Promise<string[]> {
  const r = await extensionFetch({
    url: '/sonline/TestResultsAPI/webapi/mac/v1/members/0/' + mid + '/tests',
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jwt },
    body: JSON.stringify({ members: [], categories: [] }),
  });
  if (r.status !== 200) throw new Error('the test list answered ' + r.status);
  const data = JSON.parse(new TextDecoder().decode(r.bytes));
  const tests: Json[] = data?.data?.tests ?? data?.tests ?? [];
  return tests.filter((t) => t?.type === 'imaging_study' && t.request_id).map((t) => String(t.request_id));
}

async function portalStillAnswers(mid: string, jwt: string | null): Promise<number> {
  const r = await extensionFetch({
    url: '/sonline/MainAppAPI/webapi/mac/v1/members/0/' + mid,
    method: 'GET',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jwt },
  });
  return r.status;
}

async function clearViewerCookies(): Promise<number> {
  const all = await chrome.cookies.getAll({ domain: new URL(VIEWER_ORIGIN).hostname });
  for (const c of all) {
    await chrome.cookies.remove({ url: 'https://' + c.domain.replace(/^\./, '') + c.path, name: c.name, storeId: c.storeId });
  }
  return all.length;
}

/** Resolves when the tab has finished loading a page on `origin`; records every URL it passed through. */
function settleOn(tabId: number, origin: string, seen: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('the tab did not settle on ' + origin + ' within ' + timeoutMs / 1000 + ' s'));
    }, timeoutMs);
    function listener(id: number, info: chrome.tabs.OnUpdatedInfo, tab: chrome.tabs.Tab) {
      if (id !== tabId) return;
      if (info.url && seen[seen.length - 1] !== where(info.url)) seen.push(where(info.url));
      if (info.status === 'complete' && tab.url && new URL(tab.url).origin === origin) {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

function goInPage(url: string): void {
  location.assign(url);
}

/** Runs in the viewer tab: the storageId its own requests used, and what the viewer page asked for. */
function viewerRequestsInPage(): { storageId: string | null; requests: string[] } {
  const names = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.startsWith(location.origin));
  let storageId: string | null = null;
  const requests: string[] = [];
  for (const n of names) {
    const u = new URL(n);
    storageId = storageId ?? u.searchParams.get('storageId');
    const path = u.pathname.split('/').map((s) => (/^\d+(\.\d+)+$/.test(s) ? '<uid>' : s.length > 40 ? '<long>' : s)).join('/');
    const keys = [...new Set(u.searchParams.keys())];
    const line = path + (keys.length ? '?' + keys.join('&') : '');
    if (!requests.includes(line)) requests.push(line);
  }
  return { storageId, requests: requests.slice(0, 40) };
}

/**
 * Tab mode: Chrome runs the chain, from a background tab on the results lobby so the portal hop
 * carries the Referer and cookies a real click would. The viewer's reads are then sent from the
 * extension, with whatever cookies the chain left in the browser.
 */
async function tabProbe(opts: { handoff: string; study: string; pixels: boolean; keepTab: boolean; waitMs: number }): Promise<ProbeResult & { thumbnail?: Uint8Array; tabUrls: string[]; viewerRequests?: string[] }> {
  const hops: Hop[] = [];
  const seen: string[] = [];
  const t0 = Date.now();
  const tab = await chrome.tabs.create({ url: LOBBY, active: false });
  const tabId = tab.id!;
  try {
    await settleOn(tabId, MACCABI_ORIGIN, seen, 60_000);
    // Give the lobby's own script its token before leaving it, as a person clicking would.
    await new Promise((r) => setTimeout(r, 3000));
    const onViewer = settleOn(tabId, VIEWER_ORIGIN, seen, 90_000);
    await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: goInPage, args: [opts.handoff] });
    try {
      await onViewer;
    } catch (e) {
      return { hops, outcome: (e as Error).message, tabUrls: seen };
    }
    hops.push({ hop: 'tab chain', at: seen[seen.length - 1], cookies: { login: await chromeDeps.cookieNames(LOGIN_ORIGIN), viewer: await chromeDeps.cookieNames(VIEWER_ORIGIN) }, ms: Date.now() - t0 });
    // The viewer's SPA calls /his and /studies itself once it has loaded.
    await new Promise((r) => setTimeout(r, opts.waitMs));
    const [res] = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: viewerRequestsInPage });
    const page = res?.result as { storageId: string | null; requests: string[] } | undefined;
    if (!page?.storageId) return { hops, outcome: 'the viewer page made no request carrying a storageId', tabUrls: seen, viewerRequests: page?.requests };
    const study: StudyReport = {};
    const read = await readStudy(chromeDeps, opts.study, page.storageId, { pixels: opts.pixels }, hops, study);
    return { hops, outcome: read.outcome, study, thumbnail: read.thumbnail, tabUrls: seen, viewerRequests: page.requests };
  } finally {
    if (!opts.keepTab) await chrome.tabs.remove(tabId).catch(() => undefined);
  }
}

export interface ProbeOptions {
  /** 'fetch' (default), 'tab', or 'both' (fetch first, then tab, each from fresh viewer cookies). */
  mode?: 'fetch' | 'tab' | 'both';
  /** Which of the member's imaging studies, by position in the test list (default 0). */
  study?: number;
  /** Also read the first image's raw pixels (default true). */
  pixels?: boolean;
  /** Delete the viewer host's cookies before each attempt (default true); false repeats a run on the cookies the last one left. */
  fresh?: boolean;
  /** Allow asking TokenServerAPI for checksum_id if the page's storage does not hold it. */
  tokenFull?: boolean;
  /** Save the first image's thumbnail to Downloads, to see it is the scan (default false). */
  download?: boolean;
  /** Leave the tab-mode tab open for a look at the viewer (default false). */
  keepTab?: boolean;
  /** How long tab mode lets the viewer page load its own study before reading (default 8000 ms). */
  waitMs?: number;
}

export async function imagingProbe(tabId: number, o: ProbeOptions): Promise<Json> {
  const started = Date.now();
  const s = sessionOf(await snapshot(tabId));
  if (!s.mid || !s.jwt) return { outcome: 'open a Maccabi Online /sonline/ page while logged in, then run this from its console' };
  const claims = jwtClaims(s.jwt);
  const studies = await imagingStudies(s.mid, s.jwt);
  const index = o.study ?? 0;
  if (!studies[index]) return { outcome: 'no imaging_study row at index ' + index, imagingStudies: studies.length };
  const cs = await checksum(tabId, s.jwt, !!o.tokenFull);
  if (!cs.value) return { outcome: 'no checksum_id', checksumFrom: cs.from, imagingStudies: studies.length };
  const handoff = handoffUrl(s.mid, cs.value, studies[index]);
  const opts = { handoff, study: studies[index], pixels: o.pixels ?? true };
  const modes = o.mode === 'both' ? (['fetch', 'tab'] as const) : [o.mode ?? 'fetch'];
  const runs: Record<string, Json> = {};
  let thumbnail: Uint8Array | undefined;
  for (const mode of modes) {
    const cleared = o.fresh === false ? null : await clearViewerCookies();
    try {
      const r = mode === 'tab'
        ? await tabProbe({ ...opts, keepTab: !!o.keepTab, waitMs: o.waitMs ?? 8000 })
        : await fetchProbe(chromeDeps, opts);
      thumbnail = thumbnail ?? r.thumbnail;
      const { thumbnail: _t, ...report } = r;
      runs[mode] = { viewerCookiesCleared: cleared, ...report };
    } catch (e) {
      runs[mode] = { viewerCookiesCleared: cleared, outcome: 'threw: ' + (e instanceof Error ? e.message : String(e)) };
    }
  }
  if (o.download && thumbnail) {
    let bin = '';
    for (const b of thumbnail) bin += String.fromCharCode(b);
    await chrome.downloads.download({ url: 'data:image/jpeg;base64,' + btoa(bin), filename: 'imaging-probe-thumbnail.jpg', conflictAction: 'uniquify' });
  }
  return {
    imagingStudies: studies.length,
    studyIndex: index,
    checksumFrom: cs.from,
    tokenExpiresInS: typeof claims?.exp === 'number' ? Math.round(claims.exp - Date.now() / 1000) : null,
    runs,
    portalAfter: await portalStillAnswers(s.mid, s.jwt),
    ms: Date.now() - started,
    chrome: navigator.userAgent.match(/Chrome\/[\d.]+/)?.[0] ?? null,
  };
}
