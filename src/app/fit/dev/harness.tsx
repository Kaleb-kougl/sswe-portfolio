'use client';

import { useEffect, useRef, useState } from 'react';

import type { Requirement } from '@/lib/fit/contract';
import type { LocalFitSession, ProbeOutcome } from '@/lib/fit/local/client';

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

  const getSession = async () => {
    const c = await loadClient();
    session.current ??= c.createLocalFitSession();
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
              const report = await s.run(jd, (row, i) => {
                say(`row ${i}: ${row.verdict} ${row.text}`);
                setRows((r) => [...r, row]);
              });
              return { role: report.role, coverage: report.coverage, rows: report.requirements.length, stats: s.state.stats };
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
