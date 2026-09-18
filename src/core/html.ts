import type { HtmlParser } from './types';

/** HtmlParser over a DOMParser (the page, the offscreen document, happy-dom in tests). */
export function domHtmlParser(Parser: { new (): DOMParser } = DOMParser): HtmlParser {
  const parse = (html: string) => new Parser().parseFromString(html, 'text/html');
  return {
    async purchaseTable(html) {
      return { cols: parse(html).querySelectorAll('th').length };
    },
    async phrGrid(html) {
      const grid = parse(html);
      const ids = Array.from(new Set(Array.from(grid.querySelectorAll('[fileid]')).map((e) => e.getAttribute('fileid') as string)));
      const openArgs = Array.from(grid.querySelectorAll('[onclick*="OpenFile"],[href*="OpenFile"]'))
        .map((e) => ((e.getAttribute('onclick') || e.getAttribute('href') || '').match(/OpenFile\(\s*'([^']+)'/) || [])[1])
        .filter((a): a is string => !!a);
      return { ids, openArgs };
    },
  };
}
