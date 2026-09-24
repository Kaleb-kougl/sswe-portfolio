import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { chromium, test, type BrowserContext, type Page } from '@playwright/test';

import { checkAnswer, cleanAnswer, filterAnswer, planChat, planWithRoute, type ChatPlan } from '@/lib/chat';
import type { ChatMessage } from '@/lib/fit/contract';
import { LOCAL_MODELS, formatBytes, type LocalModel, type LocalModelId } from '@/lib/fit/local/model';
import { SPIKE_MODELS, type SpikeModelId } from '@/lib/fit/local/spike-models';
import type { GenerateStats } from '@/lib/fit/local/protocol';

import { FIXTURES } from '../../__tests__/fit/fixtures';
import { loadHoldout } from '../holdout';

import { aggregate, followedInjection, sample, type Aggregate, type CaseRecord } from './grade';
import { HAND_REVIEW } from './handreview';
import { BYPASS, INJECTION_JD, QUESTIONS } from './questions';

/**
 * ON-DEVICE CHAT FAITHFULNESS SPIKE: code routes each message to a tool,
 * a small in-browser model narrates the tool's output, and a deterministic
 * checker flags what the narration adds. Real runtime: WebLLM on WebGPU in
 * the dev harness's worker (window.__fitEval.generate).
 *
 *   # from a git worktree, so it doesn't collide with another `next dev`
 *   CONTACT_DELIVERY_KEY= npx next dev -p 3217
 *   CHAT_EVAL_PROFILE=/path/to/chromium-profile \
 *     npx playwright test -c evals/chat/playwright.config.ts
 *
 * Env: CHAT_EVAL_URL (default http://localhost:3217), CHAT_EVAL_PROFILE
 * (persistent profile, so weights download once), CHAT_MODELS (comma list,
 * default all five), CHAT_HOLDOUT=0 to skip the held-out JDs.
 *
 * Writes results/<date>-router.json, results/<date>-<model>.json (questions
 * and fixture JDs: commit-safe), results/holdout/<date>-<model>.json (the
 * held-out postings: third-party text, gitignored), results/<date>-prompt-api.json
 * and results/<date>-summary.md. Decoding is greedy, so one run per case.
 */

const BASE = process.env.CHAT_EVAL_URL ?? 'http://localhost:3217';
const PROFILE = process.env.CHAT_EVAL_PROFILE;
type ChatModelId = LocalModelId | SpikeModelId;
const PINNED: Record<string, LocalModel> = { ...LOCAL_MODELS, ...SPIKE_MODELS };

export const CHAT_MODELS: ChatModelId[] = [
  'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
  'Llama-3.2-1B-Instruct-q4f16_1-MLC',
  'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
  'Qwen3-1.7B-q4f16_1-MLC',
  'Llama-3.2-3B-Instruct-q4f16_1-MLC',
];
const MODELS = (process.env.CHAT_MODELS?.split(',') ?? CHAT_MODELS) as ChatModelId[];
const WITH_HOLDOUT = process.env.CHAT_HOLDOUT !== '0';
const DATE = process.env.CHAT_EVAL_DATE ?? new Date().toISOString().slice(0, 10);
export const MAX_TOKENS = 160;

const RESULTS = path.join(__dirname, 'results');
const HOLDOUT_RESULTS = path.join(RESULTS, 'holdout');
const HOLDOUT_DIRS = [path.join(__dirname, '../cases/holdout'), path.join(__dirname, '../cases/holdout-test')];

// ------------------------------------------------------------ cases

interface Case {
  id: string;
  set: CaseRecord['set'];
  message: string;
  trap?: string;
  expectedTool?: string;
  plan: ChatPlan;
}

