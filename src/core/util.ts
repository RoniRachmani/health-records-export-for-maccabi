import type { Json } from './types';

// End of every date range. Not today(): that is the UTC date, a day behind in
// Israel until 03:00, and it would drop records dated after today.
export const END_DATE = '2099-12-31';

export function today(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

// The medical-file order's endDate and the new letter's to_date are the Israel date, not today() (UTC).
export function israelToday(now: number): string {
  return new Date(now).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

// "2026-02-25T00:00:00", "25/02/26", "25/02/2026" -> "2026-02-25"
export function iso(s: Json): string {
  if (!s) return 'undated';
  const str = String(s);
  let m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = str.match(/^(\d{2})\/(\d{2})\/(\d{2,4})/);
  if (m) {
    const y = m[3].length === 4 ? m[3] : (Number(m[3]) > 50 ? '19' : '20') + m[3];
    return y + '-' + m[2] + '-' + m[1];
  }
  return 'undated';
}

/** Non-cryptographic 8-hex digest (FNV-1a), for telling two names apart without awaiting. */
function fnv8(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

const ID_MAX = 40;

/**
 * An id as a path segment: the API's own record id, reduced to ASCII. '_' is not kept -- stem()
 * joins the segments of a file name with it, so a name stays readable as date_id_title only if
 * nothing else can produce one. A value that reduces to nothing, or that has to be cut short,
 * carries a digest of the original, so two different ids never collapse into one file name.
 */
export function safe(s: Json): string {
  const raw = String(s);
  const t = raw.replace(/[^A-Za-z0-9.-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '');
  if (!t) return fnv8(raw);
  return t.length > ID_MAX ? t.slice(0, ID_MAX).replace(/[-.]+$/, '') + '-' + fnv8(raw) : t;
}

// Kept in a title: Latin, digits, the Hebrew block, and . -
// Everything else (spaces, punctuation, '_', the RTL marks U+200E/U+200F) collapses to one '-'.
const TITLE_DROP = /[^A-Za-z0-9.\u0590-\u05FF-]+/g;
const TITLE_MAX = 40;

/**
 * The readable half of a file name: a display string as the API sends it, Hebrew kept and never
 * translated. Normalised to NFC so the same record yields the same bytes on every run and every
 * platform -- paths are compared exactly, and a name that arrived NFD would download the file
 * again. '' when nothing readable is left, and then the name is just <date>_<id>. Cutting a
 * long title short needs no digest: the id in front already makes the name unique, so the title
 * only has to be readable.
 */
export function title(s: Json): string {
  if (typeof s !== 'string') return '';
  const t = s.normalize('NFC').replace(TITLE_DROP, '-').replace(/^[-.]+|[-.]+$/g, '');
  return t.length > TITLE_MAX ? t.slice(0, TITLE_MAX).replace(/[-.]+$/, '') : t;
}

/** title() of the first of fields holding a readable string, or '' when none does. */
export function titleOf(rec: Json, fields: string[]): string {
  for (const f of fields) {
    const t = title(rec ? rec[f] : undefined);
    if (t) return t;
  }
  return '';
}

/**
 * A file name stem: the parts that are there, joined by '_'. Empty parts are left out. safe() and
 * title() never emit '_' themselves, so the separator always marks a real segment boundary.
 */
export function stem(...parts: (string | undefined)[]): string {
  return parts.filter((p) => p).join('_');
}

/** First 4 bytes of sha256(parts joined by '|'), hex. null/undefined join as ''. */
export async function shortHash(parts: Json[]): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(parts.join('|')));
  return Array.from(new Uint8Array(buf))
    .slice(0, 4)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function b64bytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function isPdf(bytes: Uint8Array): boolean {
  return bytes.length > 4 && String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-';
}

export function mimeType(contentType: string): string {
  return (contentType || '').split(';')[0];
}

export function charset(contentType: string, fallback: string): string {
  return ((contentType || '').match(/charset=([\w-]+)/i) || [])[1] || fallback;
}

export function jwtClaims(jwt: string | null | undefined): Record<string, Json> | null {
  if (!jwt) return null;
  try {
    // The payload is UTF-8 (gender is Hebrew, "ז"); atob alone would give its bytes as Latin-1.
    return JSON.parse(new TextDecoder().decode(b64bytes(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))));
  } catch {
    return null;
  }
}

/**
 * First name from a MainAppAPI member record (profile/member.json data). The English name is
 * stored in capitals ("JUDITH", seen 2026-09-17), so it is shown as "Judith"; the Hebrew name
 * is the fallback when there is no English one.
 */
export function memberFirstName(member: Json): string | undefined {
  const text = (v: Json) => (typeof v === 'string' ? v.trim() : '');
  const english = text(member?.first_name_english);
  if (english) return english.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
  return text(member?.first_name_hebrew) || undefined;
}

/**
 * How long a Retry-After header asks us to wait, in ms: a number of seconds, or an HTTP date to
 * wait until. Falls back to fallbackMs when the header is missing or unparsable.
 */
export function retryAfterMs(header: string | undefined, now: number, fallbackMs: number): number {
  const h = (header || '').trim();
  if (/^\d+$/.test(h)) return Number(h) * 1000;
  // Only the date form is left, and it always carries a month name: without this, Date.parse
  // reads "-5" as a year and a nonsense header turns into "wait no time at all".
  if (/[a-z]/i.test(h)) {
    const until = Date.parse(h);
    if (!Number.isNaN(until)) return Math.max(0, until - now);
  }
  return fallbackMs;
}

/**
 * Member id and gender from what the page exposes: the <id> of its cookie_sessionId_0_<id> cookie,
 * and its SPA token. Since 2026-09-17 some logins no longer set that cookie; the token carries mem_id.
 */
export function sessionFrom(cookieMid: string | null, jwt: string | null): { mid: string | null; gender: Json } {
  let mid = cookieMid || null;
  const claims = jwtClaims(jwt);
  if (!mid && claims) mid = String(claims.mem_id || '') || null;
  return { mid, gender: claims ? claims.gender : undefined };
}
