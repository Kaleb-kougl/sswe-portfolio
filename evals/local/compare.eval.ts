import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';

import {
  analyzeWithDecisions,
  decideAll,
  defaultDecision,
  segmentJd,
  type FitReport,
  type SegmentDecision,
  type SegmentedJd,
} from '@/lib/fit';
import { LOCAL_MODELS, formatBytes, type LocalModelId } from '@/lib/fit/local/model';
import type { AnswerRecord, RunStats, RunStrategy } from '@/lib/fit/local/protocol';

import { fixtureSet, loadCaseDir, HOLDOUT_DIR, type Fixture } from '../holdout';

import { pct, scoreFixture, scoreNoModel, totals, type Counts, type FixtureScore, type Totals } from './score';

/**
 * MODEL COMPARISON on the real runtime: each candidate model runs every
 * labelled JD through the real worker (WebLLM on WebGPU) via the dev
 * harness's `window.__fitEval` hook, and the no-model path runs the same JDs
 * in Node. Both are scored against the labels (score.ts). The plan's rule:
 * the model ships only if it beats the no-model path.
 *
 *   # a dev server of your own, on a free port, with contact delivery off
 *   CONTACT_DELIVERY_KEY= npx next dev -p 3217
 *   FIT_EVAL_PROFILE=/path/to/chrome-profile \
 *     npx playwright test -c evals/local/playwright.config.ts compare
 *
 * Env:
 * - FIT_EVAL_URL (default http://localhost:3217)
 * - FIT_EVAL_PROFILE: a persistent Chromium profile, so weights download once
 * - FIT_MODELS: comma-separated LOCAL_MODELS ids (default all)
 * - FIT_STRATEGIES: `v1`, `v2` or `v1,v2` (default `v1`)
 * - FIT_CASES: `fixtures` (default), `holdout` (evals/cases/holdout, see
 *   evals/holdout.ts), or a directory in the holdout format
 * - FIT_EVAL_TAG: suffix for a variant run's result files
 *
 * Headless `chromium` channel gets the real GPU adapter (Metal on a Mac);
 * the default headless shell does not.
 *
 * v2 runs each case twice: once asking EVERY question (`questions: 'all'`)
 * so the P(yes) of every question is recorded for offline threshold sweeps
 * (sweep.ts; no model re-run needed), and once as the product would
 * (`routed`) for the report, the timings and the question count. The
 * replay of the first run's answers through `decideAll` must reproduce the
 * second run's decisions (recorded as `replayMatches`).
 *
 * Writes <results>/<date>-<model>-<strategy>.json (raw runs + scores) and
 * <date>-summary<tag>.md. Results for anything but the fixtures go to
 * results/holdout/ (gitignored: they quote third-party postings). Decoding
 * is deterministic, so one run per case; a warm-up run first keeps shader
 * compilation out of the timings.
 */

const BASE = process.env.FIT_EVAL_URL ?? 'http://localhost:3217';
const PROFILE = process.env.FIT_EVAL_PROFILE;
const MODELS = (process.env.FIT_MODELS?.split(',') ?? Object.keys(LOCAL_MODELS)) as LocalModelId[];
const STRATEGIES = (process.env.FIT_STRATEGIES?.split(',') ?? ['v1']) as RunStrategy[];
const CASES_ARG = process.env.FIT_CASES ?? 'fixtures';
const DATE = new Date().toISOString().slice(0, 10);
/** Labels a variant run (e.g. a grammar experiment): results go to <date>-<model>-<strategy>-<tag>.json. */
const TAG = process.env.FIT_EVAL_TAG ? `-${process.env.FIT_EVAL_TAG}` : '';

function loadCases(): { cases: Fixture[]; results: string } {
  if (CASES_ARG === 'fixtures') return { cases: fixtureSet(), results: path.join(__dirname, 'results') };
  const dir = CASES_ARG === 'holdout' ? HOLDOUT_DIR : path.resolve(CASES_ARG);
  const { labelled, unlabelled } = loadCaseDir(dir);
  if (unlabelled.length) console.log(`${unlabelled.length} case(s) without labels skipped: ${unlabelled.join(', ')}`);
  return { cases: labelled, results: path.join(__dirname, 'results', 'holdout') };
}

