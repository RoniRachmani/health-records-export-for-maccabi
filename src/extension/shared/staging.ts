/* Staged export files, in the extension's IndexedDB. The background run writes
   here as it goes; the offscreen document reads it to build the ZIP. A paused
   run keeps its files here until it is resumed, saved or cancelled. */
import { badPath, binResult, jsonBytes, jsonResult, sha256Hex, type Problem, type SaveReply, type Sink } from '../../core';

const DB_NAME = 'hrem-staging';
const DB_VERSION = 1;

export interface FileMeta {
  rel: string;
  size: number;
  sha256: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        d.createObjectStore('files'); // rel -> Uint8Array
        d.createObjectStore('meta', { keyPath: 'rel' }); // FileMeta
        d.createObjectStore('problems', { autoIncrement: true }); // Problem
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

/** Files and bytes staged, for the popup. Loaded from the meta store once, then kept up to date by writes. */
let totals: { files: number; bytes: number } | null = null;

async function putFile(rel: string, bytes: Uint8Array): Promise<void> {
  const meta: FileMeta = { rel, size: bytes.length, sha256: await sha256Hex(bytes) };
  const tx = (await db()).transaction(['files', 'meta'], 'readwrite');
  const metaStore = tx.objectStore('meta');
  // Queued before the put, so it reads the file this write replaces.
  const prev = metaStore.get(rel) as IDBRequest<FileMeta | undefined>;
  tx.objectStore('files').put(bytes, rel);
  metaStore.put(meta);
  await done(tx);
  if (totals) {
    if (!prev.result) totals.files++;
    totals.bytes += meta.size - (prev.result?.size ?? 0);
  }
}

export async function listMeta(): Promise<FileMeta[]> {
  const tx = (await db()).transaction('meta');
  return request(tx.objectStore('meta').getAll() as IDBRequest<FileMeta[]>);
}

export async function stagedTotals(): Promise<{ files: number; bytes: number }> {
  if (!totals) {
    const metas = await listMeta();
    totals ??= { files: metas.length, bytes: metas.reduce((a, m) => a + m.size, 0) };
  }
  return { ...totals };
}

export type StagedProblem = Problem & { step: string };

export async function listProblems(): Promise<StagedProblem[]> {
  const tx = (await db()).transaction('problems');
  return request(tx.objectStore('problems').getAll() as IDBRequest<StagedProblem[]>);
}

// Problems are filed under the step that recorded them, so a step that is run
// again (after a pause) starts clean and records only what still goes wrong.
let currentStep = '';
export function setCurrentStep(step: string): void {
  currentStep = step;
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
  const tx = (await db()).transaction(['files', 'meta', 'problems'], 'readwrite');
  for (const s of ['files', 'meta', 'problems']) tx.objectStore(s).clear();
  await done(tx);
  totals = { files: 0, bytes: 0 };
}

export async function putTextDirect(rel: string, text: string): Promise<void> {
  await putFile(rel, new TextEncoder().encode(text));
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
    if (result !== 'unchanged') await putFile(rel, jsonBytes(obj));
    return { result };
  },
  async putBin(rel, bytes, replace): Promise<SaveReply> {
    const bad = badPath(rel);
    if (bad) return { error: bad };
    const result = binResult(await getFile(rel), bytes, replace);
    if (result === 'written' || result === 'updated') await putFile(rel, bytes);
    return { result };
  },
  async problem(p) {
    const tx = (await db()).transaction('problems', 'readwrite');
    tx.objectStore('problems').add({ ...p, step: currentStep });
    await done(tx);
  },
};
