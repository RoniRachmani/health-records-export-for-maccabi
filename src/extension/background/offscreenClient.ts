/* The offscreen document does what a service worker can't: DOMParser for the
   two legacy HTML responses, and a blob: URL for the finished ZIP. */
import type { HtmlParser } from '../../core';
import type { OffscreenReply, OffscreenRequest } from '../shared/offscreenProtocol';

const PATH = 'src/extension/offscreen/offscreen.html';
let creating: Promise<void> | null = null;

async function ensure(): Promise<void> {
  const url = chrome.runtime.getURL(PATH);
  const contexts = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT], documentUrls: [url] });
  if (contexts.length) return;
  if (!creating) {
    creating = chrome.offscreen
      .createDocument({
        url: PATH,
        reasons: [chrome.offscreen.Reason.DOM_PARSER, chrome.offscreen.Reason.BLOBS],
        justification: 'Parse two HTML tables from the Maccabi Healthcare Services site and build the export ZIP as a downloadable blob.',
      })
      .finally(() => {
        creating = null;
      });
  }
  await creating;
}

export async function callOffscreen<T extends OffscreenReply>(req: OffscreenRequest): Promise<T> {
  await ensure();
  const res = (await chrome.runtime.sendMessage({ target: 'offscreen', ...req })) as T | { error: string } | undefined;
  if (!res) throw new Error('no reply from the offscreen document');
  if ('error' in res && res.error) throw new Error(res.error);
  return res as T;
}

export async function closeOffscreen(): Promise<void> {
  try {
    await chrome.offscreen.closeDocument();
  } catch {
    /* not open */
  }
}

export const offscreenHtml: HtmlParser = {
  async purchaseTable(html) {
    return callOffscreen<{ cols: number }>({ type: 'purchaseTable', html });
  },
  async phrGrid(html) {
    return callOffscreen<{ ids: string[]; openArgs: string[] }>({ type: 'phrGrid', html });
  },
};
