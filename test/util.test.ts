import { describe, expect, it } from 'vitest';
import { badPath, binResult, canon, iso, israelToday, jsonResult, jsonBytes, memberFirstName, retryAfterMs, safe, sessionFrom, shortHash, stem, title, titleOf } from '../src/core';

describe('iso', () => {
  it('normalizes the portal date formats', () => {
    expect(iso('2026-02-25T00:00:00')).toBe('2026-02-25');
    expect(iso('25/02/26')).toBe('2026-02-25');
    expect(iso('25/02/99')).toBe('1999-02-25');
    expect(iso('25/02/2026')).toBe('2026-02-25');
    expect(iso('')).toBe('undated');
    expect(iso(null)).toBe('undated');
    expect(iso('/Date(123)/')).toBe('undated');
  });
});

describe('safe', () => {
  it('keeps file-name characters only', () => {
    expect(safe('lab result/1 2')).toBe('lab-result-1-2');
    expect(safe(555)).toBe('555');
  });

  it('never yields a name that is empty or starts with a dot or dash', () => {
    expect(safe('/x/')).toBe('x');
    expect(safe('..')).toMatch(/^[0-9a-f]{8}$/);
    expect(safe('\u05e2\u05d1\u05e8\u05d9\u05ea')).toMatch(/^[0-9a-f]{8}$/); // an id the ASCII whitelist empties out
  });

  it('caps a long id and keeps a digest of the whole of it', () => {
    const a = safe('x'.repeat(60) + 'A');
    const b = safe('x'.repeat(60) + 'B');
    expect(a.length).toBeLessThanOrEqual(49); // 40 + '-' + 8
    expect(a).not.toBe(b); // two long ids never collapse into one name
  });
});

describe('title', () => {
  it('keeps Hebrew as the API sends it', () => {
    expect(title('\u05e1\u05e4\u05d9\u05e8\u05ea \u05d3\u05dd')).toBe('\u05e1\u05e4\u05d9\u05e8\u05ea-\u05d3\u05dd');
    expect(title('Dr. Cohen (A)')).toBe('Dr.-Cohen-A');
  });

  it('normalises to NFC, so the same title is the same bytes on every run', () => {
    // The same word decomposed (NFD) and composed (NFC) must not be two different file names.
    expect(title('e\u0301clair')).toBe(title('\u00e9clair'));
  });

  it('drops the bidi marks a display string can carry', () => {
    expect(title('\u200f\u05d0\u05d1\u200e')).toBe('\u05d0\u05d1');
  });

  it('is empty for anything that is not a readable string', () => {
    expect(title(undefined)).toBe('');
    expect(title(7)).toBe('');
    expect(title('   ')).toBe('');
  });

  it('cuts a long title short without a trailing dash', () => {
    expect(title('\u05d0 '.repeat(40)).length).toBeLessThanOrEqual(40);
    expect(title('\u05d0 '.repeat(40)).endsWith('-')).toBe(false);
  });
});

describe('titleOf', () => {
  it('takes the first field holding a readable string', () => {
    expect(titleOf({ a: '', b: 3, c: '\u05d3\u05dd' }, ['a', 'b', 'c'])).toBe('\u05d3\u05dd');
    expect(titleOf({}, ['a'])).toBe('');
    expect(titleOf(null, ['a'])).toBe('');
  });
});

describe('stem', () => {
  it('joins the parts that are there, so a record with no title is just <date>_<id>', () => {
    expect(stem('2026-01-05', 'R1', '\u05d3\u05dd')).toBe('2026-01-05_R1_\u05d3\u05dd');
    expect(stem('2026-01-05', 'R1', '')).toBe('2026-01-05_R1');
    expect(stem('HGB', '')).toBe('HGB');
  });
});

describe('israelToday', () => {
  it('is a day ahead of UTC late at night', () => {
    expect(israelToday(Date.parse('2026-09-16T22:30:00Z'))).toBe('2026-09-17');
    expect(new Date(Date.parse('2026-09-16T22:30:00Z')).toISOString().slice(0, 10)).toBe('2026-09-16');
  });
});

