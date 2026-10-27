/* The write rules every Sink keeps, run against each of the three: the fake the collector's tests use, the
   IndexedDB staging the extension ships (on fake-indexeddb), and the folder the terminal export writes. The
   collector is tested against the fake alone, so this is what says the other two behave the same. */
import 'fake-indexeddb/auto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { sha256Hex, type Sink } from '../src/core';
import * as core from '../src/cli/index';
import {
  clearProblemsOfStep, clearStaging, getFile, listMeta, listProblems, putBinDirect, putTextDirect, setCurrentPart, setCurrentStep, stagedTotals, stagingSink,
} from '../src/extension/shared/staging';
import { folderSink } from '../scripts/headless-lib.mjs';
import { MemorySink } from './fakes';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const sinks: [string, () => Promise<Sink>][] = [
  ['MemorySink', async () => new MemorySink()],
  [
    'stagingSink',
    async () => {
      await clearStaging();
      setCurrentStep('visits');
      return stagingSink;
    },
  ],
  [
    'folderSink',
    async () => {
      const dir = mkdtempSync(join(tmpdir(), 'sink-'));
      dirs.push(dir);
      return folderSink(core, dir, '0.0.0');
    },
  ],
];

const bytes = (...b: number[]) => new Uint8Array(b);

describe.each(sinks)('%s', (_name, make) => {
  it('writes JSON once, leaves the same content alone in any key order, and rewrites a change', async () => {
    const s = await make();
    expect(await s.exists('visits/a.json')).toBe(false);
    expect(await s.putJson('visits/a.json', { a: 1, b: [2] })).toEqual({ result: 'written' });
    expect(await s.exists('visits/a.json')).toBe(true);
    expect(await s.putJson('visits/a.json', { b: [2], a: 1 })).toEqual({ result: 'unchanged' });
    expect(await s.putJson('visits/a.json', { a: 2, b: [2] })).toEqual({ result: 'updated' });
  });

  it('reads back the JSON it wrote, and nothing for a file that is missing or is not JSON', async () => {
    const s = await make();
    expect(await s.readJson('visits/a.json')).toBeUndefined();
    await s.putJson('visits/a.json', { a: 1, b: ['ב'] });
    expect(await s.readJson('visits/a.json')).toEqual({ a: 1, b: ['ב'] });
    await s.putBin('visits/b.json', bytes(0x25, 0x50, 0x44, 0x46), false);
    expect(await s.readJson('visits/b.json')).toBeUndefined();
  });

  it('keeps a document unless replace is asked, and replaces it only when the bytes differ', async () => {
    const s = await make();
    expect(await s.putBin('visits/a.pdf', bytes(1, 2, 3), false)).toEqual({ result: 'written' });
    expect(await s.putBin('visits/a.pdf', bytes(9), false)).toEqual({ result: 'kept_existing' });
    expect(await s.putBin('visits/a.pdf', bytes(1, 2, 3), true)).toEqual({ result: 'unchanged' });
    expect(await s.putBin('visits/a.pdf', bytes(4, 5), true)).toEqual({ result: 'updated' });
  });

  it('refuses a path that could leave the export, and writes nothing', async () => {
    const s = await make();
    for (const rel of ['', '/abs.json', '../up.json', 'a//b.json', 'a/./b.json', 'a\\b.json']) {
      expect((await s.putJson(rel, {})).error).toMatch(/bad path/);
      expect((await s.putBin(rel, bytes(1), true)).error).toMatch(/bad path/);
    }
    expect(await s.exists('up.json')).toBe(false);
  });

  it("finds a document by its bytes' SHA-256, and only by its current bytes", async () => {
    const s = await make();
    const first = await sha256Hex(bytes(1, 2, 3));
    const second = await sha256Hex(bytes(4, 5));
    expect(await s.findBySha256(first)).toBeNull();
    await s.putBin('visits/a.pdf', bytes(1, 2, 3), false);
    expect(await s.findBySha256(first)).toBe('visits/a.pdf');
    // Kept, not replaced: the digest still names it.
    await s.putBin('visits/a.pdf', bytes(4, 5), false);
    expect(await s.findBySha256(first)).toBe('visits/a.pdf');
    expect(await s.findBySha256(second)).toBeNull();
    // A regenerated document: the old digest no longer names it.
    await s.putBin('visits/a.pdf', bytes(4, 5), true);
    expect(await s.findBySha256(first)).toBeNull();
    expect(await s.findBySha256(second)).toBe('visits/a.pdf');
  });

  it('does not index JSON records by content', async () => {
    const s = await make();
    await s.putJson('visits/a.json', { a: 1 });
    expect(await s.findBySha256(await sha256Hex(core.jsonBytes({ a: 1 })))).toBeNull();
  });

  it('remembers which document was a copy of which', async () => {
    const s = await make();
    await s.putBin('visits/a.pdf', bytes(1), false);
    expect(await s.aliasOf('inquiries/b.pdf')).toBeNull();
    await s.putAlias('inquiries/b.pdf', 'visits/a.pdf');
    expect(await s.aliasOf('inquiries/b.pdf')).toBe('visits/a.pdf');
    // An alias is not a file of its own.
    expect(await s.exists('inquiries/b.pdf')).toBe(false);
  });
});

