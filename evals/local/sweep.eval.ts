import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { test } from '@playwright/test';

import { THRESHOLDS, type Thresholds } from '@/lib/fit';
import type { AnswerRecord } from '@/lib/fit/local/protocol';

import { fixtureSet, loadHoldout, type Fixture } from '../holdout';

import type { ModelResult } from './compare.eval';
import { pct, type Counts, type Totals } from './score';
import { explore, GRID, Replayer, tuneAndReport, type Split } from './sweep';

/**
 * Runs the offline v2 threshold sweep (sweep.ts) over recorded eval results.
 * No browser, no model: Playwright is only the TypeScript runner here.
 *
 *   FIT_TUNE=fixtures FIT_REPORT=holdout \
 *     npx playwright test -c evals/local/playwright.config.ts sweep
 *
 * Env:
 * - FIT_TUNE / FIT_REPORT: the declared splits (default fixtures / holdout):
 *   `fixtures`, `holdout`, `<set>:even` / `<set>:odd` (alternate JDs in name
 *   order), or JD names joined with "+". They must be disjoint.
 * - FIT_SWEEP_FILES: comma-separated v2 result files (default: every
 *   `*-v2*.json` in results/ and results/holdout/). Each model's answers are
 *   pooled across its files by JD name.
 *
 * Writes <date>-sweep.md next to the report split's results (results/holdout/
 * when the holdout is involved: gitignored).
 */

const RESULTS = path.join(__dirname, 'results');
const HOLDOUT_RESULTS = path.join(RESULTS, 'holdout');
const DATE = new Date().toISOString().slice(0, 10);

const ALL: Record<string, Fixture[]> = { fixtures: fixtureSet(), holdout: loadHoldout().labelled };

function parseSplit(spec: string): Split {
  const [set, half] = spec.split(':');
  if (ALL[set]) {
    const cases = [...ALL[set]].sort((a, b) => a.name.localeCompare(b.name));
    if (!half) return { name: spec, cases };
    if (half !== 'even' && half !== 'odd') throw new Error(`Unknown split half "${half}" (even|odd)`);
    return { name: spec, cases: cases.filter((_, i) => i % 2 === (half === 'even' ? 0 : 1)) };
  }
  const pool = [...ALL.fixtures, ...ALL.holdout];
  const cases = spec.split('+').map((name) => {
    const c = pool.find((x) => x.name === name);
    if (!c) throw new Error(`No labelled JD named ${name}`);
    return c;
  });
  return { name: spec, cases };
}

function resultFiles(): string[] {
  if (process.env.FIT_SWEEP_FILES) return process.env.FIT_SWEEP_FILES.split(',').map((f) => path.resolve(f));
  return [RESULTS, HOLDOUT_RESULTS]
    .filter((d) => existsSync(d))
    .flatMap((d) => readdirSync(d).filter((f) => /-v2.*\.json$/.test(f)).map((f) => path.join(d, f)));
}

/** model id → JD name → answers (the `all` run's). */
function answersByModel(): Map<string, Map<string, AnswerRecord[]>> {
  const out = new Map<string, Map<string, AnswerRecord[]>>();
  for (const file of resultFiles()) {
    const r = JSON.parse(readFileSync(file, 'utf8')) as ModelResult;
    const model = r.model.replace(/-v2.*$/, '');
    const byCase = out.get(model) ?? new Map<string, AnswerRecord[]>();
    for (const c of r.cases) if (c.allAnswers) byCase.set(c.fixture, c.allAnswers);
    out.set(model, byCase);
  }
  return out;
}

const fmt = (c: Counts) => {
  const p = pct(c);
  return p === null ? '–' : `${(p * 100).toFixed(1)}% (${c.correct}/${c.total})`;
};
const fmtT = (t: Thresholds) => `keep ${t.keep}, drop ${t.drop}, priority ${t.priority}, skill ${t.skill}`;
const line = (name: string, t: Totals) =>
  `| ${name} | ${fmt(t.keep)} | ${fmt(t.rowAgreement)} | ${fmt(t.addSkillsPrecision)} | ${fmt(t.addSkillsRecall)} | ${fmt(t.priorityWhereCodeNull)} | ${t.spuriousRows} |`;
const HEAD = ['| | Keep/drop | Row agreement | addSkills precision | addSkills recall | Priority (code had none) | Spurious rows |', '|---|---|---|---|---|---|---|'];

test('v2 threshold sweep', () => {
  test.setTimeout(60 * 60_000);
  const tune = parseSplit(process.env.FIT_TUNE ?? 'fixtures');
  const report = parseSplit(process.env.FIT_REPORT ?? 'holdout');
  const md: string[] = [
    `# v2 threshold sweep, ${DATE}`,
    '',
    `Declared split: tune on **${tune.name}** (${tune.cases.length} JDs), report on **${report.name}** (${report.cases.length} JDs). Grid per threshold: ${GRID.join(', ')}. Starting thresholds: ${fmtT(THRESHOLDS)}.`,
    '',
  ];
  for (const [model, answers] of answersByModel()) {
    const missing = [...tune.cases, ...report.cases].filter((c) => !answers.has(c.name)).map((c) => c.name);
    if (missing.length) {
      md.push(`## ${model}`, '', `Skipped: no recorded answers for ${missing.join(', ')}.`, '');
      continue;
    }
    const replayer = new Replayer(answers);
    const tuned = tuneAndReport(replayer, tune, report, THRESHOLDS);
    const ex = explore(replayer, tune, THRESHOLDS);
    md.push(
      `## ${model}`,
      '',
      `Chosen on ${tune.name}: ${fmtT(tuned.chosen)}.`,
      '',
      `### Reported on ${report.name} (the number that counts)`,
      '',
      ...HEAD,
      line('no model', tuned.onReport.noModel),
      line(`v2 at start (${fmtT(THRESHOLDS)})`, tuned.onReport.start),
      line('v2 at chosen', tuned.onReport.chosen),
      '',
      `### On ${tune.name} (in-sample)`,
      '',
      ...HEAD,
      line('no model', tuned.onTune.noModel),
      line('v2 at start', tuned.onTune.start),
      line('v2 at chosen (fitted here)', tuned.onTune.chosen),
      line('v2 at start, every candidate routed', ex.routeEverythingAtStart),
      '',
      `One threshold at a time on ${tune.name}, others at start (${ex.warning})`,
      '',
      '| τ | ' + GRID.join(' | ') + ' |',
      '|---|' + GRID.map(() => '---').join('|') + '|',
      ...(['keep', 'drop', 'priority', 'skill'] as const).map(
        (dim) => `| ${dim}: rows / keep | ${ex.curves[dim].map((p) => `${p.totals.rowAgreement.correct} / ${p.totals.keep.correct}`).join(' | ')} |`,
      ),
      '',
    );
  }
  const holdoutInvolved = [tune, report].some((s) => s.cases.some((c) => ALL.holdout.includes(c)));
  const dir = holdoutInvolved ? HOLDOUT_RESULTS : RESULTS;
  mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${DATE}-sweep.md`);
  writeFileSync(out, md.join('\n'));
  console.log(md.join('\n'));
  console.log(`wrote ${out}`);
});
