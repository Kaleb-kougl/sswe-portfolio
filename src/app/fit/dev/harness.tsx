'use client';

import { useEffect, useRef, useState } from 'react';

import type { ChatMessage, FitReport, Requirement, SegmentDecision } from '@/lib/fit/contract';
import type {
  AnswerRecord,
  GenerateStats,
  LocalFitSession,
  LocalModelId,
  ProbeOutcome,
  QuestionMode,
  RunStats,
  RunStrategy,
} from '@/lib/fit/local/client';

import type { SpikeModelId } from '@/lib/fit/local/spike-models';

type ClientModule = typeof import('@/lib/fit/local/client');

/** client.ts is loaded on demand, as the real /fit page will. */
let clientModule: Promise<ClientModule> | null = null;
const loadClient = () => (clientModule ??= import('@/lib/fit/local/client'));

const SAMPLE_JD = `Senior Frontend Engineer

We are looking for a frontend engineer with 5+ years of experience building web applications in React and TypeScript.

Requirements:
- Strong experience with React, TypeScript and modern CSS
- Experience with micro-frontends / module federation
- Accessibility (WCAG 2.1 AA) experience
- Experience with Go or Kubernetes is a plus
- Excellent communication skills`;

/** One model run, as the model comparison (evals/local) records it. */
export interface EvalRun {
  report: FitReport;
  stats: RunStats | null;
  decisions: SegmentDecision[] | null;
  /** v2: every question asked, with P(yes). */
  answers: AnswerRecord[] | null;
  rows: { index: number; atMs: number; row: Requirement }[];
  wallMs: number;
}

/** How a scripted run should decide: v1 (one generation) or v2 (routed yes/no questions). */
export interface EvalRunOptions {
  strategy?: RunStrategy;
  questions?: QuestionMode;
}

/**
 * `window.__fitEval`: a scripting hook for evals/local/compare.eval.ts, so
 * Playwright can drive real model runs without clicking. Dev-only, like the
 * page itself (the route 404s in production builds).
 */
export interface FitEvalHook {
  /** Any pinned id: LOCAL_MODELS, or SPIKE_MODELS (evals only). */
  load(modelId?: LocalModelId | SpikeModelId): Promise<{ fromCache: boolean; elapsedMs: number; modelId: string }>;
  run(jd: string, opts?: EvalRunOptions): Promise<EvalRun>;
  /** The on-device chat spike (evals/chat): one greedy completion of prepared messages. */
  generate(messages: ChatMessage[], maxTokens: number): Promise<{ text: string; stats: GenerateStats }>;
  dispose(): void;
}

declare global {
  interface Window {
    __fitEval?: FitEvalHook;
  }
}

/** `?model=<id>` picks a model from LOCAL_MODELS for the buttons below. */
function modelFromUrl(): LocalModelId | undefined {
  if (typeof window === 'undefined') return undefined;
  return (new URLSearchParams(window.location.search).get('model') as LocalModelId | null) ?? undefined;
}

/** `?strategy=v1|v2` picks the run strategy for the Run button (default v1). */
function strategyFromUrl(): RunStrategy {
  if (typeof window === 'undefined') return 'v1';
  return new URLSearchParams(window.location.search).get('strategy') === 'v2' ? 'v2' : 'v1';
}

