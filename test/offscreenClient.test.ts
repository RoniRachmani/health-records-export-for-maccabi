// The service worker's side of the offscreen document (src/extension/background/offscreenClient.ts): it opens the
// document once however many ask at the same time, passes requests and errors through, and never opens it just to
// let go of a blob. chrome.offscreen and chrome.runtime are faked; the document's own side is offscreen.ts.
import { beforeEach, describe, expect, it, vi } from 'vitest';

let open: boolean;
let created: number;
let sent: unknown[];
let reply: (msg: { type: string }) => unknown;

beforeEach(() => {
  vi.resetModules();
  open = false;
  created = 0;
  sent = [];
  reply = (msg) => (msg.type === 'purchaseTable' ? { cols: 3 } : { ok: true });
  vi.stubGlobal('chrome', {
    runtime: {
      ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' },
      getURL: (path: string) => 'chrome-extension://id/' + path,
      getContexts: async () => (open ? [{}] : []),
      sendMessage: async (msg: { type: string }) => {
        sent.push(msg);
        return reply(msg);
      },
    },
    offscreen: {
      Reason: { DOM_PARSER: 'DOM_PARSER', BLOBS: 'BLOBS' },
      createDocument: async () => {
        created++;
        await Promise.resolve();
        open = true;
      },
      closeDocument: async () => {
        if (!open) throw new Error('No current offscreen document.');
        open = false;
      },
    },
  });
});

const client = () => import('../src/extension/background/offscreenClient');

describe('the offscreen client', () => {
  it('opens the document once for requests that arrive together, and addresses each to it', async () => {
    const { offscreenHtml } = await client();
    const answers = await Promise.all([offscreenHtml.purchaseTable('<table>'), offscreenHtml.purchaseTable('<table>')]);
    expect(answers).toEqual([{ cols: 3 }, { cols: 3 }]);
    expect(created).toBe(1);
    expect(sent).toEqual([
      { target: 'offscreen', type: 'purchaseTable', html: '<table>' },
      { target: 'offscreen', type: 'purchaseTable', html: '<table>' },
    ]);
    reply = () => ({ ids: ['1'], openArgs: ['a'] });
    expect(await offscreenHtml.phrGrid('<div>')).toEqual({ ids: ['1'], openArgs: ['a'] });
    expect(created).toBe(1);
  });

  it("throws the document's error, and says so when nothing answers", async () => {
    const { callOffscreen } = await client();
    reply = () => ({ error: 'no table in the page' });
    await expect(callOffscreen({ type: 'purchaseTable', html: '' })).rejects.toThrow('no table in the page');
    reply = () => undefined;
    await expect(callOffscreen({ type: 'zip', root: 'x' })).rejects.toThrow('no reply from the offscreen document');
  });

  it('lets go of a blob only in an open document, and closing one that is not open is not an error', async () => {
    const { closeOffscreen, revokeBlob } = await client();
    await revokeBlob('blob:x');
    expect(created).toBe(0);
    expect(sent).toEqual([]);
    open = true;
    await revokeBlob('blob:x');
    expect(sent).toEqual([{ target: 'offscreen', type: 'revoke', url: 'blob:x' }]);
    reply = () => ({ error: 'gone' });
    await revokeBlob('blob:y');
    await closeOffscreen();
    await closeOffscreen();
    expect(open).toBe(false);
  });
});