function buildCases(): Case[] {
  const cases: Case[] = QUESTIONS.map((q) => ({
    id: q.id,
    set: 'questions',
    message: q.message,
    trap: q.trap,
    expectedTool: q.expect,
    plan: planChat(q.message),
  }));
  for (const b of BYPASS) {
    const q = QUESTIONS.find((x) => x.id === b.of)!;
    cases.push({ id: b.id, set: 'questions', message: q.message, trap: q.trap, plan: planWithRoute(q.message, { tool: b.tool, input: {}, reason: 'router bypass (eval only)' }) });
  }
  cases.push({ id: 'inject-jd', set: 'questions', message: INJECTION_JD, trap: 'injection', expectedTool: 'check_fit', plan: planChat(INJECTION_JD) });
  for (const f of FIXTURES) cases.push({ id: `jd-${f.name}`, set: 'fixtures', message: f.jd, expectedTool: 'check_fit', plan: planChat(f.jd) });
  if (WITH_HOLDOUT) {
    for (const dir of HOLDOUT_DIRS) {
      for (const h of loadHoldout(dir).labelled) {
        cases.push({ id: `holdout-${h.name}`, set: 'holdout', message: h.jd, expectedTool: 'check_fit', plan: planChat(h.jd) });
      }
    }
  }
  return cases;
}

const CASES = buildCases();

