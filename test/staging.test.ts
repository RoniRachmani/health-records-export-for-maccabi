import { describe, expect, it } from 'vitest';
import { countByKey, keyAfterWrite, stagingKey, type FileMeta } from '../src/extension/shared/staging';

describe('staged file keys', () => {
  const meta = (rel: string, key?: string): FileMeta => ({ rel, size: 1, sha256: 'x', ...(key ? { key } : {}) });

  it('names the step, and the part of it when the collector has reported one', () => {
    expect(stagingKey('testResults', '')).toBe('testResults');
    expect(stagingKey('testResults', 'lab histories')).toBe('testResults:lab histories');
  });

  it('keeps the first writer’s key when a file is written again', () => {
    expect(keyAfterWrite(undefined, 'visits:visits')).toBe('visits:visits');
    expect(keyAfterWrite(meta('a.json', 'testResults:test results'), 'waitMedicalFile:letters')).toBe('testResults:test results');
    // A file staged by a version that kept no keys stays uncounted.
    expect(keyAfterWrite(meta('a.json'), 'visits:visits')).toBeUndefined();
  });

  it('counts files per key, and files without one nowhere', () => {
    expect(countByKey([meta('a', 'visits'), meta('b', 'visits'), meta('c', 'letters:letters'), meta('README.md')]))
      .toEqual({ visits: 2, 'letters:letters': 1 });
  });
});
