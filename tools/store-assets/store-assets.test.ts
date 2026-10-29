import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../../scripts/store-assets.mjs', import.meta.url));
const list = (...args: string[]) => spawnSync(process.execPath, [script, '--list', ...args], { encoding: 'utf8' });

describe('store image command', () => {
  it('exposes the eight production assets and preserves the poster, thumbnail and link-preview routes', () => {
    const result = list();
    expect(result.status).toBe(0);
    const images = JSON.parse(result.stdout) as Array<{ file: string; shot: string; width: number; height: number }>;
    expect(images.map(image => image.shot)).toEqual(['ask', 'whole', 'advice', 'start', 'open', 'promo', 'marquee', 'icon', 'poster', 'thumbnail', 'og-site', 'social']);
    expect(images.every(image => !image.file.includes('mock') && image.width > 0 && image.height > 0)).toBe(true);
  });

  it('selects named shots once in upload order without starting a browser', () => {
    const result = list('open', 'start', 'open');
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).map((image: { shot: string }) => image.shot)).toEqual(['start', 'open']);
  });

  it('rejects a typo even alongside a valid shot, rather than silently omitting requested work', () => {
    const result = list('start', 'opne');
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Unknown shot: opne');
    expect(result.stdout).toBe('');
  });
});
