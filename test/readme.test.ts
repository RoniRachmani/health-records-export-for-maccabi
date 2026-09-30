import { describe, expect, it } from 'vitest';
import { exportErrors, exportReadme, INSTRUCTION_POINTERS, STEP_FOLDERS, type ExportError, type MadeBy } from '../src/extension/shared/readme';
import { PLAN } from '../src/extension/shared/state';

const PRESENT = { profile: 4, 'test-results': 6, letters: 2 };
const FILE = '2026-09-18_medical-file.pdf';
// Started the same day, Israel time: no "collected from".
const MADE: MadeBy = { version: '0.6.1', layout: 2, startedAt: '2026-09-18T06:00:00.000Z', dev: false };
const readme = (present: Record<string, number> = PRESENT, file: string | null = FILE, errors: ExportError[] = [], made: MadeBy = MADE) =>
  exportReadme('2026-09-18', present, file, errors, made);
const at = '2026-09-18T07:00:00.000Z';

describe('exportReadme', () => {
  // An assistant is handed the export with this file as its saved instructions.
  it('tells an assistant how to work with the records before it describes them', () => {
    const md = readme();
    expect(md).toContain('this file is your instructions and the records are your project files');
    for (const rule of ['Say where each fact comes from', 'Leave the export as it is.', 'Keep what the member tells you.', 'Where their word and a record disagree, show both', "earlier export's", 'out of anything that leaves this', 'needs a doctor soon']) {
      expect(md).toContain(rule);
    }
    expect(md.indexOf('How to work with these records')).toBeLessThan(md.indexOf('Start with the full medical file'));
  });

  // Whoever opens the export months later has no popup: one line, first, points them to the page.
  it('points the member to the AI assistant page before anything else', () => {
    const md = readme();
    expect(md.split('\n')[2]).toMatch(/^> \*\*Member:\*\* to ask an AI assistant/);
    expect(md).toContain('https://ronirachmani.github.io/health-records-export-for-maccabi/ai-assistant.html');
  });

  it('says where to look for the questions people ask most', () => {
    const md = readme().replace(/\s+/g, ' ');
    for (const pointer of [
      'first list every file — most names start with the record\'s date, so sorted by file name, not path, they make a timeline',
      'for a health history, the medical file',
      "for one condition, its line in the medical file's known problems",
      'for a measurement over time, `test-results/history/`',
      'for what changed since the last visit, whatever is dated after the newest file in `visit-summaries/`',
      'for an appointment, the medical file',
      "for allergies, `allergies-sensitivity/` and the medical file's sensitivities",
      'for preventive care due, age and sex in `profile/member.json`, `vaccinations/`',
      "judged by Israel's current guidance",
      'open `referrals/`',
    ]) {
      expect(md).toContain(pointer);
    }
  });

  it('describes only the folders this export has', () => {
    const md = readme();
    expect(md).toContain('**`test-results/`** · 6 files');
    expect(md).toContain('**`letters/`** · 2 files');
    expect(readme({ ...PRESENT, 'allergies-sensitivity': 1 })).toContain('**`allergies-sensitivity/`** · 1 file —');
    // A section the site had nothing for is not described as if it were there.
    expect(md).not.toContain('**`appointments/`** ·');
  });

  it('says a folder it does not have had nothing on record, when nothing failed there', () => {
    const md = readme().replace(/\s+/g, ' ');
    expect(md).toMatch(/This export has no [^.]*`allergies-sensitivity\/`[^.]*`appointments\/`[^.]*: the site had nothing on record for them\./);
    expect(md).not.toMatch(/This export has no [^.]*`profile\/`/);
    expect(md).not.toContain('because collecting');
  });

  // Every folder is written whenever the site answers, and a failed request is filed as a problem.
  it('says a folder it does not have failed, when a problem was filed against it', () => {
    const errors = exportErrors([
      { step: 'referrals', where: 'referrals/list.json', what: 'HTTP 500', at },
      { step: 'emptySections', where: 'allergies-sensitivity/list.json', what: 'HTTP 503', at },
    ]);
    const md = readme(PRESENT, FILE, errors).replace(/\s+/g, ' ');
    expect(md).toContain('This export has no `referrals/` and `allergies-sensitivity/` because collecting them failed');
    expect(md).not.toMatch(/This export has no [^.]*`referrals\/`[^.]*: the site had nothing on record/);
    expect(md).toMatch(/This export has no [^.]*`appointments\/`[^.]*: the site had nothing on record/);
    const empty = readme({ ...PRESENT, 'allergies-sensitivity': 1 }).replace(/\s+/g, ' ');
    expect(empty).toContain('An empty `intolerance` means Maccabi Healthcare Services has no sensitivity on record');
  });

  it('says every request was answered when nothing failed', () => {
    const md = readme();
    expect(md).toContain('## What this export failed to collect');
    expect(md).toContain('Every request in this run was answered: `export-errors.json` is empty.');
    // Diagnoses are "known problems" in the medical file: failures are never called problems.
    expect(md.slice(md.indexOf('## What this export failed'), md.indexOf('## Lab values'))).not.toMatch(/problem/i);
  });

  it('counts what failed, folder by folder, and points to the full list', () => {
    const errors = exportErrors([
      { step: 'referrals', where: 'referrals/files/2026-03-01_R1.pdf', what: 'PDF download: HTTP 404', at },
      { step: 'referrals', where: 'referrals/files/2026-03-02_R2.pdf', what: 'PDF download: HTTP 404', at },
      { step: 'doctorCommunications', where: 'communication-with-doctor/details/2026-04-02_Q1.json', what: 'HTTP 500', at },
      { step: 'savedDocuments', where: 'uploads', what: 'boom', at },
      { step: 'profileAndDoctors', where: 'profileAndDoctors', what: 'boom', at },
      { step: 'orderMedicalFile', where: 'medical-file', what: 'medical file not ordered: HTTP 500', at },
      { step: 'openLegacyPage', where: 'openLegacyPage', what: 'boom', at },
    ]);
    const md = readme(PRESENT, FILE, errors);
    const section = md.slice(md.indexOf('## What this export failed'), md.indexOf('## Lab values'));
    expect(section).toContain('- The full medical file: ordering or downloading a fresh one failed.');
    expect(section).toContain('- `profile/`: collecting it stopped partway.');
    expect(section).toContain('- `my-doctor/`: collecting it stopped partway.');
    expect(section).toContain('- `referrals/`: 2 documents could not be collected.');
    expect(section).toContain('- `communication-with-doctor/`: 1 record could not be collected.');
    expect(section).toContain('- `uploads/`: collecting it stopped partway.');
    expect(section).toContain('- 1 other failure, not tied to a folder.');
    expect(section).toContain('`export-errors.json` lists each');
    // In reading order: the medical file, then the folders as the README lists them.
    expect(section.indexOf('medical file')).toBeLessThan(section.indexOf('`profile/`'));
    expect(section.indexOf('`referrals/`')).toBeLessThan(section.indexOf('`communication-with-doctor/`'));
  });

  it('names the version and file layout that made the export, and when collection began', () => {
    const md = readme().replace(/\s+/g, ' ');
    expect(md).toContain('Exported 2026-09-18 from online.maccabi4u.co.il with the Health Records Export for Maccabi browser extension, version 0.6.1, file layout 2;');
    expect(md).not.toContain('collected from');
    expect(md).not.toContain('development build');
    // A paused run can span days; the day is Israel's, as the export's own name is.
    const paused = readme(PRESENT, FILE, [], { ...MADE, startedAt: '2026-09-16T22:30:00.000Z', dev: true }).replace(/\s+/g, ' ');
    expect(paused).toContain('Exported 2026-09-18 (collected from 2026-09-17) from online.maccabi4u.co.il');
    expect(paused).toContain('version 0.6.1, file layout 2 (development build);');
  });

  it('starts from the full medical file, by its name', () => {
    const md = readme();
    expect(md).toContain('`2026-09-18_medical-file.pdf`, beside this file');
    expect(md).toContain('as of 2026-09-18');
    // Its parts, in the order three members' files had them, so an assistant can go to the right pages.
    expect(md).toContain('each page headed `דף N`, its page in the PDF');
    expect(md).toContain('headed `העתק` and their copy date');
    expect(md.indexOf('full medical file')).toBeLessThan(md.indexOf('What this export does not contain'));
  });

  it('says so when there is no medical file', () => {
    const md = readme(PRESENT, null);
    expect(md).toContain('This export has no full medical file.');
    expect(md.replace(/\s+/g, ' ')).toContain('`export-errors.json` says why');
    expect(md).not.toContain('beside this file, is');
  });

  it('says what the export does not contain before what it does', () => {
    const md = readme();
    expect(md.indexOf('What this export does not contain')).toBeLessThan(md.indexOf('What is in this export'));
    for (const gap of ['DICOM', 'over 12 months old', 'over 2 years old', 'not "this was not checked"']) {
      expect(md).toContain(gap);
    }
  });

  it('warns about the values that do not mean what they appear to', () => {
    const md = readme();
    expect(md).toContain('both 0 means no range in those fields');
    expect(md).toContain('The range is\n  then often a line of `message_list`');
    expect(md).toContain('A `result` of 0 is often not a measurement.');
    expect(md).toContain('The same values appear up to three times');
    expect(md).toContain('`0001-01-01T00:00:00` means never set');
    expect(md).toContain('or of method, which a `message_list` note dates');
  });

  // Each is easy to misread without its note: a renewal as a visit, one visit's PDF as many prescriptions.
  it('says which records are not what they look like', () => {
    const all = { ...PRESENT, 'visit-summaries': 2, 'medications-and-prescriptions': 3, referrals: 2, 'communication-with-doctor': 2 };
    const md = readme(all).replace(/\s+/g, ' ');
    expect(md).toContain('A visit is not always a meeting');
    expect(md).toContain('one PDF per visit, named by its `clicks_visit_number`');
    expect(md).toContain('identical ones included: count every row');
    expect(md).toContain('some are a purpose, not a condition');
    expect(md).toContain('take sex and age from `profile/member.json`');
    expect(md).toContain('blood pressure, weight and BMI only in the medical file');
  });

  it('lists the fields that carry no information, so a reader skips them', () => {
    const md = readme();
    for (const noise of ['`hash`', '`timestamp`', '`searchQueryId`', 'ends in `link`']) {
      expect(md).toContain(noise);
    }
  });

  it('says the data carries the national ID, and file names do not', () => {
    const md = readme();
    expect(md).toContain('national ID number');
    expect(md).toContain('File names never carry it.');
  });

  // Each document is saved once, so a reader follows a record's pointer instead of counting a copy twice.
  it('says how a record points to a document saved elsewhere', () => {
    const all = { ...PRESENT, 'communication-with-doctor': 3, uploads: 2, 'visit-summaries': 2 };
    const md = readme(all).replace(/\s+/g, ' ');
    expect(md).toContain('`files[]` lists a record\'s documents: `file`, its own, or `same_as`');
    expect(md).toContain('saved once, in its own folder, and the inquiry\'s `files[]` names it');
    expect(md).toContain('A document uploaded twice is saved once');
    expect(md).toContain('older visits that answered a doctor inquiry');
  });

  it('is dated', () => {
    expect(readme()).toContain('Exported 2026-09-18 from online.maccabi4u.co.il');
  });

  // It shares an AI reader's context with the records themselves, so its length is part of its job.
  it('stays short enough to read beside the records', () => {
    expect(readme().length).toBeLessThan(14000);
  });
});

