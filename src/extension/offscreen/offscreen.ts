import { domHtmlParser } from '../../core';
import type { OffscreenRequest } from '../shared/offscreenProtocol';
import { getFile, listMeta } from '../shared/staging';
import { zipChunks } from '../shared/zip';

const html = domHtmlParser();

async function zipStaged(root: string): Promise<{ url: string; bytes: number; files: number }> {
  const rels = (await listMeta()).map((m) => m.rel).sort();
  const { chunks, files } = await zipChunks(root, rels, getFile);
  const blob = new Blob(chunks as BlobPart[], { type: 'application/zip' });
  return { url: URL.createObjectURL(blob), bytes: blob.size, files };
}

chrome.runtime.onMessage.addListener((msg: OffscreenRequest & { target?: string }, _sender, reply) => {
  if (msg.target !== 'offscreen') return false;
  (async () => {
    switch (msg.type) {
      case 'purchaseTable':
        return html.purchaseTable(msg.html);
      case 'phrGrid':
        return html.phrGrid(msg.html);
      case 'zip':
        return zipStaged(msg.root);
      case 'revoke':
        URL.revokeObjectURL(msg.url);
        return { ok: true };
    }
  })().then(reply, (e: unknown) => reply({ error: e instanceof Error ? e.message : String(e) }));
  return true;
});
