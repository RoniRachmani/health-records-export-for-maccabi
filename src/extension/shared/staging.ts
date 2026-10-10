/* Staged export files, in the extension's IndexedDB. The background run writes
   here as it goes; the offscreen document reads it to build the ZIP. A paused
   run keeps its files here until it is resumed, saved or cancelled. */
import { badPath, binResult, jsonBytes, jsonResult, sha256Hex, type Problem, type SaveReply, type Sink } from '../../core';

const DB_NAME = 'hrem-staging';
// 2 added the content index and the aliases (Sink.findBySha256, putAlias).
const DB_VERSION = 2;

export interface FileMeta {
  rel: string;
  size: number;
  sha256: string;
  /** The step, or `step:part`, that first wrote the file (stagingKey); none for files staged past the sink or by an older version. */
  key?: string;
}

/** What the popup counts a file under: the plan step, and the part of it as the collector's progress names it. */
export function stagingKey(step: string, part: string): string {
  return part ? step + ':' + part : step;
}

/**
 * The key a write leaves on a file: the first writer's. A re-run step that rewrites a file, or a later step that
 * updates one, does not move it to another line of the popup's list.
 */
export function keyAfterWrite(prev: FileMeta | undefined, key: string | undefined): string | undefined {
  return prev ? prev.key : key;
}

