// The repo's "keep these two in step" rules (CLAUDE.md), checked instead of remembered. Each pair is a copy a
// reader sees in two places: the policies as Markdown and as the shipped page (which a script writes from it), the popup's lines and their map in
// docs/sections.md, the film's folders and the landing page's, the notices and the shipped dependencies, and the
// one origin the terminal scripts spell for themselves, and the product's name wherever it is written out. The popup's 600px is checked in Chrome instead
// (npm run site-check -- popup), since it takes a layout.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STAGES } from '../src/extension/popup/model';
import { PRODUCT_NAME, SHORT_NAME, STORE_NAME } from '../src/extension/shared/name';
import { STEP_FOLDERS } from '../src/extension/shared/readme';
import { MACCABI_ORIGIN } from '../src/extension/shared/state';
import { FOLDERS } from '../store/src/parts';
import pkg from '../package.json';
import { renderPolicy } from '../scripts/policy-pages.mjs';

const read = (path: string) => readFileSync(path, 'utf8');

// ---- the policies -------------------------------------------------------------------------------

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** The words of a Markdown page as a reader sees them: no markup, links as their text. */
function markdownWords(md: string): string[] {
  return words(
    md
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/<(?:https?:\/\/)?([^\s<>]+[.@][^\s<>]+)>/g, '$1') // <https://…> and <name@host> autolinks
      .replace(/^\s*(#+|[-*]|\d+\.)\s+/gm, ' ')
      .replace(/[*_`]/g, '')
      .replace(/\\(.)/g, '$1'),
  );
}

/** The words of an HTML page's body as a reader sees them. */
function htmlWords(html: string): string[] {
  return words(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<head>[\s\S]*?<\/head>/, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
        e[0] !== '#' ? (ENTITIES[e] ?? m) : String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)))),
  );
}

/** Splits on white space, after closing up the space a removed tag leaves beside punctuation. */
function words(text: string): string[] {
  return text.replace(/\s+([.,;:)!?’”])/g, '$1').replace(/([(‘“])\s+/g, '$1').split(/\s+/).filter(Boolean);
}

describe('the policies', () => {
  for (const name of ['privacy', 'terms']) {
    it(`docs/${name}.md and public/${name}.html say the same thing`, () => {
      const md = markdownWords(read(`docs/${name}.md`));
      const html = htmlWords(read(`public/${name}.html`));
      // The first word that differs, with what follows it on each side, rather than two walls of text.
      const at = md.findIndex((w, i) => w !== html[i]);
      const where = (list: string[]) => list.slice(Math.max(0, at - 5), at + 10).join(' ');
      expect(at < 0 && md.length === html.length ? '' : `md: …${where(md)}…\nhtml: …${where(html)}…`).toBe('');
    });

    it(`public/${name}.html is what scripts/policy-pages.mjs writes from docs/${name}.md`, () => {
      // Edit the Markdown, then run `node scripts/policy-pages.mjs`: the page is never edited by hand.
      expect(read(`public/${name}.html`)).toBe(renderPolicy(name, read(`docs/${name}.md`)));
    });
  }
});

// ---- the popup's lines and docs/sections.md -------------------------------------------------------

describe('docs/sections.md', () => {
  // The first table, the lines'; the later ones measure them.
  const lines = read('docs/sections.md').split('\n');
  const head = lines.indexOf('| # | Line | Step | Parts | Writes |');
  const end = lines.findIndex((l, i) => i > head && !l.startsWith('|'));
  const rows = lines.slice(head + 2, end).map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
  const names = (cell: string) => [...cell.matchAll(/`([^`]*)`/g)].map((m) => m[1]).map((p) => (p === "''" ? '' : p));

  it('has one row per line of STAGES, in order, with its label and steps', () => {
    expect(rows.map(([n, label, steps]) => [Number(n), label, names(steps)])).toEqual(STAGES.map((s, i) => [i + 1, s.label, s.steps]));
  });

  it('names the parts of every line that has them', () => {
    for (const [i, s] of STAGES.entries()) if (s.parts) expect(names(rows[i][3])).toEqual(s.parts);
  });
});

// ---- the opened export on the landing page and in the film --------------------------------------

describe("the landing page's opened export", () => {
  it("lists the film's FOLDERS, in order, with the same words", () => {
    const html = read('site/index.html');
    const list = html.slice(html.indexOf('<ul class="fw-list"'), html.indexOf('</ul>', html.indexOf('<ul class="fw-list"')));
    const folders = [...list.matchAll(/#fw-folder"[^]*?fw-name">([^<]*)<[^]*?fw-what">([^<]*)<[^]*?fw-kinds">([^<]*)</g)].map((m) => m.slice(1));
    expect(folders).toEqual(FOLDERS);
  });

  it('shows only folders an export writes', () => {
    const written = new Set(Object.values(STEP_FOLDERS).flat());
    expect(FOLDERS.map(([name]) => name).filter((name) => !written.has(name))).toEqual([]);
  });
});

// ---- public/third-party-notices.txt ---------------------------------------------------------------

describe('public/third-party-notices.txt', () => {
  it('names every runtime dependency at the version that ships', () => {
    const notices = read('public/third-party-notices.txt');
    const missing = Object.entries(pkg.dependencies as Record<string, string>)
      .map(([name, version]) => name + ' ' + version.replace(/^[\^~]/, ''))
      .filter((line) => !notices.includes(line));
    expect(missing).toEqual([]);
  });
});

// ---- the terminal scripts' origin -----------------------------------------------------------------

describe('scripts/', () => {
  // The scripts take the portal's origin from core (core.MACCABI_ORIGIN). The one place it is written out is the
  // browser driver, which runs before core is bundled; it has to agree with the extension's.
  // As a string literal opens it, in any of the three quotes.
  const spelled = (text: string) => ["'", '"', '`'].some((q) => text.includes(q + MACCABI_ORIGIN));

  it("spells the portal's origin only in maccabi-browser.mjs", () => {
    const files = readdirSync('scripts').filter((f) => f.endsWith('.mjs') && f !== 'maccabi-browser.mjs');
    expect(files.filter((f) => spelled(read(join('scripts', f))))).toEqual([]);
  });

  it("spells it in maccabi-browser.mjs as the extension's MACCABI_ORIGIN", () => {
    expect(read('scripts/maccabi-browser.mjs')).toContain(`export const ORIGIN = '${MACCABI_ORIGIN}';`);
  });
});

// ---- the product's name ---------------------------------------------------------------------------

describe("the product's name", () => {
  // Any form it has had, the old "… Export for Maccabi" too, with or without the store's " - Ready for AI".
  const NAME = /(?:Maccabi )?Health Records (?:Export|Takeout)(?: for Maccabi)?(?: - Ready for AI)?/g;
  const TEXT = /\.(md|html|ts|mjs|js|json|css|txt|srt|yml|swift)$/;
  // The YouTube channel keeps the name it was opened with: an account's name, not a spelling of the product's.
  const channel = (line: string) => line.includes('youtube.com/@Health-Records-Export');

  it('is spelled, everywhere in the repo, as one of the forms in src/extension/shared/name.ts', () => {
    const allowed = new Set([PRODUCT_NAME, STORE_NAME, SHORT_NAME]);
    const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
      .split('\n')
      .filter((f) => TEXT.test(f) && f !== 'package-lock.json');
    const wrong: string[] = [];
    for (const f of files) {
      let text: string;
      try {
        text = read(f);
      } catch {
        continue; // listed, but deleted in the working tree
      }
      text.split('\n').forEach((line, i) => {
        if (channel(line)) return;
        for (const [m] of line.matchAll(NAME)) if (!allowed.has(m)) wrong.push(f + ':' + (i + 1) + ': ' + m);
      });
    }
    expect(wrong).toEqual([]);
  });
});
