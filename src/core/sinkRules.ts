import { canon } from './canon';
import type { Json, SaveResult } from './types';

/* Write rules for sinks that store files: JSON is rewritten only when its
   content changed; binary files are kept unless replace is asked for and the
   bytes differ. A resumed export relies on them to skip what it already has. */

export function extOf(rel: string): string {
  const m = rel.match(/(\.[^./]+)$/);
  return m ? m[1].toLowerCase() : '';
}

/** An error message for a path a sink must refuse, or null. */
export function badPath(rel: string): string | null {
  if (!rel || rel.startsWith('/') || rel.includes('\\') || rel.split('/').some((p) => p === '' || p === '.' || p === '..')) {
    return 'bad path: ' + JSON.stringify(rel);
  }
  return null;
}

export function jsonBytes(obj: Json): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj, null, 2) + '\n');
}

/** What saving obj over existing (undefined when absent) amounts to. */
export function jsonResult(existing: Uint8Array | undefined, obj: Json): SaveResult {
  if (!existing) return 'written';
  try {
    if (canon(JSON.parse(new TextDecoder().decode(existing))) === canon(obj)) return 'unchanged';
  } catch {
    /* unreadable existing file: rewrite it */
  }
  return 'updated';
}

export function binResult(existing: Uint8Array | undefined, bytes: Uint8Array, replace: boolean): SaveResult {
  if (!existing) return 'written';
  if (!replace) return 'kept_existing';
  if (existing.length === bytes.length && existing.every((b, i) => b === bytes[i])) return 'unchanged';
  return 'updated';
}