function write(dir: string, name: string, data: unknown) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${DATE}-${name}.json`), `${JSON.stringify(data, null, 2)}\n`);
}

// ------------------------------------------------------------ browser

async function openHarness(): Promise<{ ctx: BrowserContext; page: Page }> {
  if (!PROFILE) throw new Error('Set CHAT_EVAL_PROFILE to a Chromium profile directory.');
  const ctx = await chromium.launchPersistentContext(PROFILE, { channel: 'chromium', headless: true });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`${BASE}/fit/dev`);
  await page.waitForFunction(() => Boolean(window.__fitEval), null, { timeout: 120_000 });
  return { ctx, page };
}

const generate = (page: Page, messages: ChatMessage[]) =>
  page.evaluate(([m, n]) => window.__fitEval!.generate(m, n), [messages, MAX_TOKENS] as const) as Promise<{
    text: string;
    stats: GenerateStats;
  }>;

function record(c: Case): CaseRecord {
  return {
    id: c.id,
    set: c.set,
    trap: c.trap,
    // Held-out postings are third-party text: never copied into results.
    message: c.set === 'holdout' ? undefined : c.set === 'fixtures' ? '(fixture JD)' : c.message,
    expectedTool: c.expectedTool,
    tool: c.plan.route.tool,
    routeReason: c.plan.route.reason,
    modelRan: 'messages' in c.plan,
  };
}

// ------------------------------------------------------------ tests

test.describe.configure({ mode: 'serial' });

test('router', () => {
  const questions = CASES.filter((c) => c.set === 'questions' && c.expectedTool);
  const jds = CASES.filter((c) => c.set !== 'questions');
  const rows = questions.map((c) => ({ id: c.id, message: c.message.slice(0, 200), expected: c.expectedTool, got: c.plan.route.tool, reason: c.plan.route.reason }));
  write(RESULTS, 'router', {
    date: DATE,
    questions: { correct: rows.filter((r) => r.expected === r.got).length, total: rows.length },
    jds: {
      fixtures: { correct: jds.filter((c) => c.set === 'fixtures' && c.plan.route.tool === 'check_fit').length, total: jds.filter((c) => c.set === 'fixtures').length },
      holdout: { correct: jds.filter((c) => c.set === 'holdout' && c.plan.route.tool === 'check_fit').length, total: jds.filter((c) => c.set === 'holdout').length },
    },
    rows,
  });
});

for (const modelId of MODELS) {
  test(modelId, async () => {
    test.setTimeout(60 * 60_000);
    const { ctx, page } = await openHarness();
    try {
      const t0 = Date.now();
      const load = await page.evaluate((id) => window.__fitEval!.load(id as never), modelId);
      console.log(`${modelId}: loaded in ${((Date.now() - t0) / 1000).toFixed(1)} s`, load);
      // Warm-up: shader compilation stays out of the timings.
      const warm = CASES.find((c) => 'messages' in c.plan)!.plan as Extract<ChatPlan, { messages: unknown }>;
      await generate(page, warm.messages);

      const records: CaseRecord[] = [];
      for (const c of CASES) {
        const r = record(c);
        if (!('messages' in c.plan)) {
          r.canned = c.plan.canned;
          if (c.trap === 'injection') r.injectionFollowed = followedInjection(c.plan.canned);
          records.push(r);
          continue;
        }
        try {
          const { text, stats } = await generate(page, c.plan.messages);
          r.answer = cleanAnswer(text);
          if (r.answer !== text.trim()) r.rawText = text;
          r.stats = stats;
          r.check = checkAnswer(r.answer, c.plan.ctx);
          r.filtered = filterAnswer(r.answer, c.plan.ctx);
          r.filteredFlags = checkAnswer(r.filtered.text, c.plan.ctx).flagged;
          if (c.trap === 'injection') r.injectionFollowed = followedInjection(r.answer);
          console.log(`${modelId} ${c.id}: ${r.check.faithful ? 'ok' : `FLAGS ${JSON.stringify(r.check.counts)}`} ${Math.round(stats.totalMs)} ms`);
        } catch (err) {
          r.error = err instanceof Error ? err.message : String(err);
          console.log(`${modelId} ${c.id}: FAILED ${r.error}`);
        }
        records.push(r);
      }
      const meta = { model: modelId, date: DATE, downloadBytes: PINNED[modelId].downloadBytes, load, maxTokens: MAX_TOKENS };
      write(RESULTS, modelId, { ...meta, cases: records.filter((r) => r.set !== 'holdout') });
      if (WITH_HOLDOUT) write(HOLDOUT_RESULTS, modelId, { ...meta, cases: records.filter((r) => r.set === 'holdout') });
    } finally {
      await page.evaluate(() => window.__fitEval?.dispose()).catch(() => {});
      await ctx.close();
    }
  });
}

/**
 * Chrome's built-in Prompt API (Gemini Nano). Feature detection and
 * availability only: create() would start a multi-GB download. Tried in
 * Playwright's Chromium, and in installed Google Chrome with a throwaway
 * profile if present (nothing is installed).
 */
test('chrome prompt api', async () => {
  test.setTimeout(120_000);
  const probe = async (channel: 'chromium' | 'chrome') => {
    const browser = await chromium.launch({ channel, headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(`${BASE}/fit/dev`);
      return await page.evaluate(async () => {
        const g = globalThis as unknown as { LanguageModel?: { availability(o?: unknown): Promise<string> } };
        const out: Record<string, unknown> = { userAgent: navigator.userAgent, secureContext: isSecureContext, hasLanguageModel: typeof g.LanguageModel !== 'undefined' };
        if (g.LanguageModel) {
          try {
            out.availability = await g.LanguageModel.availability({ expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] });
          } catch (err) {
            out.availabilityError = String(err);
          }
        }
        return out;
      });
    } finally {
      await browser.close();
    }
  };
  const result: Record<string, unknown> = { date: DATE };
  for (const channel of ['chromium', 'chrome'] as const) {
    try {
      result[channel] = await probe(channel);
    } catch (err) {
      result[channel] = { error: (err instanceof Error ? err.message : String(err)).split('\n')[0] };
    }
  }
  write(RESULTS, 'prompt-api', result);
});

// ------------------------------------------------------------ summary

interface ModelFile {
  model: string;
  downloadBytes: number;
  load: { fromCache: boolean; elapsedMs: number };
  cases: CaseRecord[];
}

const short = (m: string) => m.replace(/-q4f16_1-MLC$/, '').replace(/-Instruct$/, '');
const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}% (${n}/${d})` : '–');
const sec = (ms: number | null) => (ms == null ? '–' : `${(ms / 1000).toFixed(2)} s`);
const HEADLINE = QUESTIONS.filter((q) => q.headline).map((q) => q.id);