describe('exportErrors', () => {
  it('puts a problem against the folder of its path, else the folders its step writes', () => {
    expect(exportErrors([
      { step: 'referrals', where: 'referrals/list.json', what: 'HTTP 500', at },
      { step: 'savedDocuments', where: 'uploads', what: 'boom', at },
      { step: 'emptySections', where: 'emptySections', what: 'boom', at },
      { step: 'waitMedicalFile', where: 'medical-file', what: 'still status 2', at },
      { step: 'openLegacyPage', where: 'openLegacyPage', what: 'boom', at },
    ])).toEqual([
      { folders: ['referrals'], step: 'referrals', where: 'referrals/list.json', what: 'HTTP 500', at },
      { folders: ['uploads'], step: 'savedDocuments', where: 'uploads', what: 'boom', at },
      { folders: ['allergies-sensitivity', 'appointments', 'requests-approvals'], step: 'emptySections', where: 'emptySections', what: 'boom', at },
      { folders: ['medical-file'], step: 'waitMedicalFile', where: 'medical-file', what: 'still status 2', at },
      { folders: [], step: 'openLegacyPage', where: 'openLegacyPage', what: 'boom', at },
    ]);
  });

  it('knows a step for every folder the README describes', () => {
    const written = new Set(PLAN.flatMap((s) => STEP_FOLDERS[s]));
    const md = readme(Object.fromEntries([...written].map((f) => [f, 1])));
    for (const [, name] of md.matchAll(/\*\*`([a-z-]+)\/`\*\* ·/g)) expect(written).toContain(name);
    expect(md).not.toContain('This export has no `');
  });
});

describe('INSTRUCTION_POINTERS', () => {
  it('has Claude Code import the README and Codex read it', () => {
    expect(INSTRUCTION_POINTERS['CLAUDE.md']).toMatch(/^@README\.md$/m);
    expect(INSTRUCTION_POINTERS['AGENTS.md']).toContain('Read README.md');
  });
});
