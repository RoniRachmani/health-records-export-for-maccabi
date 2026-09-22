import { describe, expect, it } from 'vitest';
import { exportReadme } from '../src/extension/shared/readme';

const PRESENT = { profile: 4, 'test-results': 6, letters: 2 };
const FILE = '2026-09-18_medical-file.pdf';

describe('exportReadme', () => {
  it('describes only the folders this export has', () => {
    const md = exportReadme('2026-09-18', PRESENT, FILE);
    expect(md).toContain('**`test-results/`** · 6 files');
    expect(md).toContain('**`letters/`** · 2 files');
    // A section the site had nothing for is not described as if it were there.
    expect(md).not.toContain('**`appointments/`** ·');
  });

  it('names the folders this export does not have', () => {
    const md = exportReadme('2026-09-18', PRESENT, FILE);
    expect(md).toMatch(/This export has no [^.]*`appointments\/`[^.]*: the site returned nothing for them, or the request failed\./);
    expect(md).not.toMatch(/This export has no [^.]*`profile\/`/);
  });

  it('starts from the full medical file, by its name', () => {
    const md = exportReadme('2026-09-18', PRESENT, FILE);
    expect(md).toContain('`2026-09-18_medical-file.pdf`, beside this file');
    expect(md).toContain('as of 2026-09-18');
    expect(md.indexOf('full medical file')).toBeLessThan(md.indexOf('What this export does not contain'));
  });

  it('says so when there is no medical file', () => {
    const md = exportReadme('2026-09-18', PRESENT, null);
    expect(md).toContain('This export has no full medical file.');
    expect(md).not.toContain('beside this file, is');
  });

  it('says what the export does not contain before what it does', () => {
    const md = exportReadme('2026-09-18', PRESENT, FILE);
    expect(md.indexOf('What this export does not contain')).toBeLessThan(md.indexOf('What is in this export'));
    for (const gap of ['DICOM', 'over 12 months old', 'over 2 years old', 'not "this was not checked"']) {
      expect(md).toContain(gap);
    }
  });

  it('warns about the values that do not mean what they appear to', () => {
    const md = exportReadme('2026-09-18', PRESENT, FILE);
    expect(md).toContain('both 0 means no range was given');
    expect(md).toContain('A `result` of 0 is often not a measurement.');
    expect(md).toContain('The same values appear up to three times');
    expect(md).toContain('`0001-01-01T00:00:00` means never set');
  });

  it('lists the fields that carry no information, so a reader skips them', () => {
    const md = exportReadme('2026-09-18', PRESENT, FILE);
    for (const noise of ['`hash`', '`timestamp`', '`searchQueryId`', 'ends in `link`']) {
      expect(md).toContain(noise);
    }
  });

  it('says the data carries the national ID, and file names do not', () => {
    const md = exportReadme('2026-09-18', PRESENT, FILE);
    expect(md).toContain('national ID number');
    expect(md).toContain('File names never carry it.');
  });

  it('is dated', () => {
    expect(exportReadme('2026-09-18', PRESENT, FILE)).toContain('Exported 2026-09-18 from online.maccabi4u.co.il');
  });

  // It shares an AI reader's context with the records themselves, so its length is part of its job.
  it('stays short enough to read beside the records', () => {
    expect(exportReadme('2026-09-18', PRESENT, FILE).length).toBeLessThan(14000);
  });
});