const { cases: CASES, results: RESULTS } = loadCases();

interface EvalRun {
  report: FitReport;
  stats: RunStats | null;
  decisions: SegmentDecision[] | null;
  answers: AnswerRecord[] | null;
  rows: { index: number; atMs: number }[];
  wallMs: number;
}

export interface CaseResult {
  fixture: string;
  run?: Omit<EvalRun, 'rows'> & { rowTimesMs: number[] };
  /** v2: every question's answer (questions: 'all'), for offline sweeps. */
  allAnswers?: AnswerRecord[];
  allStats?: RunStats | null;
  /** v2: `decideAll(seg, allAnswers)` equals the routed run's decisions. */
  replayMatches?: boolean;
  error?: string;
  score?: FixtureScore;
}

export interface ModelResult {
  model: string;
  strategy?: RunStrategy | 'none';
  date: string;
  cases_set?: string;
  downloadBytes: number | null;
  load?: { fromCache: boolean; elapsedMs: number };
  cases: CaseResult[];
  totals: Totals;
  timing: Timing | null;
}

interface Timing {
  firstRowMs: Stat;
  firstDecisionMs: Stat;
  totalMs: Stat;
  prefillTokPerS: Stat;
  decodeTokPerS: Stat;
  grammarMsPerToken: Stat;
  completionTokensPerCandidate: Stat;
  decidedByModel: string;
  /** v2 */
  questionsPerCase?: Stat;
  questionMs?: Stat;
  questionPromptTokens?: Stat;
  overrides?: { keep: number; drop: number; priority: number; skills: number };
  replayMatches?: string;
}

interface Stat {
  median: number | null;
  max: number | null;
}

const stat = (xs: (number | null | undefined)[]): Stat => {
  const v = xs.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return { median: null, max: null };
  const mid = Math.floor(v.length / 2);
  return { median: v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2, max: v[v.length - 1] };
};

function timing(cases: CaseResult[]): Timing | null {
  const runs = cases.flatMap((c) => (c.run ? [c.run] : []));
  if (!runs.length) return null;
  const s = runs.map((r) => r.stats);
  const decided = s.reduce((a, x) => a + (x?.decidedByModel ?? 0), 0);
  const asked = s.reduce((a, x) => a + (x?.candidates ?? 0), 0);
  const v2 = s.some((x) => x?.strategy === 'v2');
  const answers = runs.flatMap((r) => r.answers ?? []);
  return {
    firstRowMs: stat(s.map((x) => x?.firstRowMs)),
    firstDecisionMs: stat(s.map((x) => x?.firstDecisionMs)),
    totalMs: stat(s.map((x) => x?.totalMs)),
    prefillTokPerS: stat(s.map((x) => x?.prefillTokensPerSecond)),
    decodeTokPerS: stat(s.map((x) => x?.tokensPerSecond)),
    grammarMsPerToken: stat(s.map((x) => x?.grammarPerTokenMs)),
    completionTokensPerCandidate: stat(
      s.map((x) => (x?.completionTokens && x.candidates ? x.completionTokens / x.candidates : null)),
    ),
    decidedByModel: `${decided} of ${asked}`,
    ...(v2
      ? {
          questionsPerCase: stat(s.map((x) => x?.questionsAsked)),
          questionMs: stat(answers.map((a) => a.ms)),
          questionPromptTokens: stat(answers.map((a) => a.promptTokens)),
          overrides: s.reduce(
            (acc, x) => ({
              keep: acc.keep + (x?.overrides?.keep ?? 0),
              drop: acc.drop + (x?.overrides?.drop ?? 0),
              priority: acc.priority + (x?.overrides?.priority ?? 0),
              skills: acc.skills + (x?.overrides?.skills ?? 0),
            }),
            { keep: 0, drop: 0, priority: 0, skills: 0 },
          ),
          replayMatches: `${cases.filter((c) => c.replayMatches).length} of ${cases.filter((c) => c.replayMatches !== undefined).length}`,
        }
      : {}),
  };
}

