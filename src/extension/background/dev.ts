/* Development build only (npm run dev / build:dev): commands sent from the
   Maccabi page through the dev bridge content script, so a run can be driven
   and inspected without clicking the popup. Compiled out of the store build.
   Replies carry statuses, sizes and counts -- never record contents. */
import { jwtClaims, type Json } from '../../core';
import { getFile, listMeta, listProblems } from '../shared/staging';
import { imagingProbe, type ProbeOptions } from './imagingProbe';
import { cancel, dismiss, loadRun, resume, retrySave, start } from './runner';
import { rawDumpOn, setRawDump } from './rawDump';
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
      return {
        run: run && { ...run, problems: run.problems?.length },
        routes: await currentRoutes(),
        staged: { files: metas.length, bytes: metas.reduce((a, m) => a + m.size, 0), perFolder },
        problems: (await listProblems()).length,
        tab: { hasMid: !!s.mid, hasJwt: !!s.jwt, jwtExpiresInS: claims?.exp ? Math.round(claims.exp - Date.now() / 1000) : null },
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
    case 'dev:problems':
      return (await listProblems()).map((p) => p.step + ' | ' + p.where + ' | ' + p.what);
    case 'dev:start':
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
    case 'dev:imagingProbe':
      // Experiment: can the extension reach the imaging viewer? See docs/imaging-experiment.md.
      return imagingProbe(tabId, msg as unknown as ProbeOptions);
    case 'dev:reload':
      setTimeout(() => chrome.runtime.reload(), 100);
      return { ok: true };
    case 'dev:stopBefore':
      // The run pauses before this plan step, e.g. to test Resume without ordering the medical file.
      if (msg.step) await chrome.storage.local.set({ devStopBefore: msg.step });
      else await chrome.storage.local.remove('devStopBefore');
      return { ok: true };
    case 'dev:rawDump':
      // Every response of the next run is staged under _raw/ in the ZIP, byte for byte, beside
      // the export itself. Set it before dev:start: it is read once per step.
      await setRawDump(!!msg.on);
      return { on: await rawDumpOn() };
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