/** Staged files per key; files without one count nowhere. */
export function countByKey(metas: FileMeta[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const m of metas) if (m.key) counts[m.key] = (counts[m.key] ?? 0) + 1;
  return counts;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        const add = (name: string, opts?: IDBObjectStoreParameters) => {
          if (!d.objectStoreNames.contains(name)) d.createObjectStore(name, opts);
        };
        add('files'); // rel -> Uint8Array
        add('meta', { keyPath: 'rel' }); // FileMeta
        add('problems', { autoIncrement: true }); // Problem
        // Only what stagingSink.putBin writes, not meta's every file: _raw/ holds a copy of each download.
        add('shas'); // sha256 -> rel
        add('aliases'); // rel -> the rel holding its bytes
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getFile(rel: string): Promise<Uint8Array | undefined> {
  const tx = (await db()).transaction('files');
  return request(tx.objectStore('files').get(rel) as IDBRequest<Uint8Array | undefined>);
}

export interface StagedTotals {
  files: number;
  bytes: number;
  byKey: Record<string, number>;
}

/** Files and bytes staged, for the popup. Loaded from the meta store once, then kept up to date by writes. */
let totals: StagedTotals | null = null;

/** Stages a file, and returns its SHA-256 (hex), which its meta records. */
async function putFile(rel: string, bytes: Uint8Array, key?: string): Promise<string> {
  const meta: FileMeta = { rel, size: bytes.length, sha256: await sha256Hex(bytes) };
  const tx = (await db()).transaction(['files', 'meta'], 'readwrite');
  const metaStore = tx.objectStore('meta');
  let prev: FileMeta | undefined;
  // The meta is put once the file it replaces has been read, in the same transaction: it keeps that one's key.
  (metaStore.get(rel) as IDBRequest<FileMeta | undefined>).onsuccess = (ev) => {
    prev = (ev.target as IDBRequest<FileMeta | undefined>).result;
    const k = keyAfterWrite(prev, key);
    metaStore.put(k ? { ...meta, key: k } : meta);
  };
  tx.objectStore('files').put(bytes, rel);
  await done(tx);
  if (totals) {
    if (!prev) {
      totals.files++;
      if (key) totals.byKey[key] = (totals.byKey[key] ?? 0) + 1;
    }
    totals.bytes += meta.size - (prev?.size ?? 0);
  }
  return meta.sha256;
}

export async function listMeta(): Promise<FileMeta[]> {
  const tx = (await db()).transaction('meta');
  return request(tx.objectStore('meta').getAll() as IDBRequest<FileMeta[]>);
}

export async function stagedTotals(): Promise<StagedTotals> {
  if (!totals) {
    const metas = await listMeta();
    totals ??= { files: metas.length, bytes: metas.reduce((a, m) => a + m.size, 0), byKey: countByKey(metas) };
  }
  return { ...totals, byKey: { ...totals.byKey } };
}

export type StagedProblem = Problem & { step: string };

export async function listProblems(): Promise<StagedProblem[]> {
  const tx = (await db()).transaction('problems');
  return request(tx.objectStore('problems').getAll() as IDBRequest<StagedProblem[]>);
}

// Problems are filed under the step that recorded them, so a step that is run
// again (after a pause) starts clean and records only what still goes wrong.
// Files the sink writes are keyed by the step and the part of it the collector last reported.
let currentStep = '';
let currentPart = '';
export function setCurrentStep(step: string): void {
  currentStep = step;
  currentPart = '';
}
export function setCurrentPart(part: string): void {
  currentPart = part;
}

export async function clearProblemsOfStep(step: string): Promise<void> {
  const tx = (await db()).transaction('problems', 'readwrite');
  tx.objectStore('problems').openCursor().onsuccess = (ev) => {
    const cur = (ev.target as IDBRequest<IDBCursorWithValue | null>).result;
    if (!cur) return;
    if ((cur.value as StagedProblem).step === step) cur.delete();
    cur.continue();
  };
  await done(tx);
}

export async function clearStaging(): Promise<void> {
  const stores = ['files', 'meta', 'problems', 'shas', 'aliases'];
  const tx = (await db()).transaction(stores, 'readwrite');
  for (const s of stores) tx.objectStore(s).clear();
  await done(tx);
  totals = { files: 0, bytes: 0, byKey: {} };
}

export async function putTextDirect(rel: string, text: string): Promise<void> {
  await putFile(rel, new TextEncoder().encode(text));
}

/** Stages bytes as they are, past the write rules. For files that are not part of the collection (see background/rawDump.ts). */
export async function putBinDirect(rel: string, bytes: Uint8Array): Promise<void> {
  await putFile(rel, bytes);
}

/** The ZIP sink: the write rules in core/sinkRules.ts, applied to the staged files. */
export const stagingSink: Sink = {
  async exists(rel) {
    const tx = (await db()).transaction('meta');
    return (await request(tx.objectStore('meta').getKey(rel))) !== undefined;
  },
  async putJson(rel, obj): Promise<SaveReply> {
    const bad = badPath(rel);
    if (bad) return { error: bad };
    const result = jsonResult(await getFile(rel), obj);
    if (result !== 'unchanged') await putFile(rel, jsonBytes(obj), stagingKey(currentStep, currentPart));
    return { result };
  },
  async putBin(rel, bytes, replace): Promise<SaveReply> {
    const bad = badPath(rel);
    if (bad) return { error: bad };
    const result = binResult(await getFile(rel), bytes, replace);
    if (result === 'written' || result === 'updated') {
      const sha = await putFile(rel, bytes, stagingKey(currentStep, currentPart));
      const tx = (await db()).transaction('shas', 'readwrite');
      tx.objectStore('shas').put(rel, sha);
      await done(tx);
    }
    return { result };
  },
  async findBySha256(sha) {
    const rel = await request((await db()).transaction('shas').objectStore('shas').get(sha) as IDBRequest<string | undefined>);
    if (!rel) return null;
    // A regenerated report replaces its file's bytes: the old digest no longer names it.
    const meta = await request((await db()).transaction('meta').objectStore('meta').get(rel) as IDBRequest<FileMeta | undefined>);
    return meta && meta.sha256 === sha ? rel : null;
  },
  async putAlias(rel, existing) {
    const tx = (await db()).transaction('aliases', 'readwrite');
    tx.objectStore('aliases').put(existing, rel);
    await done(tx);
  },
  async aliasOf(rel) {
    const tx = (await db()).transaction('aliases');
    return (await request(tx.objectStore('aliases').get(rel) as IDBRequest<string | undefined>)) ?? null;
  },
  async problem(p) {
    const tx = (await db()).transaction('problems', 'readwrite');
    tx.objectStore('problems').add({ ...p, step: currentStep });
    await done(tx);
  },
};