function write(name: string, data: unknown) {
  mkdirSync(RESULTS, { recursive: true });
  writeFileSync(path.join(RESULTS, `${DATE}-${name}.json`), `${JSON.stringify(data, null, 2)}\n`);
}

async function openHarness(): Promise<{ ctx: BrowserContext; page: Page }> {
  if (!PROFILE) throw new Error('Set FIT_EVAL_PROFILE to a Chromium profile directory.');
  const ctx = await chromium.launchPersistentContext(PROFILE, { channel: 'chromium', headless: true });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`${BASE}/fit/dev`);
  await page.waitForFunction(() => Boolean(window.__fitEval), null, { timeout: 120_000 });
  return { ctx, page };
}

const runCase = (page: Page, jd: string, opts: { strategy: RunStrategy; questions?: 'routed' | 'all' }) =>
  page.evaluate(([j, o]) => window.__fitEval!.run(j, o), [jd, opts] as const) as Promise<EvalRun>;

test.describe.configure({ mode: 'serial' });

test('no-model path', () => {
  const now = new Date();
  const cases: CaseResult[] = CASES.map((f) => ({ fixture: f.name, score: scoreNoModel(f, now) }));
  const result: ModelResult = {
    model: 'no-model',
    strategy: 'none',
    date: DATE,
    cases_set: CASES_ARG,
    downloadBytes: 0,
    cases,
    totals: totals(cases.map((c) => c.score!)),
    timing: null,
  };
  write('no-model', result);
});

for (const modelId of MODELS) {
  for (const strategy of STRATEGIES) {
    test(`${modelId} ${strategy}`, async () => {
      test.setTimeout(60 * 60_000);
      const { ctx, page } = await openHarness();
      try {
        const load = await page.evaluate((id) => window.__fitEval!.load(id as never), modelId);
        console.log(`${modelId}: loaded`, load);
        // Warm-up: first-run shader compilation stays out of the timings.
        await runCase(page, CASES[0].jd, { strategy });

        const cases: CaseResult[] = [];
        for (const fixture of CASES) {
          const now = new Date();
          try {
            const result: CaseResult = { fixture: fixture.name };
            if (strategy === 'v2') {
              const all = await runCase(page, fixture.jd, { strategy, questions: 'all' });
              result.allAnswers = all.answers ?? [];
              result.allStats = all.stats;
            }
            const run = await runCase(page, fixture.jd, { strategy });
            expect(run.decisions).not.toBeNull();
            const score = scoreFixture(fixture, run.decisions!, run.report, now);
            const { rows, ...rest } = run;
            result.run = { ...rest, rowTimesMs: rows.map((r) => Math.round(r.atMs)) };
            result.score = score;
            if (result.allAnswers) {
              const seg = segmentJd(fixture.jd.trim());
              result.replayMatches =
                JSON.stringify(decideAll(seg, result.allAnswers).map((t) => t.decision)) === JSON.stringify(run.decisions);
            }
            cases.push(result);
            console.log(
              `${modelId} ${strategy} ${fixture.name}: keep ${score.keep.correct}/${score.keep.total}, rows ${score.rowAgreement.correct}/${score.rowAgreement.total}, ${Math.round(run.stats?.totalMs ?? 0)} ms, ` +
                (strategy === 'v2'
                  ? `${run.stats?.questionsAsked} questions, overrides ${JSON.stringify(run.stats?.overrides)}, replay ${result.replayMatches}`
                  : `decided ${run.stats?.decidedByModel}/${run.stats?.candidates}`),
            );
          } catch (err) {
            cases.push({ fixture: fixture.name, error: err instanceof Error ? err.message : String(err) });
            console.log(`${modelId} ${strategy} ${fixture.name}: FAILED`, err);
          }
        }
        const scored = cases.flatMap((c) => (c.score ? [c.score] : []));
        const result: ModelResult = {
          model: `${modelId}-${strategy}${TAG}`,
          strategy,
          date: DATE,
          cases_set: CASES_ARG,
          downloadBytes: LOCAL_MODELS[modelId].downloadBytes,
          load,
          cases,
          totals: totals(scored),
          timing: timing(cases),
        };
        write(`${modelId}-${strategy}${TAG}`, result);
      } finally {
        await page.evaluate(() => window.__fitEval?.dispose()).catch(() => {});
        await ctx.close();
      }
    });
  }
}