describe('stagingSink, beyond the contract', () => {
  it('stages the bytes it was given, and counts files and bytes for the popup under the first writer', async () => {
    await clearStaging();
    setCurrentStep('visits');
    setCurrentPart('summaries');
    await stagingSink.putBin('visits/a.pdf', bytes(1, 2, 3), false);
    await stagingSink.putJson('visits/a.json', { a: 1 });
    expect(await getFile('visits/a.pdf')).toEqual(bytes(1, 2, 3));
    const json = core.jsonBytes({ a: 1 });
    expect(await stagedTotals()).toEqual({ files: 2, bytes: 3 + json.length, byKey: { 'visits:summaries': 2 } });

    // A later step that rewrites a file changes its size, not its count or its line.
    setCurrentStep('save');
    await stagingSink.putBin('visits/a.pdf', bytes(4), true);
    expect(await stagedTotals()).toEqual({ files: 2, bytes: 1 + json.length, byKey: { 'visits:summaries': 2 } });
    expect((await listMeta()).find((m) => m.rel === 'visits/a.pdf')).toMatchObject({ size: 1, key: 'visits:summaries', sha256: await sha256Hex(bytes(4)) });
  });

  it('starts empty after clearStaging, digests and aliases included', async () => {
    await clearStaging();
    setCurrentStep('visits');
    await stagingSink.putBin('visits/a.pdf', bytes(1), false);
    await stagingSink.putAlias('inquiries/b.pdf', 'visits/a.pdf');
    await clearStaging();
    expect(await stagingSink.exists('visits/a.pdf')).toBe(false);
    expect(await stagingSink.findBySha256(await sha256Hex(bytes(1)))).toBeNull();
    expect(await stagingSink.aliasOf('inquiries/b.pdf')).toBeNull();
    expect(await stagedTotals()).toEqual({ files: 0, bytes: 0, byKey: {} });
  });

  it('files each problem under its step, and a step that runs again clears only its own', async () => {
    await clearStaging();
    setCurrentStep('visits');
    await stagingSink.problem({ where: 'visits/a.pdf', what: 'HTTP 500', at: 't1' });
    setCurrentStep('referrals');
    await stagingSink.problem({ where: 'referrals', what: 'no list', at: 't2', kind: 'shape' });
    expect(await listProblems()).toEqual([
      { where: 'visits/a.pdf', what: 'HTTP 500', at: 't1', step: 'visits' },
      { where: 'referrals', what: 'no list', at: 't2', kind: 'shape', step: 'referrals' },
    ]);
    await clearProblemsOfStep('visits');
    expect((await listProblems()).map((p) => p.step)).toEqual(['referrals']);
    await clearStaging();
    expect(await listProblems()).toEqual([]);
  });

  it('stages the root files past the write rules, counted under no line, and indexes none of them by content', async () => {
    await clearStaging();
    setCurrentStep('save');
    await putTextDirect('README.md', '# א\n');
    await putTextDirect('README.md', '# ב\n');
    await putBinDirect('_raw/1.pdf', bytes(7, 8));
    expect(new TextDecoder().decode(await getFile('README.md'))).toBe('# ב\n');
    expect(await getFile('_raw/1.pdf')).toEqual(bytes(7, 8));
    expect(await stagedTotals()).toEqual({ files: 2, bytes: new TextEncoder().encode('# ב\n').length + 2, byKey: {} });
    expect(await stagingSink.findBySha256(await sha256Hex(bytes(7, 8)))).toBeNull();
  });
});
