import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { zipChunks } from '../src/extension/shared/zip';

const HEBREW = 'test-results/files/2026-01-05_555_ספירת-דם.pdf';

function files(rels: Record<string, string>) {
  return async (rel: string) => (rel in rels ? new TextEncoder().encode(rels[rel]) : undefined);
}

function open(chunks: Uint8Array[]) {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const all = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.length;
  }
  return unzipSync(all);
}

describe('zipChunks', () => {
  it('puts every file under one root folder, at its own path', async () => {
    const { chunks, files: n } = await zipChunks('maccabi-export-2026-09-18', ['a/list.json', 'a/files/x.pdf'],
      files({ 'a/list.json': '{}', 'a/files/x.pdf': '%PDF-1.4' }));
    expect(n).toBe(2);
    expect(Object.keys(open(chunks)).sort()).toEqual([
      'maccabi-export-2026-09-18/a/files/x.pdf',
      'maccabi-export-2026-09-18/a/list.json',
    ]);
  });

  it('round-trips a Hebrew entry name', async () => {
    const { chunks } = await zipChunks('root', [HEBREW], files({ [HEBREW]: '%PDF-1.4' }));
    const out = open(chunks);
    expect(Object.keys(out)).toEqual(['root/' + HEBREW]);
    expect(new TextDecoder().decode(out['root/' + HEBREW])).toBe('%PDF-1.4');
  });

  it('leaves out a path whose bytes are gone, and says how many it wrote', async () => {
    const { chunks, files: n } = await zipChunks('root', ['kept.json', 'missing.json'], files({ 'kept.json': '{}' }));
    expect(n).toBe(1);
    expect(Object.keys(open(chunks))).toEqual(['root/kept.json']);
  });
});