test('summary', () => {
  const files = readdirSync(RESULTS).filter((f) => f.startsWith(DATE) && f.endsWith('.json'));
  const results = files.map((f) => JSON.parse(readFileSync(path.join(RESULTS, f), 'utf8')) as ModelResult);
  results.sort((a, b) => (a.model === 'no-model' ? -1 : b.model === 'no-model' ? 1 : a.model.localeCompare(b.model)));
  const tag = CASES_ARG === 'fixtures' ? (STRATEGIES.includes('v2') ? '-v2' : '') : '-holdout';
  writeFileSync(path.join(RESULTS, `${DATE}-summary${tag}${TAG}.md`), summarize(results));
});

const fmtPct = (c: Counts | undefined) => {
  if (!c) return '–';
  const p = pct(c);
  return p === null ? '–' : `${(p * 100).toFixed(1)}% (${c.correct}/${c.total})`;
};
const fmtMs = (s: Stat | undefined) => (s?.median == null ? '–' : `${(s.median / 1000).toFixed(2)} s (max ${(s.max! / 1000).toFixed(2)})`);
const fmtNum = (s: Stat | undefined, digits = 0) => (s?.median == null ? '–' : s.median.toFixed(digits));

/**
 * What-ifs over the recorded decisions (no re-run needed): the same model
 * output merged under a narrower role for the model (v1 results only).
 * - noAdd: the model's keep/drop and priority, but none of its addSkills.
 * - unknownOnly: the model decides only segments in no recognised section
 *   (headerless prose), without addSkills; code's defaultDecision elsewhere.
 */
const VARIANTS: Record<string, (seg: SegmentedJd, d: readonly SegmentDecision[]) => SegmentDecision[]> = {
  noAdd: (_seg, d) => d.map((x) => ({ ...x, addSkills: [] })),
  unknownOnly: (seg, d) =>
    d.map((x, k) => {
      const segment = seg.segments[seg.candidates[k]];
      return segment.section === 'unknown' ? { ...x, addSkills: [] } : defaultDecision(segment);
    }),
};

function variantTotals(result: ModelResult, variant: keyof typeof VARIANTS): Totals | null {
  const scores: FixtureScore[] = [];
  for (const fixture of CASES) {
    const decisions = result.cases.find((c) => c.fixture === fixture.name)?.run?.decisions;
    if (!decisions) return null;
    const now = new Date();
    const d = VARIANTS[variant](segmentJd(fixture.jd.trim()), decisions);
    scores.push(scoreFixture(fixture, d, analyzeWithDecisions(fixture.jd, d, now), now));
  }
  return totals(scores);
}

