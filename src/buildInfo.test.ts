import { describe, expect, it } from 'vitest';
import { BUILD, versionLabel, type BuildInfo } from './buildInfo';

const build = (over: Partial<BuildInfo>): BuildInfo => ({
  tag: null, rev: 'abc1234', dirty: false, date: '2026-10-31', lines: { code: 1, tests: 1, files: 1 }, ...over,
});

describe('build info', () => {
  it('names a tagged build by its tag, and any other by its revision', () => {
    expect(versionLabel(build({ tag: 'v1.1.0' }))).toBe('v1.1.0');
    expect(versionLabel(build({}))).toBe('abc1234');
    expect(versionLabel(build({ dirty: true }))).toBe('abc1234 + local changes');
    expect(versionLabel(build({ rev: null }))).toBe('unknown');
  });

  it('counts the source when the config bundles it', () => {
    expect(BUILD.lines.code).toBeGreaterThan(1000);
    expect(BUILD.lines.files).toBeGreaterThan(10);
  });
});
