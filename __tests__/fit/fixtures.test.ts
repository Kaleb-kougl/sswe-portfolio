import { describe, expect, it } from 'vitest';

import { analyzeWithDecisions, analyzeWithoutModel } from '@/lib/fit/analyze';
import { FitReport } from '@/lib/fit/contract';
import { reportToMarkdown } from '@/lib/fit/markdown';
import { segmentJd } from '@/lib/fit/segment';

import { FIXTURE_NOW, FIXTURES, idealDecisions } from './fixtures';

/*
 * The reports these fixtures produce are kept as Markdown files beside them,
 * so a change to segmentation or judging shows up as a readable diff of what
 * a recruiter would see:
 * - `<name>.scan.md`: the no-model path (`analyzeWithoutModel`);
 * - `<name>.report.md`: model mode with a perfect model's decisions
 *   (`idealDecisions`, from the hand labels), the ceiling a real model is
 *   measured against.
 * Update with `npx vitest run -u __tests__/fit`.
 */
const reports = Object.fromEntries(
  FIXTURES.map((f) => [
    f.name,
    {
      model: analyzeWithDecisions(f.jd, idealDecisions(f, segmentJd(f.jd)), FIXTURE_NOW),
      scan: analyzeWithoutModel(f.jd, FIXTURE_NOW),
    },
  ]),
);

describe.each(FIXTURES)('fixture: $name', ({ name, role }) => {
  const { model, scan } = reports[name];

  it('produces reports that satisfy the contract', () => {
    expect(() => FitReport.parse(model)).not.toThrow();
    expect(() => FitReport.parse(scan)).not.toThrow();
    expect(model.mode).toBe('model');
    expect(scan.mode).toBe('scan');
  });

  it('finds the role', () => {
    expect(scan.role).toBe(role);
    expect(model.role).toBe(role);
  });

  it('renders the model-mode report', async () => {
    await expect(reportToMarkdown(model)).toMatchFileSnapshot(`./fixtures/${name}.report.md`);
  });

  it('renders the no-model report', async () => {
    await expect(reportToMarkdown(scan)).toMatchFileSnapshot(`./fixtures/${name}.scan.md`);
  });
});

describe('fixture verdicts that must not drift', () => {
  const coverageRatio = (name: string, mode: 'model' | 'scan') => {
    const c = reports[name][mode].coverage;
    return c ? c.covered / c.mustHaves : null;
  };

  it('the poor match is mostly gaps, in both modes', () => {
    for (const mode of ['model', 'scan'] as const) {
      const v = reports['poor-match-backend'][mode].requirements.map((r) => r.verdict);
      expect(v.filter((x) => x === 'gap').length, mode).toBeGreaterThanOrEqual(5);
      expect(coverageRatio('poor-match-backend', mode), mode).toBeLessThan(0.5);
    }
  });

  it('the marketing role is not a match: no coverage score over the few rows the vocabulary can assess', () => {
    for (const mode of ['model', 'scan'] as const) {
      expect(reports['non-engineering-marketing'][mode].coverage, mode).toBeNull();
      expect(reports['non-engineering-marketing'][mode].requirements.some((r) => r.verdict === 'strong'), mode).toBe(false);
    }
  });

  it('the frontend role is a strong match, in both modes', () => {
    expect(coverageRatio('frontend-senior', 'model')).toBeGreaterThan(0.8);
    expect(coverageRatio('frontend-senior', 'scan')).toBeGreaterThan(0.8);
  });

  it('verdict tallies match the reviewed reports', () => {
    const tally = (report: FitReport) => {
      const counts = { strong: 0, partial: 0, gap: 0, not_assessed: 0 };
      for (const r of report.requirements) counts[r.verdict]++;
      return { ...counts, coverage: report.coverage };
    };
    expect(
      Object.fromEntries(FIXTURES.map((f) => [f.name, { model: tally(reports[f.name].model), scan: tally(reports[f.name].scan) }])),
    ).toMatchSnapshot();
  });
});
