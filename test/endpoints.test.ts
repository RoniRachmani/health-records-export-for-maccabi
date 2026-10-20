import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SUMMARY_PAGE } from '../src/extension/shared/state';

// The repo's first rule: every request the collector makes is listed in docs/endpoints/endpoints.json with the
// file it produces. The privacy policy and the store review rely on that map being complete, and a
// request added to a section is easy to forget there, so the gate checks it rather than trusting us.
// The requests the terminal scripts send themselves (the sign-in chain, the token bootstrap, the legacy
// page prime in scripts/maccabi-session.mjs) have their own map, docs/endpoints/scripts-endpoints.json,
// checked the same way below.
//
// Only this direction is checked. The other way round would fail honestly: a few documented URLs are
// templates with placeholder segments (a letter's PDF, for one), built at run time and never written
// as a literal in the source.

// A request path as the source spells it: 'SomethingAPI/v1/...' for /sonline/, 'online/...' for the
// legacy services. Query strings and anything concatenated on are cut off before comparing.
const IN_SOURCE = /'([A-Za-z]+API\/[^']*|\/?online\/[^']*)'/g;

function bare(url: string): string {
  return url.split('?')[0].replace(/^\//, '');
}

function sourcePaths(dir: string): Set<string> {
  const found = new Set<string>();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      sourcePaths(path).forEach((u) => found.add(u));
    } else if (path.endsWith('.ts')) {
      for (const [, url] of readFileSync(path, 'utf8').matchAll(IN_SOURCE)) {
        // 'online/' alone is the page the tab opens, not a request.
        if (bare(url).length > 6) found.add(bare(url));
      }
    }
  }
  return found;
}

function documented(value: unknown, found: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => documented(v, found));
  else if (value && typeof value === 'object') {
    const url = (value as { url?: unknown }).url;
    if (typeof url === 'string') found.add(bare(url));
    Object.values(value).forEach((v) => documented(v, found));
  }
  return found;
}

describe('docs/endpoints/endpoints.json', () => {
  it('lists every request path in src/core', () => {
    const map = JSON.parse(readFileSync('docs/endpoints/endpoints.json', 'utf8'));
    const known = [...documented(map)];
    // One is a prefix of the other when the source builds a path the map spells out in full, or the
    // other way round; either way the request is documented.
    const missing = [...sourcePaths('src/core')].filter(
      (path) => !known.some((url) => path === url || path.startsWith(url) || url.startsWith(path)),
    );
    expect(missing).toEqual([]);
  });

  it('finds paths on both sides, so the check cannot pass by reading nothing', () => {
    expect(sourcePaths('src/core').size).toBeGreaterThan(30);
    expect(documented(JSON.parse(readFileSync('docs/endpoints/endpoints.json', 'utf8'))).size).toBeGreaterThan(30);
  });
});

// A request path as scripts/maccabi-session.mjs spells it: a literal starting at the site's root ('/infosec/...',
// '/saml/...', '/sonline/...', '/online/...'), the query cut off. The legacy page comes from core.SUMMARY_PAGE, not
// a literal, so it is checked by name.
const IN_SCRIPT = /'(\/(?:infosec|saml|sonline|online)\/[^']+)'/g;

describe('docs/endpoints/scripts-endpoints.json', () => {
  const map = JSON.parse(readFileSync('docs/endpoints/scripts-endpoints.json', 'utf8'));
  const known = [...documented(map)].map((u) => (/^https?:/.test(u) ? bare(new URL(u).pathname) : u));
  const listed = (path: string) => known.some((url) => path === url || path.startsWith(url) || url.startsWith(path));

  it('lists every request path in scripts/maccabi-session.mjs, and the legacy page it primes', () => {
    const source = readFileSync('scripts/maccabi-session.mjs', 'utf8');
    const paths = new Set<string>();
    for (const [, url] of source.matchAll(IN_SCRIPT)) paths.add(bare(url));
    expect(paths.size).toBeGreaterThan(5); // the chain, the ACS and the bootstrap, so the check cannot pass by reading nothing
    expect([...paths].filter((p) => !listed(p))).toEqual([]);
    expect(listed(bare(new URL(SUMMARY_PAGE).pathname))).toBe(true);
  });

  it('names no value: what each request sends and returns is shapes', () => {
    for (const entry of [...map.sign_in, ...map.session]) {
      expect(entry).toMatchObject({ method: expect.stringMatching(/^(GET|POST)$/), url: expect.stringMatching(/^https:\/\/(mac|online)\.maccabi4u\.co\.il\//), sends: expect.any(String), returns: expect.any(String) });
      expect(entry.url).not.toMatch(/\d{5,}/); // no id number in a path
    }
  });
});
