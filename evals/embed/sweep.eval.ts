import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { SKILLS_TABLE } from '@/data/corpus/skills';
import { decodeVocabulary, EMBED_PARAMS, type EmbedParams, type Vocabulary } from '@/lib/fit/embed';
import committed from '@/lib/fit/embed/skill-embeddings.json';
import { EMBED_MODEL, quantizeRows, vocabularyEntries, type SkillEmbeddingsFile } from '@/lib/fit/embed/vocabulary';

import { FIXTURE_NOW } from '../../__tests__/fit/fixtures';

import { fixtureSet, HOLDOUT_DIR, holdoutSet } from './data';
import { precision, prepareCases, prepareJds, recall, rowAgreement, tallyCases, tallyJds, type PreparedCases, type PreparedJd } from './metrics';
import { nodeEmbedder, type CandidateModel } from './node-embed';

/**
 * EMBEDDING MATCHER EVAL (plan 2f, item 6), in Node.
 *
 *   npx vitest run -c evals/embed/vitest.config.ts
 *
 * For each candidate model: embed the vocabulary (int8 round trip, as
 * shipped), embed every phrase of the hand-written cases (cases.ts), the 8
 * labelled fixtures and any labelled held-out JDs, then sweep τ × margin.
 *
 * - TUNE on the development data (`choose`): the hand-written lines and the
 *   8 fixtures (labelled misses = label skills the alias scan didn't find).
 * - REPORT that point on the held-out JDs (evals/holdout.ts), never tuned on.
 *
 * Env: EMBED_MODELS (comma-separated ids; default all), EMBED_HOLDOUT_DIR,
 * EMBED_CACHE_DIR. Writes evals/embed/results/<date>-sweep.{json,md};
 * holdout details go to results/holdout/ (gitignored: third-party text).
 */

const CANDIDATES: CandidateModel[] = [
  { id: 'Xenova/all-MiniLM-L6-v2', revision: '751bff37182d3f1213fa05d7196b954e230abad9', pooling: 'mean', onnxBytes: 22_972_869, license: 'apache-2.0' },
  { id: 'Xenova/paraphrase-MiniLM-L3-v2', revision: '4b544e74dfc3256b2b56849ea5d7064fee1ac846', pooling: 'mean', onnxBytes: 17_450_000, license: 'apache-2.0' },
  { id: 'Xenova/paraphrase-MiniLM-L6-v2', revision: '2bb9dc00941ae0b65da96d5dd95d4a4564161858', pooling: 'mean', onnxBytes: 22_970_000, license: 'apache-2.0' },
  { id: 'Snowflake/snowflake-arctic-embed-xs', revision: 'd8c86521100d3556476a063fc2342036d45c106f', pooling: 'cls', onnxBytes: 22_970_000, license: 'apache-2.0' },
  { id: 'mixedbread-ai/mxbai-embed-xsmall-v1', revision: 'e6ac24e5d6efb8782b59de1647b3ececb4ece94e', pooling: 'mean', onnxBytes: 24_400_000, license: 'apache-2.0' },
  { id: 'MongoDB/mdbr-leaf-mt', revision: '1ed41b22ce166d66c24f88ebfc340e1f03adb20f', pooling: 'mean', onnxBytes: 23_000_000, license: 'apache-2.0' },
  { id: 'Xenova/bge-small-en-v1.5', revision: 'ea104dacec62c0de699686887e3f920caeb4f3e3', pooling: 'cls', onnxBytes: 34_000_000, license: 'mit' },
  { id: 'Xenova/gte-small', revision: '5927d1727bb12db490052a1b33265ad78058de08', pooling: 'mean', onnxBytes: 34_000_000, license: 'mit' },
];

const SELECTED = process.env.EMBED_MODELS?.split(',');
const MODELS = SELECTED ? CANDIDATES.filter((m) => SELECTED.includes(m.id)) : CANDIDATES;
const RESULTS = path.join(__dirname, 'results');
const DATE = new Date().toISOString().slice(0, 10);

