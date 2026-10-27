// The Privacy Policy and Terms of Use are written once, in docs/<name>.md, and this writes the pages that ship in
// the extension (public/<name>.html) from them: `node scripts/policy-pages.mjs`. repoRules.test.ts fails while a
// committed page differs from what this makes, so edit the Markdown and run this, never the HTML.
//
// It reads only the Markdown the two documents use: `#` and `##` headings, paragraphs, `-` lists (a continued line
// indented two spaces), [links](…), <autolinks>, `code` (shown as plain text) and \-escapes. The two paragraphs under
// the title (the site's link and the effective date) are the page's heading block.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SITE = 'https://maccabi.ronirachmani.com/';
const WIDTH = 120;

/** What each page's head says that its Markdown does not. */
export const PAGES = {
  privacy: {
    description:
      'How Health Records Export for Maccabi handles your information: your records go from Maccabi Online to your own computer, and nothing is sent to the developer.',
  },
  terms: {
    description:
      'The terms for using Health Records Export for Maccabi, a free, open-source, unofficial Chrome extension that saves your Maccabi Online records to your computer.',
  },
};

/** @param {string} s */
const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const REPO = 'https://github.com/RoniRachmani/health-records-export-for-maccabi/blob/main/';

/**
 * A link as the shipped page needs it: the other document is its page, a file in public/ sits beside the page, and
 * anything else in the repository is on GitHub. @param {string} href
 */
const pageHref = (href) =>
  href
    .replace(/^(privacy|terms)\.md(#|$)/, '$1.html$2')
    .replace(/^\.\.\/public\//, '')
    .replace(/^\.\.\//, REPO);

/** One block's text, its lines joined, as HTML. @param {string} text */
export function inline(text) {
  let out = '';
  // A link, an autolink, a code span, an escape, or a run of anything else.
  const token = /\[([^\]]*)\]\(([^)\s]*)\)|<((?:https?:\/\/|mailto:)?[^\s<>]+[.@][^\s<>]+)>|`([^`]*)`|\\(.)|([^[<`\\]+|.)/gs;
  for (const m of text.matchAll(token)) {
    const [, label, href, auto, code, escaped, plain] = m;
    if (href !== undefined) out += `<a href="${escape(pageHref(href))}">${inline(label)}</a>`;
    else if (auto !== undefined) {
      const mail = !/^https?:/.test(auto) && auto.includes('@');
      const target = mail ? 'mailto:' + auto.replace(/^mailto:/, '') : auto;
      out += `<a href="${escape(target)}">${escape(auto.replace(/^(https?:\/\/|mailto:)/, ''))}</a>`;
    } else if (code !== undefined) out += escape(code);
    else out += escape(escaped ?? plain ?? m[0]);
  }
  return out;
}

/** Wraps HTML text at WIDTH, never inside a tag. @param {string} html @param {string} indent */
function wrap(html, indent) {
  const words = html.replace(/<[^>]*>/g, (tag) => tag.replace(/ /g, '\0')).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const word = w.replace(/\0/g, ' ');
    if (line && indent.length + line.length + 1 + word.length > WIDTH) {
      lines.push(indent + line);
      line = word;
    } else line = line ? line + ' ' + word : word;
  }
  if (line) lines.push(indent + line);
  return lines;
}

/** An element on one line if it fits, else its text wrapped inside it. @param {string} tag @param {string} html @param {string} indent */
function element(tag, html, indent) {
  const one = `${indent}<${tag}>${html}</${tag}>`;
  if (one.length <= WIDTH) return [one];
  return [`${indent}<${tag}>`, ...wrap(html, indent + '  '), `${indent}</${tag}>`];
}

/** @param {string} name @param {string} md */
export function renderPolicy(name, md) {
  const page = PAGES[/** @type {keyof typeof PAGES} */ (name)];
  if (!page) throw new Error('no page for ' + name);
  const blocks = md
    .replace(/<!--[\s\S]*?-->/g, '')
    .split(/\n\s*\n/)
    .map((b) => b.replace(/\s+$/, ''))
    .filter((b) => b.trim());
  const first = blocks.shift() ?? '';
  if (!first.startsWith('# ')) throw new Error(`docs/${name}.md starts with its # title`);
  const title = first.slice(2).trim();
  const head = blocks.splice(0, 2);

  const body = [`    <h1>${inline(title)}</h1>`, '    <div class="doc-head">', ...head.map((b) => `      <p>${inline(b.replace(/\s*\n\s*/g, ' '))}</p>`), '    </div>'];
  for (const block of blocks) {
    body.push('');
    if (block.startsWith('## ')) {
      body.push(`    <h2>${inline(block.slice(3).trim())}</h2>`);
    } else if (/^- /.test(block)) {
      const items = block.split(/\n(?=- )/).map((item) => item.slice(2).replace(/\s*\n\s*/g, ' '));
      body.push('    <ul>', ...items.flatMap((item) => element('li', inline(item), '      ')), '    </ul>');
    } else {
      body.push(...element('p', inline(block.replace(/\s*\n\s*/g, ' ')), '    '));
    }
  }
  // A heading is followed by its content without a blank line between, as the pages were written by hand.
  const lines = body.filter((l, i) => !(l === '' && body[i - 1]?.startsWith('    <h2>')));

  return [
    '<!doctype html>',
    `<!-- Shipped at chrome-extension://<id>/${name}.html. Written from docs/${name}.md by scripts/policy-pages.mjs: edit that, not this. -->`,
    '<html lang="en">',
    '  <head>',
    '    <meta charset="utf-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1" />',
    '    <meta name="color-scheme" content="light" />',
    `    <title>${escape(title)} - Health Records Export for Maccabi</title>`,
    `    <meta name="description" content="${escape(page.description).replace(/"/g, '&quot;')}" />`,
    `    <link rel="canonical" href="${SITE}${name}.html" />`,
    '    <link rel="stylesheet" href="pages.css" />',
    '  </head>',
    '  <body>',
    ...lines,
    '  </body>',
    '</html>',
    '',
  ].join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const name of Object.keys(PAGES)) {
    const html = renderPolicy(name, readFileSync(`${ROOT}docs/${name}.md`, 'utf8'));
    writeFileSync(`${ROOT}public/${name}.html`, html);
    console.log(`public/${name}.html`);
  }
}
