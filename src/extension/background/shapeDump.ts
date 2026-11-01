/* Development build only, and off unless dev:shapes turns it on: keeps the field names and types of every answer the
   run receives (shared/shapes.ts), for npm run live -- --shapes. Compiled out of the store build. */
import type { Transport } from '../../core';
import { mergeShapes, shapeTransport, sortedShapes, type Shapes } from '../shared/shapes';

const FLAG_KEY = 'devShapes';
const STORE_KEY = 'devShapesSeen';

export async function shapesOn(): Promise<boolean> {
  return (await chrome.storage.local.get(FLAG_KEY))[FLAG_KEY] === true;
}

/** Either way it starts empty: what a run saw goes to the terminal, and stays nowhere else. */
export async function setShapes(on: boolean): Promise<void> {
  await chrome.storage.local.remove([FLAG_KEY, STORE_KEY]);
  if (on) await chrome.storage.local.set({ [FLAG_KEY]: true });
}

export async function seenShapes(): Promise<Shapes> {
  return sortedShapes(((await chrome.storage.local.get(STORE_KEY))[STORE_KEY] as Shapes | undefined) ?? {});
}

/** Kept in storage, not in a module variable: a restarted service worker must add to what the run has seen. */
export function recordingTransport(base: Transport, mid: string | null): Transport {
  return shapeTransport(base, mid, async (s) => {
    await chrome.storage.local.set({ [STORE_KEY]: mergeShapes(await seenShapes(), s) });
  });
}