const TAUS = Array.from({ length: 56 }, (_, i) => +(0.4 + i * 0.01).toFixed(2));
const MARGINS = Array.from({ length: 16 }, (_, i) => +(i * 0.01).toFixed(2));
const CONTEXTS = (process.env.EMBED_CONTEXT_GRID ?? '0,0.3,0.35,0.4,0.45,0.5,0.55,0.6').split(',').map(Number);
const grid = (): EmbedParams[] =>
  TAUS.flatMap((tau) => MARGINS.flatMap((margin) => CONTEXTS.map((tauContext) => ({ tau, margin, tauContext, maxPerSegment: 3 }))));

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;

/** The shipped round trip: embed, int8-quantize, decode. */
async function liveVocabulary(embed: (t: string[]) => Promise<Float32Array[]>): Promise<Vocabulary> {
  const entries = vocabularyEntries(SKILLS_TABLE);
  const rows = await embed(entries.map((e) => e.text));
  const { scales, bytes } = quantizeRows(rows);
  const file: SkillEmbeddingsFile = {
    model: { id: '', revision: '', dtype: 'q8', pooling: '', dims: rows[0].length },
    hash: '',
    entries,
    scales,
    vectors: Buffer.from(bytes.buffer).toString('base64'),
  };
  return decodeVocabulary(file);
}

/**
 * The tuning rule, on the development data (hand-written lines + the 8
 * fixtures): no add at all on any negative line (the plan's "100% precision
 * on negatives"), no wrong add on the fixtures, at least 90% precision on
 * the synonym lines (an add outside a line's expect ∪ allow), then the best
 * recall over synonyms + fixture misses. The held-out JDs are the report.
 */
const MIN_DEV_PRECISION = 0.9;

/** Tie-break toward the stricter setting: precision first. */
const strictness = (p: EmbedParams) => p.tau + p.margin + p.tauContext;

function choose(cases: PreparedCases, fixtures: readonly PreparedJd[]): { params: EmbedParams; recall: number } | null {
  let best: { params: EmbedParams; recall: number } | null = null;
  for (const params of grid()) {
    const t = tallyCases(cases, params);
    if (t.negativeHits > 0 || precision(t) < MIN_DEV_PRECISION) continue;
    const f = tallyJds(fixtures, params);
    if (f.fp > 0) continue;
    const r = (t.tp + f.tp) / (t.gold + f.gold);
    const better =
      !best ||
      r > best.recall + 1e-9 ||
      (Math.abs(r - best.recall) < 1e-9 && strictness(params) > strictness(best.params));
    if (better) best = { params, recall: r };
  }
  return best;
}

/** Best recall on a set with zero wrong adds (an oracle, for reference only: tuned on the set it reports). */
function oracle(jds: readonly PreparedJd[]) {
  let best: { params: EmbedParams; tp: number; gold: number } | null = null;
  for (const params of grid()) {
    const t = tallyJds(jds, params);
    if (t.fp > 0) continue;
    if (!best || t.tp > best.tp) best = { params, tp: t.tp, gold: t.gold };
  }
  return best;
}

interface ModelReport {
  model: CandidateModel;
  loadMs: number;
  embedMsPerPhrase: number;
  mode: 'context' | 'isolated';
  msPerFixtureJd: number;
  chosen: EmbedParams | null;
  dev: { precision: number; recall: number; tp: number; fp: number; gold: number; negativeHits: number; negatives: number; wrong: string[] };
  fixtures: { precision: number; recall: number; tp: number; fp: number; gold: number; fpUnlabelled: number; right: string[]; wrong: string[]; missed: string[] } | null;
  rows: ReturnType<typeof rowAgreement> | null;
  fixtureOracle: ReturnType<typeof oracle>;
  /** Fixture precision/recall along τ at the chosen margin. */
  curve: { tau: number; precision: number; recall: number; tp: number; fp: number; devRecall: number; devNegHits: number }[];
  holdout: {
    labelled: number;
    unlabelled: number;
    precision?: number;
    recall?: number;
    tp?: number;
    fp?: number;
    /** Wrong adds on segments that are labelled requirements (the rest land on non-requirement candidates). */
    fpOnRequirements?: number;
    gold?: number;
    /** Labels no candidate matched (segmentation misses). */
    unmatchedLabels?: number;
    /** Precision/recall along τ at the chosen margin and context: for the decision only, never for tuning. */
    curve?: { tau: number; precision: number; recall: number; tp: number; fp: number }[];
    /** Best holdout recall at ≥ 95% holdout precision anywhere on the grid: is there ANY good setting? */
    oracle95?: { params: EmbedParams; tp: number; fp: number; gold: number } | null;
  };
  skipped: string[];
}