function summarize(results: ModelResult[]): string {
  const cols = results.map((r) => r.model.replace(/-q4f16_1-MLC/, ''));
  const row = (name: string, f: (r: ModelResult) => string) => `| ${name} | ${results.map(f).join(' | ')} |`;
  const v2 = (r: ModelResult) => r.strategy === 'v2' || /-v2\b/.test(r.model);
  return [
    `# Local model comparison, ${DATE}${CASES_ARG === 'fixtures' ? '' : ` (${CASES_ARG})`}`,
    '',
    `${CASES.length} labelled JDs (${CASES_ARG}), this machine's GPU via headless Chromium. v1: one grammar-forced generation per JD; v2: routed per-segment yes/no questions with abstention (plan 2f, thresholds as in src/lib/fit/abstain.ts).`,
    'Accuracy is against the labels; "row agreement" is against the report a perfect model would give.',
    '',
    `| Metric | ${cols.join(' | ')} |`,
    `|---|${cols.map(() => '---').join('|')}|`,
    row('Download', (r) => (r.downloadBytes ? formatBytes(r.downloadBytes) : '0')),
    row('Keep/drop accuracy (per segment)', (r) => fmtPct(r.totals.keep)),
    row('Requirements kept (recall)', (r) => fmtPct(r.totals.keptLabelled)),
    row('Recall incl. labels segmentation missed', (r) => fmtPct(r.totals.recallInclMissed)),
    row('Keeps that are requirements (precision)', (r) => fmtPct(r.totals.keptPrecision)),
    row('Priority accuracy where code had none', (r) => fmtPct(r.totals.priorityWhereCodeNull)),
    row('addSkills precision', (r) => fmtPct(r.totals.addSkillsPrecision)),
    row('addSkills recall', (r) => fmtPct(r.totals.addSkillsRecall)),
    row('Verdict agreement (labelled rows)', (r) => fmtPct(r.totals.verdictAgreement)),
    row('Row agreement (priority + verdict + skills)', (r) => fmtPct(r.totals.rowAgreement)),
    row('Spurious rows', (r) => String(r.totals.spuriousRows)),
    row('Coverage = ideal', (r) => fmtPct(r.totals.coverageExact)),
    row('Decided by model', (r) => r.timing?.decidedByModel ?? '–'),
    row('v2 questions per JD (median / max)', (r) => (v2(r) && r.timing?.questionsPerCase?.median != null ? `${r.timing.questionsPerCase.median} / ${r.timing.questionsPerCase.max}` : '–')),
    row('v2 per-question latency (median / max)', (r) => (v2(r) && r.timing?.questionMs?.median != null ? `${r.timing.questionMs.median.toFixed(0)} ms / ${r.timing.questionMs.max!.toFixed(0)} ms` : '–')),
    row('v2 tokens prefilled per question (median)', (r) => (v2(r) ? fmtNum(r.timing?.questionPromptTokens) : '–')),
    row('v2 overrides (keep / drop / priority / skills)', (r) => {
      const o = r.timing?.overrides;
      return v2(r) && o ? `${o.keep} / ${o.drop} / ${o.priority} / ${o.skills}` : '–';
    }),
    row('v2 replay = runtime', (r) => (v2(r) ? (r.timing?.replayMatches ?? '–') : '–')),
    row('First row (median)', (r) => fmtMs(r.timing?.firstRowMs)),
    row('First decision (median)', (r) => fmtMs(r.timing?.firstDecisionMs)),
    row('Total (median)', (r) => fmtMs(r.timing?.totalMs)),
    row('Prefill tok/s', (r) => fmtNum(r.timing?.prefillTokPerS)),
    row('Decode tok/s', (r) => fmtNum(r.timing?.decodeTokPerS)),
    '',
    '## What-ifs on v1 outputs (row agreement / keep-drop accuracy)',
    '',
    `| Variant | ${cols.join(' | ')} |`,
    `|---|${cols.map(() => '---').join('|')}|`,
    ...Object.keys(VARIANTS).map((v) =>
      row(v, (r) => {
        if (r.model === 'no-model' || v2(r)) return '–';
        const t = variantTotals(r, v);
        return t ? `${fmtPct(t.rowAgreement)} / ${fmtPct(t.keep)}` : '–';
      }),
    ),
    '',
    '## Per JD: row agreement',
    '',
    `| JD | ${cols.join(' | ')} |`,
    `|---|${cols.map(() => '---').join('|')}|`,
    ...CASES.map((f) =>
      row(f.name, (r) => {
        const c = r.cases.find((x) => x.fixture === f.name);
        return c?.score ? fmtPct(c.score.rowAgreement) : c?.error ? 'error' : '–';
      }),
    ),
    '',
  ].join('\n');
}
