import { describe, expect, it } from 'vitest';

import { FitReport } from '@/lib/fit/contract';
import { judge } from '@/lib/fit/judge';
import { reportToMarkdown } from '@/lib/fit/markdown';
import { scanJd } from '@/lib/fit/scan';

import { FIXTURE_NOW, FIXTURES } from './fixtures';

/*
 * The reports these fixtures produce are kept as Markdown files beside them,
 * so a change to the judging rules shows up as a readable diff of what a
 * recruiter would see. Update with `npx vitest run -u __tests__/fit`.
 */
describe.each(FIXTURES)('fixture: $name', ({ name, jd, extraction }) => {
  const report = judge(extraction, undefined, FIXTURE_NOW);
  const scan = scanJd(jd, undefined, FIXTURE_NOW);

  it('produces a report that satisfies the contract', () => {
    expect(() => FitReport.parse(report)).not.toThrow();
    expect(() => FitReport.parse(scan)).not.toThrow();
  });

  it('renders the model-mode report', async () => {
    await expect(reportToMarkdown(report)).toMatchFileSnapshot(`./fixtures/${name}.report.md`);
  });

  it('renders the scan-mode report', async () => {
    await expect(reportToMarkdown(scan)).toMatchFileSnapshot(`./fixtures/${name}.scan.md`);
  });
});

describe('fixture verdicts that must not drift', () => {
  const byName = Object.fromEntries(FIXTURES.map((f) => [f.name, judge(f.extraction, undefined, FIXTURE_NOW)]));
  const verdicts = (name: string) => byName[name].requirements.map((r) => r.verdict);

  it('the poor match is mostly gaps', () => {
    const v = verdicts('poor-match-backend');
    expect(v.filter((x) => x === 'gap').length).toBeGreaterThanOrEqual(5);
    expect(byName['poor-match-backend'].coverage!.covered).toBeLessThan(byName['poor-match-backend'].coverage!.mustHaves / 2);
  });

  it('the marketing role is not a match', () => {
    const c = byName['non-engineering-marketing'].coverage!;
    expect(c.covered / c.mustHaves).toBeLessThan(0.5);
  });

  it('the frontend role is a strong match', () => {
    const c = byName['frontend-senior'].coverage!;
    expect(c.covered / c.mustHaves).toBeGreaterThan(0.8);
  });

  it('verdict tallies match the reviewed reports', () => {
    const tally = (name: string) => {
      const counts = { strong: 0, partial: 0, gap: 0, not_assessed: 0 };
      for (const r of byName[name].requirements) counts[r.verdict]++;
      return { ...counts, coverage: byName[name].coverage };
    };
    expect(Object.fromEntries(FIXTURES.map((f) => [f.name, tally(f.name)]))).toMatchSnapshot();
  });
});