describe('embedding matcher', () => {
  const reports: ModelReport[] = [];

  for (const model of MODELS) {
    it(model.id, async () => {
      let loaded;
      try {
        loaded = await nodeEmbedder(model);
      } catch (e) {
        console.warn(`skip ${model.id}: ${(e as Error).message}`);
        return;
      }
      const { embed, loadMs } = loaded;
      // Phrases read in context (one pass per segment, spans mean-pooled) for
      // mean-pooled models; CLS models only have a sentence vector, so their
      // phrases are embedded on their own.
      const spanEmbed = model.pooling === 'mean' && process.env.EMBED_MODE !== 'isolated' ? loaded.spanEmbed : undefined;
      const vocab = await liveVocabulary(embed);

      const t0 = performance.now();
      const cases = await prepareCases(embed, vocab, spanEmbed);
      const t1 = performance.now();
      const fixtures = await prepareJds(fixtureSet(), embed, vocab, spanEmbed);
      const fixMs = performance.now() - t1;
      const embedMs = performance.now() - t0;
      const phraseCount =
        cases.synonyms.reduce((n, c) => n + c.scores.length, 0) +
        cases.negatives.reduce((n, c) => n + c.scores.length, 0) +
        fixtures.reduce((n, f) => n + f.scored.reduce((m, s) => m + s.phrases.length, 0), 0);

      const hold = holdoutSet();
      const holdJds = hold.labelled.length ? await prepareJds(hold.labelled, embed, vocab, spanEmbed) : [];

      const pick = choose(cases, fixtures);
      const devT = pick ? tallyCases(cases, pick.params) : tallyCases(cases, { tau: 2, margin: 1, tauContext: 1, maxPerSegment: 3 });
      const fixT = pick ? tallyJds(fixtures, pick.params) : null;
      const margin = pick?.params.margin ?? 0.05;
      const tauContext = pick?.params.tauContext ?? 0;
      const curve = TAUS.filter((tau) => tau >= 0.5).map((tau) => {
        const params = { tau, margin, tauContext, maxPerSegment: 3 };
        const t = tallyJds(fixtures, params);
        const d = tallyCases(cases, params);
        return { tau, precision: precision(t), recall: recall(t), tp: t.tp, fp: t.fp, devRecall: recall(d), devNegHits: d.negativeHits };
      });

      const report: ModelReport = {
        model,
        loadMs,
        embedMsPerPhrase: embedMs / Math.max(1, phraseCount),
        mode: spanEmbed ? 'context' : 'isolated',
        msPerFixtureJd: fixMs / fixtures.length,
        chosen: pick?.params ?? null,
        dev: { precision: precision(devT), recall: recall(devT), tp: devT.tp, fp: devT.fp, gold: devT.gold, negativeHits: devT.negativeHits, negatives: devT.negatives, wrong: devT.wrong },
        fixtures: fixT && {
          precision: precision(fixT),
          recall: recall(fixT),
          tp: fixT.tp,
          fp: fixT.fp,
          gold: fixT.gold,
          fpUnlabelled: fixT.fpUnlabelled,
          right: fixT.right,
          wrong: fixT.wrong,
          missed: fixT.missed,
        },
        rows: pick ? rowAgreement(fixtures, pick.params, FIXTURE_NOW) : null,
        fixtureOracle: oracle(fixtures),
        curve,
        holdout: { labelled: hold.labelled.length, unlabelled: hold.unlabelled.length },
        skipped: cases.skipped,
      };

      if (pick && holdJds.length) {
        const h = tallyJds(holdJds, pick.params);
        let oracle95: { params: EmbedParams; tp: number; fp: number; gold: number } | null = null;
        for (const params of grid()) {
          const t = tallyJds(holdJds, params);
          if (t.tp === 0 || precision(t) < 0.95) continue;
          if (!oracle95 || t.tp > oracle95.tp) oracle95 = { params, tp: t.tp, fp: t.fp, gold: t.gold };
        }
        Object.assign(report.holdout, {
          precision: precision(h),
          recall: recall(h),
          tp: h.tp,
          fp: h.fp,
          fpOnRequirements: h.fp - h.fpUnlabelled,
          gold: h.gold,
          unmatchedLabels: holdJds.reduce((n, j) => n + j.unmatched, 0),
          curve: TAUS.filter((tau) => tau >= 0.5 && Math.round(tau * 100) % 5 === 0).map((tau) => {
            const t = tallyJds(holdJds, { ...pick.params, tau });
            return { tau, precision: precision(t), recall: recall(t), tp: t.tp, fp: t.fp };
          }),
          oracle95,
        });
        mkdirSync(path.join(RESULTS, 'holdout'), { recursive: true });
        writeFileSync(
          path.join(RESULTS, 'holdout', `${DATE}-${model.id.replace('/', '__')}.json`),
          JSON.stringify({ params: pick.params, tally: h }, null, 2),
        );
      }

      // The shipped model must reproduce its numbers from the committed vectors.
      if (model.id === EMBED_MODEL.id && pick) {
        const shipped = decodeVocabulary(committed as SkillEmbeddingsFile);
        const shippedFix = await prepareJds(fixtureSet(), embed, shipped, spanEmbed);
        const a = tallyJds(shippedFix, pick.params);
        expect({ tp: a.tp, fp: a.fp }).toEqual({ tp: fixT!.tp, fp: fixT!.fp });
        // The committed default is the tuned point, and it still adds
        // nothing to a negative line or a wrong skill to a fixture.
        expect(EMBED_PARAMS).toEqual(pick.params);
        expect(tallyCases(cases, EMBED_PARAMS).negativeHits).toBe(0);
        expect(tallyJds(shippedFix, EMBED_PARAMS).fp).toBe(0);
      }

      reports.push(report);
      console.log(
        `${model.id}: τ=${pick?.params.tau} m=${pick?.params.margin} ctx=${pick?.params.tauContext} dev R=${pct(recall(devT))} P=${pct(precision(devT))} neg=${devT.negativeHits}/${devT.negatives}` +
          (fixT ? ` | fixtures ${fixT.tp}/${fixT.gold} R=${pct(recall(fixT))} P=${pct(precision(fixT))} fp=${fixT.fp}` : ''),
      );
    });
  }

  it('writes the results', () => {
    if (!reports.length) return;
    mkdirSync(RESULTS, { recursive: true });
    const tag = SELECTED ? `-${SELECTED.length}models` : '';
    writeFileSync(path.join(RESULTS, `${DATE}-sweep${tag}.json`), JSON.stringify(reports, null, 2));
    const lines = [
      `# Embedding matcher sweep, ${DATE}`,
      '',
      'Tuned on development data (hand-written lines in evals/embed/cases.ts + the 8 fixtures): zero adds on any negative, zero wrong adds on the fixtures, ≥ 90% synonym precision, best recall. Reported on the held-out JDs (details gitignored under results/holdout/).',
      `Holdout dir: ${path.relative(process.cwd(), HOLDOUT_DIR)}.`,
      '',
      '| Model | mode | q8 ONNX | τ | margin | ctx | Dev recall | Dev precision | Negatives hit | Fixture recall | Fixture precision | Wrong adds | Rows (scan → +embed) | Node CPU |',
      '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
      ...reports.map((r) =>
        [
          r.model.id,
          r.mode,
          `${(r.model.onnxBytes / 1e6).toFixed(1)} MB`,
          r.chosen?.tau ?? '–',
          r.chosen?.margin ?? '–',
          r.chosen?.tauContext ?? '–',
          `${r.dev.tp}/${r.dev.gold} (${pct(r.dev.recall)})`,
          pct(r.dev.precision),
          `${r.dev.negativeHits}/${r.dev.negatives}`,
          r.fixtures ? `${r.fixtures.tp}/${r.fixtures.gold} (${pct(r.fixtures.recall)})` : '–',
          r.fixtures ? pct(r.fixtures.precision) : '–',
          r.fixtures ? String(r.fixtures.fp) : '–',
          r.rows ? `${r.rows.scan} → ${r.rows.embedded} / ${r.rows.total}` : '–',
          `${r.msPerFixtureJd.toFixed(0)} ms/JD`,
        ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'),
      ),
      '',
      '## Fixture oracle (tuned on the fixtures themselves: an upper bound, not a result)',
      '',
      ...reports.map((r) => `- ${r.model.id}: ${r.fixtureOracle ? `${r.fixtureOracle.tp}/${r.fixtureOracle.gold} at τ=${r.fixtureOracle.params.tau}, m=${r.fixtureOracle.params.margin}, ctx=${r.fixtureOracle.params.tauContext}` : 'none'}`),
      '',
      ...reports.flatMap((r) => [
        `## ${r.model.id}`,
        '',
        `Chosen τ=${r.chosen?.tau}, margin=${r.chosen?.margin}, context=${r.chosen?.tauContext}. Load ${r.loadMs.toFixed(0)} ms (Node, cached).`,
        '',
        '| τ | Fixture precision | Fixture recall | TP | FP | Dev recall | Dev negatives hit |',
        '|---|---|---|---|---|---|---|',
        ...r.curve.filter((c) => Math.round(c.tau * 100) % 2 === 0).map((c) => `| ${c.tau} | ${pct(c.precision)} | ${pct(c.recall)} | ${c.tp} | ${c.fp} | ${pct(c.devRecall)} | ${c.devNegHits} |`),
        '',
        '**Fixture adds (right):**',
        ...(r.fixtures?.right ?? []).map((s) => `- ${s}`),
        '',
        '**Fixture adds (wrong):**',
        ...(r.fixtures?.wrong.length ? r.fixtures.wrong.map((s) => `- ${s}`) : ['- none']),
        '',
        '**Fixture misses:**',
        ...(r.fixtures?.missed ?? []).map((s) => `- ${s}`),
        '',
        '**Dev wrong adds at the chosen point:**',
        ...(r.dev.wrong.length ? r.dev.wrong.map((s) => `- ${s}`) : ['- none']),
        '',
        r.rows ? `Rows per fixture (scan → +embed): ${r.rows.perFixture.map((f) => `${f.name} ${f.scan}→${f.embed}`).join(', ')}` : '',
        '',
        `Holdout (the report split, never tuned on): ${r.holdout.labelled} labelled JDs, ${r.holdout.unlabelled} unlabelled` +
          (r.holdout.gold !== undefined
            ? `; ${r.holdout.tp}/${r.holdout.gold} recall ${pct(r.holdout.recall!)}, precision ${pct(r.holdout.precision!)}, wrong adds ${r.holdout.fp} (${r.holdout.fpOnRequirements} on labelled requirements, the rest on other candidate lines); ${r.holdout.unmatchedLabels} labels matched no candidate`
            : ''),
        '',
        ...(r.holdout.curve
          ? [
              '| τ (holdout, same margin/ctx) | Precision | Recall | TP | FP |',
              '|---|---|---|---|---|',
              ...r.holdout.curve.map((c) => `| ${c.tau} | ${pct(c.precision)} | ${pct(c.recall)} | ${c.tp} | ${c.fp} |`),
              '',
              `Holdout oracle (best recall at ≥ 95% precision anywhere on the grid, NOT a tuning result): ${
                r.holdout.oracle95
                  ? `${r.holdout.oracle95.tp}/${r.holdout.oracle95.gold} at τ=${r.holdout.oracle95.params.tau}, m=${r.holdout.oracle95.params.margin}, ctx=${r.holdout.oracle95.params.tauContext}`
                  : 'none'
              }`,
              '',
            ]
          : []),
      ]),
      '## Synonym cases the scan already covers (not counted)',
      '',
      ...(reports[0]?.skipped ?? []).map((s) => `- ${s}`),
      '',
    ];
    writeFileSync(path.join(RESULTS, `${DATE}-sweep${tag}.md`), lines.join('\n'));
  });
});