export function Harness() {
  const [jd, setJd] = useState(SAMPLE_JD);
  const [log, setLog] = useState<string[]>([]);
  const [rows, setRows] = useState<Requirement[]>([]);
  const [probe, setProbe] = useState<ProbeOutcome | null>(null);
  const [progress, setProgress] = useState<{ loaded: number; total: number; phase: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const session = useRef<LocalFitSession | null>(null);

  const say = (line: string) => setLog((l) => [...l, `${new Date().toISOString().slice(11, 23)} ${line}`]);

  useEffect(() => {
    let live = true;
    void loadClient()
      .then((c) => c.probeLocalModel())
      .then(async (outcome) => {
        if (!live) return;
        const c = await loadClient();
        setProbe(outcome);
        say(`probe: ${JSON.stringify(outcome)}`);
        say(`offer: ${JSON.stringify(c.getPrivateModeOffer(outcome))}`);
      });
    return () => {
      live = false;
      session.current?.dispose();
    };
  }, []);

  useEffect(() => {
    let evalSession: LocalFitSession | null = null;
    let evalModel: LocalModelId | SpikeModelId | undefined;
    window.__fitEval = {
      async load(modelId) {
        const c = await loadClient();
        if (!evalSession || evalModel !== modelId) {
          evalSession?.dispose();
          evalSession = c.createLocalFitSession({ modelId });
          evalModel = modelId;
        }
        const r = await evalSession.load();
        return { ...r, modelId: modelId ?? c.LOCAL_MODEL_ID };
      },
      async run(jd, opts) {
        if (!evalSession) throw new Error('load() first');
        const rows: EvalRun['rows'] = [];
        const t0 = performance.now();
        const report = await evalSession.run(jd, (row, index) => rows.push({ index, atMs: performance.now() - t0, row }), opts);
        return {
          report,
          stats: evalSession.state.stats,
          decisions: evalSession.state.decisions ?? null,
          answers: evalSession.state.answers ?? null,
          rows,
          wallMs: performance.now() - t0,
        };
      },
      async generate(messages, maxTokens) {
        if (!evalSession) throw new Error('load() first');
        return evalSession.generate(messages, maxTokens);
      },
      dispose() {
        evalSession?.dispose();
        evalSession = null;
      },
    };
    return () => {
      evalSession?.dispose();
      delete window.__fitEval;
    };
  }, []);

  const getSession = async () => {
    const c = await loadClient();
    session.current ??= c.createLocalFitSession({ modelId: modelFromUrl() });
    return session.current;
  };

  const step = async (name: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    const t0 = performance.now();
    try {
      const result = await fn();
      say(`${name}: ok in ${Math.round(performance.now() - t0)} ms ${result === undefined ? '' : JSON.stringify(result)}`);
    } catch (err) {
      const e = err as { code?: string; message?: string };
      say(`${name}: FAILED ${e.code ?? ''} ${e.message ?? String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: 16, fontFamily: 'ui-monospace, monospace', fontSize: 13 }}>
      <h1 style={{ fontSize: 18 }}>Private mode harness (dev only)</h1>
      <p data-testid="probe">probe: {probe ? JSON.stringify({ supported: probe.supported, reason: probe.reason }) : 'checking…'}</p>
      <textarea
        aria-label="Job description"
        value={jd}
        onChange={(e) => setJd(e.target.value)}
        rows={10}
        style={{ width: '100%' }}
      />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0' }}>
        <button disabled={busy} onClick={() => step('storage', async () => (await loadClient()).checkStorage())}>
          Storage
        </button>
        <button disabled={busy} onClick={() => step('bench', async () => (await getSession()).bench())}>
          Bench
        </button>
        <button
          disabled={busy}
          onClick={() =>
            step('load', async () =>
              (await getSession()).load((p) => setProgress({ loaded: p.loadedBytes, total: p.totalBytes, phase: p.phase })),
            )
          }
        >
          Load
        </button>
        <button
          disabled={busy}
          onClick={() => {
            setRows([]);
            void step('run', async () => {
              const s = await getSession();
              const report = await s.run(
                jd,
                (row, i) => {
                  say(`row ${i}: ${row.verdict} ${row.text}`);
                  setRows((r) => [...r, row]);
                },
                { strategy: strategyFromUrl() },
              );
              return {
                strategy: strategyFromUrl(),
                role: report.role,
                coverage: report.coverage,
                rows: report.requirements.length,
                stats: s.state.stats,
              };
            });
          }}
        >
          Run
        </button>
        <button onClick={() => session.current?.cancel()}>Cancel</button>
        <button
          onClick={() => {
            session.current?.dispose();
            session.current = null;
            say('disposed');
          }}
        >
          Dispose
        </button>
      </div>
      {progress && (
        <p>
          <progress data-testid="progress" value={progress.loaded} max={progress.total} /> {progress.phase}{' '}
          {Math.round(progress.loaded / 1e6)} / {Math.round(progress.total / 1e6)} MB
        </p>
      )}
      <ol data-testid="rows">
        {rows.map((r, i) => (
          <li key={i}>
            [{r.priority}] [{r.verdict}] {r.text} — {r.note}
          </li>
        ))}
      </ol>
      <pre data-testid="log" style={{ whiteSpace: 'pre-wrap' }}>
        {log.join('\n')}
      </pre>
    </main>
  );
}
