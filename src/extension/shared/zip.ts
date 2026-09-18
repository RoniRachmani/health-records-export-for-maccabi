/* Building the export ZIP: every staged file under one root folder. Kept apart from the offscreen
   document's message plumbing so the archive's layout can be tested without a browser. */
import { Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import { extOf } from '../../core';

// Already-compressed formats are stored as they are.
const STORED = new Set(['.pdf', '.zip', '.jpg', '.jpeg', '.png', '.gif', '.docx', '.xlsx']);

/**
 * The ZIP's bytes, as the chunks fflate emits. rels are added in the order given, each as
 * `<root>/<rel>`; read() supplies one file's bytes at a time, so the whole export is never held
 * in memory twice. A rel whose bytes are missing is left out. Hebrew names need nothing extra:
 * fflate flags an entry UTF-8 when its name has non-ASCII bytes.
 */
export async function zipChunks(
  root: string,
  rels: string[],
  read: (rel: string) => Promise<Uint8Array | undefined>,
  mtime = new Date(),
): Promise<{ chunks: Uint8Array[]; files: number }> {
  const chunks: Uint8Array[] = [];
  let files = 0;
  let failed: Error | null = null;
  const finished = new Promise<void>((resolve, reject) => {
    const zip = new Zip((err, chunk, final) => {
      if (err) {
        failed = err;
        reject(err);
        return;
      }
      chunks.push(chunk);
      if (final) resolve();
    });
    (async () => {
      for (const rel of rels) {
        if (failed) return;
        const bytes = await read(rel);
        if (!bytes) continue;
        const name = root + '/' + rel;
        const entry = STORED.has(extOf(rel)) ? new ZipPassThrough(name) : new ZipDeflate(name, { level: 6 });
        entry.mtime = mtime;
        zip.add(entry);
        entry.push(bytes, true);
        files++;
      }
      zip.end();
    })().catch(reject);
  });
  await finished;
  return { chunks, files };
}