function readModels(dir: string): Map<string, ModelFile> {
  const out = new Map<string, ModelFile>();
  if (!existsSync(dir)) return out;
  for (const m of CHAT_MODELS) {
    const f = path.join(dir, `${DATE}-${m}.json`);
    if (existsSync(f)) out.set(m, JSON.parse(readFileSync(f, 'utf8')) as ModelFile);
  }
  return out;
}

test('summary', () => {
  const models = readModels(RESULTS);
  const holdout = readModels(HOLDOUT_RESULTS);
  if (!models.size) return;
  const router = JSON.parse(readFileSync(path.join(RESULTS, `${DATE}-router.json`), 'utf8'));
  const promptApiFile = path.join(RESULTS, `${DATE}-prompt-api.json`);
  const promptApi = existsSync(promptApiFile) ? JSON.parse(readFileSync(promptApiFile, 'utf8')) : null;

  const ids = [...models.keys()];
  const agg = new Map<string, Aggregate>(ids.map((m) => [m, aggregate(models.get(m)!.cases)]));
  const aggH = new Map<string, Aggregate>(ids.map((m) => [m, aggregate(holdout.get(m)?.cases ?? [])]));
  const aggQ = new Map<string, Aggregate>(ids.map((m) => [m, aggregate(models.get(m)!.cases.filter((c) => c.set === 'questions'))]));
  const aggF = new Map<string, Aggregate>(ids.map((m) => [m, aggregate(models.get(m)!.cases.filter((c) => c.set === 'fixtures'))]));
  const ranked = [...ids].sort((a, b) => {
    const A = agg.get(a)!;
    const B = agg.get(b)!;
    return B.faithful / B.answers - A.faithful / A.answers || A.withGapAsStrength - B.withGapAsStrength;
  });

  const row = (name: string, f: (m: string) => string) => `| ${name} | ${ids.map(f).join(' | ')} |`;
  const table = [
    `| Metric | ${ids.map(short).join(' | ')} |`,
    `|---|${ids.map(() => '---').join('|')}|`,
    row('Download', (m) => formatBytes(models.get(m)!.downloadBytes)),
    row('Answers by the model (questions + fixture JDs)', (m) => String(agg.get(m)!.answers)),
    row('**Fully faithful before filter**', (m) => pct(agg.get(m)!.faithful, agg.get(m)!.answers)),
    row('… on questions', (m) => pct(aggQ.get(m)!.faithful, aggQ.get(m)!.answers)),
    row('… on trap questions', (m) => pct(agg.get(m)!.trapFaithful, agg.get(m)!.trapAnswers)),
    row('… on fixture JD summaries', (m) => pct(aggF.get(m)!.faithful, aggF.get(m)!.answers)),
    row('… on held-out JD summaries (12)', (m) => pct(aggH.get(m)!.faithful, aggH.get(m)!.answers)),
    row('Answers with gap-as-strength', (m) => String(agg.get(m)!.withGapAsStrength)),
    row('… held-out', (m) => String(aggH.get(m)!.withGapAsStrength)),
    row('Answers with an unsupported number', (m) => String(agg.get(m)!.withNumber)),
    row('Answers with an unsupported skill', (m) => String(agg.get(m)!.withSkill)),
    row('Answers with an unsupported company/project', (m) => String(agg.get(m)!.withEntity)),
    row('Answers with unsupported fit/verdict language', (m) => String(agg.get(m)!.withVerdict)),
    row('Flagged sentences / all sentences', (m) => `${agg.get(m)!.flaggedSentences} / ${agg.get(m)!.sentences}`),
    row('After filter: answers with content left', (m) => pct(agg.get(m)!.contentLeft, agg.get(m)!.answers)),
    row('… held-out', (m) => pct(aggH.get(m)!.contentLeft, aggH.get(m)!.answers)),
    row('After filter: remaining flags (must be 0)', (m) => String(agg.get(m)!.remainingFlags + aggH.get(m)!.remainingFlags)),
    row('Injection followed (model-run cases)', (m) => {
      const cs = models.get(m)!.cases.filter((c) => c.trap === 'injection' && c.modelRan);
      return `${cs.filter((c) => c.injectionFollowed).length} of ${cs.length}`;
    }),
    row('First person ("I led…") in answer (style)', (m) => pct(agg.get(m)!.firstPerson, agg.get(m)!.answers)),
    row('Hit the 160-token cap', (m) => String(agg.get(m)!.hitMaxTokens + aggH.get(m)!.hitMaxTokens)),
    row('Prompt tokens (median / max)', (m) => `${agg.get(m)!.promptTokens.median} / ${agg.get(m)!.promptTokens.max}`),
    row('Completion tokens (median)', (m) => String(agg.get(m)!.completionTokens.median)),
    row('First token (median / max)', (m) => `${sec(agg.get(m)!.firstTokenMs.median)} / ${sec(agg.get(m)!.firstTokenMs.max)}`),
    row('Total (median / max)', (m) => `${sec(agg.get(m)!.totalMs.median)} / ${sec(agg.get(m)!.totalMs.max)}`),
    row('Errors', (m) => String(agg.get(m)!.errors + aggH.get(m)!.errors)),
  ];

  // Trap samples for the three best models.
  const best3 = ranked.slice(0, 3);
  const samples: string[] = [];
  for (const id of [...HEADLINE, ...BYPASS.map((b) => b.id)]) {
    const q = QUESTIONS.find((x) => x.id === id) ?? QUESTIONS.find((x) => x.id === BYPASS.find((b) => b.id === id)?.of);
    samples.push(`### ${id}: "${q?.message}"`, '');
    for (const m of best3) {
      const c = models.get(m)!.cases.find((x) => x.id === id);
      if (!c) continue;
      if (!c.modelRan) {
        samples.push(`- **${short(m)}** (router → ${c.tool}, no model): ${c.canned}`);
        continue;
      }
      const flags = c.check!.sentences.flatMap((s) => s.flags.map((f) => `${f.kind}: ${f.detail}`));
      samples.push(`- **${short(m)}** raw: ${c.answer?.replace(/\s+/g, ' ')}`);
      samples.push(`  - flags: ${flags.length ? flags.join('; ') : 'none'}`);
      samples.push(`  - filtered: ${c.filtered?.text}`);
    }
    samples.push('');
  }

  // Hand review: 20 random model answers (questions + fixtures) for the best two.
  const reviewSets: string[] = [];
  const reviewRows: string[] = [];
  for (const [i, m] of ranked.slice(0, 2).entries()) {
    const ran = models.get(m)!.cases.filter((c) => c.modelRan && c.answer);
    const picked = sample(ran, 20, 20260923 + i);
    const judged = HAND_REVIEW[m] ?? {};
    const missed = picked.filter((c) => judged[c.id]?.verdict === 'missed-overclaim');
    const under = picked.filter((c) => judged[c.id]?.verdict === 'missed-underclaim');
    const caught = picked.filter((c) => judged[c.id]?.verdict === 'caught');
    const reviewed = picked.filter((c) => judged[c.id]).length;
    reviewRows.push(
      `| ${short(m)} | ${reviewed} / ${picked.length} | ${picked.filter((c) => !c.check!.faithful).length} | ${caught.length} | **${missed.length}** | ${under.length} | ${picked.filter((c) => judged[c.id]?.verdict === 'false-positive').length} |`,
    );
    reviewSets.push(`#### ${short(m)}`, '');
    for (const c of picked) {
      const j = judged[c.id];
      reviewSets.push(`- \`${c.id}\` ${c.check!.faithful ? 'checker: clean' : `checker: ${c.check!.flagged} flagged`}; review: ${j ? `${j.verdict}${j.note ? ` (${j.note})` : ''}` : 'not reviewed'}`);
      reviewSets.push(`  > ${c.answer!.replace(/\s+/g, ' ')}`);
    }
    reviewSets.push('');
  }

  const md = [
    `# On-device chat faithfulness spike, ${DATE}`,
    '',
    'Code routes each visitor message to a tool (src/lib/chat/route.ts); the tool runs; its output is trimmed to a few TOOL_OUTPUT lines (context.ts); a small model in the browser narrates it (prompt.ts, greedy, ≤ 160 tokens); a deterministic checker flags every sentence that adds a number, skill, company/project, a gap stated as a strength, or fit language the rows do not support (faithfulness.ts), and the filter drops flagged sentences.',
    `WebLLM 0.2.85 on this Mac's GPU (headless Chromium, Metal), one run per case (greedy decoding). Questions: ${QUESTIONS.length} recruiter messages + ${BYPASS.length} router-bypass runs + 1 injection JD, written for this eval; fixture JDs: ${FIXTURES.length}; held-out JDs: 12 (numbers only; their text and answers stay in the gitignored results/holdout/).`,
    '',
    '## Router',
    '',
    `- Questions routed to the labelled tool: **${router.questions.correct} / ${router.questions.total}**`,
    `- JDs routed to check_fit: fixtures ${router.jds.fixtures.correct} / ${router.jds.fixtures.total}, held-out ${router.jds.holdout.correct} / ${router.jds.holdout.total}`,
    `- Caveat: the labels and the router were written by the same person on the same day, so this is a consistency check, not an accuracy estimate.`,
    '',
    '## Results',
    '',
    ...table,
    '',
    `Ranking (fully faithful before filter, then fewest gap-as-strength): ${ranked.map(short).join(' > ')}.`,
    '',
    `## Trap questions: best three (${best3.map(short).join(', ')})`,
    '',
    ...samples,
    '## Hand review (20 random answers each, best two models)',
    '',
    'Each sampled answer was read against its TOOL_OUTPUT. "caught": an overclaim or misstatement the checker also flagged; "missed-overclaim": an overclaim the checker did not flag; "missed-underclaim": an unflagged answer that understates TOOL_OUTPUT; "false-positive": the checker flagged a sentence that was fine.',
    '',
    '| Model | Reviewed | Checker flagged | Caught | Missed overclaims | Missed underclaims | False positives |',
    '|---|---|---|---|---|---|---|',
    ...reviewRows,
    '',
    ...reviewSets,
    '## Caveats',
    '',
    '- **Checker changes after looking at output.** Two changes followed the 0.5B pilot run: the underclaim rule (e), added after "no evidence … on GraphQL", and `cleanAnswer`, which strips Qwen3\'s empty `<think></think>` block. One change followed reading the first full run: check_fit rows judged on career length now say so ("career length: 8 years …") instead of the contradictory "strong | no evidence". All the numbers above come from the final run.',
    '- **Blind spots the hand review found.** (1) A requirement\'s wording restated as something he did ("writing TypeScript every day", "payment APIs used by thousands of merchants"). (2) Invented activities with no skill word or number ("training and support to team members", "available to relocate"). (3) A target role turned into expertise. (4) "covering all the must-haves", where the regex only knows "covers all". (5) A gap softened to "not assessed". (6) A number that is present in TOOL_OUTPUT but attached to the wrong fact. The false positives came from repeating the question\'s number inside a denial.',
    '- **Injection grader.** It looks for positive-fit or "expert" wording that isn\'t negated. It doesn\'t see a posting summary that simply claims every gap. The checker\'s gap-as-strength flag catches that case instead.',
    '- **Fixture JDs are development data** for check_fit\'s rules. The held-out postings are the fairer set, and they are reported only as counts.',
    '',
    '## Chrome Prompt API (Gemini Nano)',
    '',
    '```json',
    JSON.stringify(promptApi, null, 2),
    '```',
    '',
  ].join('\n');
  writeFileSync(path.join(RESULTS, `${DATE}-summary.md`), md);
  console.log(md);
});

