/* Development build only (npm run dev / build:dev): commands sent from the
   Maccabi page through the dev bridge content script, so a run can be driven
   and inspected without clicking the popup. Compiled out of the store build.
   Replies carry statuses, sizes and counts -- never record contents. */
import { apiPath, END_DATE, israelToday, jwtClaims, type Json } from '../../core';
import { canSaveNow } from '../popup/model';
import { LAST_ORDER, type LastOrder } from '../shared/state';
import { getFile, listMeta, listProblems } from '../shared/staging';
import { cancel, dismiss, loadRun, midHash, resume, retrySave, saveNow, start, writeRootFiles } from './runner';
import { rawDumpOn, setRawDump } from './rawDump';
import { mergeShapes, shapeDrift, sortedShapes, type Shapes } from '../shared/shapes';
import { seenShapes, setShapes, shapesOn } from './shapeDump';
import { currentRoutes, extensionFetch, sessionOf, snapshot, tabTransport } from './tab';

type DevMsg = { type: string; [k: string]: Json };

function tabIdOf(sender: chrome.runtime.MessageSender): number {
  if (sender.tab?.id === undefined) throw new Error('dev commands must come from a Maccabi tab');
  return sender.tab.id;
}

async function handleDevImpl(msg: DevMsg, sender: chrome.runtime.MessageSender): Promise<unknown> {
  const tabId = tabIdOf(sender);
  switch (msg.type) {
    case 'dev:state': {
      const metas = await listMeta();
      const perFolder: Record<string, number> = {};
      for (const m of metas) {
        const top = m.rel.split('/')[0];
        perFolder[top] = (perFolder[top] || 0) + 1;
      }
      const s = sessionOf(await snapshot(tabId));
      const claims = jwtClaims(s.jwt);
      const run = await loadRun();
      const dev = await chrome.storage.local.get(['devBlockedOrder', 'devLastNotice']);
      return {
        run: run && { ...run, problems: run.problems?.length },
        routes: await currentRoutes(),
        staged: { files: metas.length, bytes: metas.reduce((a, m) => a + m.size, 0), perFolder },
        problems: (await listProblems()).length,
        tab: { hasMid: !!s.mid, hasJwt: !!s.jwt, jwtExpiresInS: claims?.exp ? Math.round(claims.exp - Date.now() / 1000) : null },
        // Whether the popup shows Save now; the order dev:noSend stopped; what the last "Export ..." notification said.
        saveNowOffered: !!run && canSaveNow(run),
        blockedOrder: dev.devBlockedOrder ?? null,
        lastNotice: dev.devLastNotice ?? null,
      };
    }
    /* Which response fields hold a readable display string, so the *_TITLE candidate lists in
       src/core/sections/ can be filled in from a real account. Key names and their languages
       only -- never a value, so no health data is returned. */
    case 'dev:titleFields': {
      const out: Record<string, Record<string, string>> = {};
      for (const m of await listMeta()) {
        if (!/(^|\/)list\.json$/.test(m.rel)) continue;
        const bytes = await getFile(m.rel);
        if (!bytes) continue;
        let doc: Json;
        try {
          doc = JSON.parse(new TextDecoder().decode(bytes));
        } catch {
          continue;
        }
        // The first record of whichever array the response wraps its list in.
        const data = doc && doc.data;
        const arr = Array.isArray(data) ? data : Object.values(data || {}).find((v) => Array.isArray(v) && v.length);
        const first = Array.isArray(arr) ? arr[0] : undefined;
        if (!first || typeof first !== 'object') continue;
        const fields: Record<string, string> = {};
        for (const k of Object.keys(first)) {
          const v = first[k];
          if (typeof v !== 'string' || !v.trim()) continue;
          fields[k] = /[\u0590-\u05FF]/.test(v) ? 'hebrew' : /[A-Za-z]/.test(v) ? 'latin' : 'other';
        }
        out[m.rel] = fields;
      }
      return out;
    }
    case 'dev:rootFiles': {
      // What the save step would put at the ZIP's root, without the ZIP: the README's opening line (which
      // extension made it), its failed-to-collect and numbers sections, and export-errors.json as problem lines.
      const { readme, errors } = await writeRootFiles();
      const section = (heading: string) => {
        const from = readme.indexOf('## ' + heading);
        return from < 0 ? '' : readme.slice(from, readme.indexOf('\n## ', from + 1)).trim();
      };
      return {
        made: (readme.split('\n\n').find((p) => p.startsWith('Exported')) ?? '').replace(/\s+/g, ' ').replace(/; everything here.*$/, ''),
        failedSection: section('What this export failed to collect'),
        qualitySection: section("This export's records in numbers"),
        errors: errors.map((e) => e.folders.join(',') + ' | ' + e.step + ' | ' + e.where + ' | ' + e.what),
      };
    }
    /* The staged files' paths, sorted: to check how files are named. A name carries its record's title (a
       drug, a specialist, a procedure), so this is the one reply with more than counts; it goes only to the
       terminal of the member whose records they are. */
    case 'dev:names':
      return (await listMeta()).map((m) => m.rel).sort();
    case 'dev:problems': {
      // A finished run's staging is gone: what it filed is on the run, the first 50 of them.
      const staged = await listProblems();
      const problems = staged.length ? staged : ((await loadRun())?.problems ?? []) as typeof staged;
      return problems.map((p) => p.step + ' | ' + p.where + ' | ' + p.what);
    }
    case 'dev:start':
      await chrome.storage.local.remove(['devLastNotice', 'devBlockedOrder']); // what dev:state shows is this run's
      await start(tabId);
      return { ok: true };
    case 'dev:resume':
      await resume(tabId);
      return { ok: true };
    case 'dev:cancel':
      await cancel();
      return { ok: true };
    case 'dev:dismiss':
      await dismiss();
      return { ok: true };
    case 'dev:retrySave':
      await retrySave();
      return { ok: true };
    case 'dev:breakSession': {
      // Simulates an ended session: the run's stored token stops working.
      const s = (await chrome.storage.session.get('session')).session as Json;
      if (!s) throw new Error('no session stored');
      await chrome.storage.session.set({ session: { ...s, jwt: 'invalid.' + btoa('{}') + '.token' } });
      return { ok: true };
    }
    case 'dev:reload':
      setTimeout(() => chrome.runtime.reload(), 100);
      return { ok: true };
    case 'dev:stopBefore':
      // The run pauses before this plan step, e.g. to test Resume without ordering the medical file.
      if (msg.step) await chrome.storage.local.set({ devStopBefore: msg.step });
      else await chrome.storage.local.remove('devStopBefore');
      return { ok: true };
    case 'dev:skipOrder':
      // orderMedicalFile does nothing while this is on, so a test run never orders the file or sends an SMS.
      if (msg.on) await chrome.storage.local.set({ devSkipOrder: true });
      else await chrome.storage.local.remove('devSkipOrder');
      return { on: !!msg.on };
    case 'dev:pretendOrder':
      // The order step records an order to `toDate` (default today in Israel) as sent and confirmed, sending nothing
      // and writing no LAST_ORDER, so the wait polls and offers Save now. Pick a day the list has no file for.
      if (msg.on) await chrome.storage.local.set({ devPretendOrder: String(msg.toDate || israelToday(Date.now())) });
      else await chrome.storage.local.remove('devPretendOrder');
      return { on: !!msg.on, toDate: (await chrome.storage.local.get('devPretendOrder')).devPretendOrder ?? null };
    case 'dev:noSend':
      // The order step decides as a real run's would, even under dev:skipOrder, but its beforeSend throws before
      // anything is sent or recorded as sent; the run files a problem and dev:state's blockedOrder says what it stopped.
      await chrome.storage.local.remove('devBlockedOrder');
      if (msg.on) await chrome.storage.local.set({ devNoSend: true });
      else await chrome.storage.local.remove('devNoSend');
      return { on: !!msg.on };
    case 'dev:saveNow': {
      // What the popup's Save now does, only while the popup would offer it.
      const run = await loadRun();
      const offered = !!run && canSaveNow(run);
      if (offered) await saveNow();
      return { offered };
    }
    case 'dev:medicalFileDates': {
      // The medical file the site lists now: its status and dates, nothing else.
      const s = sessionOf(await snapshot(tabId));
      const r = await extensionFetch({
        url: apiPath('DirectorshipAPI/v1/members/0/{mid}/letters_for_member?from_date=1900-01-01&to_date=' + END_DATE, s.mid),
        method: 'GET', redirect: 'manual', headers: { Authorization: 'Bearer ' + s.jwt },
      });
      let listed: Json = null;
      try {
        const letters = JSON.parse(new TextDecoder().decode(r.bytes))?.letters;
        const x = Array.isArray(letters) ? letters.find((l) => l && l.letter_type === 2) : undefined;
        if (x) listed = { status: x.status ?? null, to_date: x.to_date ?? null, from_date: x.from_date ?? null, hasLink: !!x.link };
      } catch {
        /* not JSON: listed stays null, with the status beside it */
      }
      return { http: r.status, today: israelToday(Date.now()), listed };
    }
    /* LAST_ORDER, which decides whether a new run orders. `saved` is the stored value as it is, for the caller to hand
       back to dev:setLastOrder {restore}; `shown` replaces its member hash with whose it is, for printing. */
    case 'dev:getLastOrder': {
      const last = (await chrome.storage.local.get(LAST_ORDER))[LAST_ORDER] as LastOrder | undefined;
      const mine = !!last && last.memberHash === (await midHash(sessionOf(await snapshot(tabId)).mid));
      return { saved: last ?? null, shown: last ? { ...last, memberHash: mine ? 'this member' : 'another member' } : null };
    }
    case 'dev:setLastOrder': {
      // {restore}: put back what dev:getLastOrder saved (null removes it). {order, agoMinutes}: an order for the member
      // logged in to this tab, on order.day (default today), sent agoMinutes ago.
      if ('restore' in msg) {
        if (msg.restore) await chrome.storage.local.set({ [LAST_ORDER]: msg.restore });
        else await chrome.storage.local.remove(LAST_ORDER);
        return { ok: true };
      }
      const o = (msg.order ?? {}) as Partial<LastOrder>;
      const last: LastOrder = {
        ...o,
        day: o.day ?? israelToday(Date.now()),
        memberHash: await midHash(sessionOf(await snapshot(tabId)).mid),
        at: new Date(Date.now() - Number(msg.agoMinutes ?? 0) * 60000).toISOString(),
        confirmed: !!o.confirmed,
      };
      await chrome.storage.local.set({ [LAST_ORDER]: last });
      return { ok: true };
    }
    case 'dev:reorder':
      // orderMedicalFile orders even when a file from today over the same range is ready, so a real order
      // can be timed on a day that already has one. It still orders only in a run the member started.
      if (msg.on) await chrome.storage.local.set({ devReorder: true });
      else await chrome.storage.local.remove('devReorder');
      return { on: !!msg.on };
    case 'dev:rawDump':
      // Every response of the next run is staged under _raw/ in the ZIP, byte for byte, beside
      // the export itself. Set it before dev:start: it is read once per step.
      await setRawDump(!!msg.on);
      return { on: await rawDumpOn() };
    case 'dev:shapes':
      // The field names and types of every answer of the next run. Set it before dev:start, as with dev:rawDump.
      await setShapes(!!msg.on);
      return { on: await shapesOn() };
    case 'dev:shapesSeen': {
      // Given the committed snapshot: what this run showed that it has not, and the two merged.
      const seen = await seenShapes();
      const known = (msg.known ?? {}) as Shapes;
      return { endpoints: Object.keys(seen).length, drift: shapeDrift(known, seen), merged: sortedShapes(mergeShapes(known, seen)) };
    }
    case 'dev:routes':
      if (msg.routes) await chrome.storage.local.set({ routes: msg.routes });
      else await chrome.storage.local.remove('routes');
      return { ok: true };
    case 'dev:spike': {
      // One request, sent by the extension or by the page, with or without the Bearer token.
      const s = sessionOf(await snapshot(tabId));
      const url = String(msg.url).split('{mid}').join(s.mid ?? '');
      const headers: Record<string, string> = { ...(msg.headers || {}) };
      if (msg.auth) headers.Authorization = 'Bearer ' + s.jwt;
      const req = { url, method: msg.method || 'GET', headers, body: msg.body, redirect: msg.redirect || 'follow' };
      const t0 = Date.now();
      try {
        const r = msg.route === 'tab' ? await tabTransport(tabId, async () => undefined).fetch(req) : await extensionFetch(req);
        const head = new TextDecoder().decode(r.bytes.slice(0, 5));
        let shape: Json = null;
        if (/json/.test(r.contentType)) {
          try {
            const j = JSON.parse(new TextDecoder().decode(r.bytes));
            shape = Array.isArray(j) ? 'array(' + j.length + ')' : j && typeof j === 'object' ? Object.keys(j).slice(0, 12) : typeof j;
          } catch {
            shape = 'invalid json';
          }
        }
        return { route: msg.route, status: r.status, redirected: r.redirected, contentType: r.contentType, bytes: r.bytes.length, pdf: head === '%PDF-', shape, ms: Date.now() - t0 };
      } catch (e) {
        return { route: msg.route, error: e instanceof Error ? e.message : String(e), ms: Date.now() - t0 };
      }
    }
  }
  return { error: 'unknown dev command ' + msg.type };
}

export const handleDev: ((msg: DevMsg, sender: chrome.runtime.MessageSender) => Promise<unknown>) | null = __DEV_BRIDGE__ ? handleDevImpl : null;