describe('sessionFrom', () => {
  const jwt = (claims: object) =>
    'h.' + btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(claims)))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_') + '.s';
  it('prefers the member cookie', () => {
    expect(sessionFrom('777', jwt({ mem_id: 888, gender: 'M' }))).toEqual({ mid: '777', gender: 'M' });
  });
  it('falls back to mem_id in the token', () => {
    expect(sessionFrom(null, jwt({ mem_id: 888, gender: 'F' }))).toEqual({ mid: '888', gender: 'F' });
  });
  it('decodes a Hebrew gender as UTF-8', () => {
    expect(sessionFrom(null, jwt({ mem_id: 888, gender: 'ז' }))).toEqual({ mid: '888', gender: 'ז' });
  });
  it('is empty when logged out', () => {
    expect(sessionFrom(null, null)).toEqual({ mid: null, gender: undefined });
  });
});

describe('memberFirstName', () => {
  it('shows the capitalised English name in normal case', () => {
    expect(memberFirstName({ first_name_english: 'DANA', first_name_hebrew: 'דנה' })).toBe('Dana');
    expect(memberFirstName({ first_name_english: ' MARY-ANN ' })).toBe('Mary-Ann');
  });
  it('falls back to the Hebrew name, then to nothing', () => {
    expect(memberFirstName({ first_name_english: '', first_name_hebrew: ' דנה ' })).toBe('דנה');
    expect(memberFirstName({ first_name_english: null, first_name_hebrew: '' })).toBeUndefined();
    expect(memberFirstName(null)).toBeUndefined();
  });
});

describe('shortHash', () => {
  it('joins null and undefined as empty strings', async () => {
    expect(await shortHash(['a', null, undefined])).toBe(await shortHash(['a', '', '']));
    expect(await shortHash(['a'])).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('canon', () => {
  it('ignores signature fields and list order', () => {
    const a = { fetched_at: 1, data: { items: [{ id: 2, pdf_link: 'x' }, { id: 1, hash: 'a' }], nested: { timestamp: 5, v: 1 } } };
    const b = { fetched_at: 2, data: { items: [{ id: 1, hash: 'b' }, { id: 2, pdf_link: 'y' }], nested: { timestamp: 6, v: 1 } } };
    expect(canon(a)).toBe(canon(b));
    expect(canon(a)).not.toBe(canon({ ...b, data: { ...b.data, nested: { v: 2 } } }));
  });
});

describe('retryAfterMs', () => {
  const now = Date.parse('2026-09-17T09:00:00Z');
  it('reads seconds, an HTTP date, or falls back', () => {
    expect(retryAfterMs('120', now, 1000)).toBe(120_000);
    expect(retryAfterMs(' 0 ', now, 1000)).toBe(0);
    expect(retryAfterMs('Thu, 17 Sep 2026 09:02:00 GMT', now, 1000)).toBe(120_000);
    expect(retryAfterMs('Thu, 17 Sep 2026 08:00:00 GMT', now, 1000)).toBe(0); // already past
    expect(retryAfterMs(undefined, now, 1000)).toBe(1000);
    expect(retryAfterMs('soon', now, 1000)).toBe(1000);
    expect(retryAfterMs('-5', now, 1000)).toBe(1000);
  });
});

describe('sink rules', () => {
  it('reports unchanged JSON only when the content is the same', () => {
    const old = jsonBytes({ data: { v: 1 }, fetched_at: 'a' });
    expect(jsonResult(undefined, {})).toBe('written');
    expect(jsonResult(old, { data: { v: 1 }, fetched_at: 'b' })).toBe('unchanged');
    expect(jsonResult(old, { data: { v: 2 } })).toBe('updated');
  });
  it('keeps binaries unless replace is asked for', () => {
    const a = new Uint8Array([1, 2]);
    expect(binResult(undefined, a, false)).toBe('written');
    expect(binResult(a, new Uint8Array([3]), false)).toBe('kept_existing');
    expect(binResult(a, new Uint8Array([1, 2]), true)).toBe('unchanged');
    expect(binResult(a, new Uint8Array([3]), true)).toBe('updated');
  });
  it('refuses paths outside the export', () => {
    expect(badPath('a/../b.json')).toMatch(/bad path/);
    expect(badPath('/abs.json')).toMatch(/bad path/);
    expect(badPath('a/b.json')).toBeNull();
    expect(badPath('a/b.exe')).toBeNull();
  });
});
