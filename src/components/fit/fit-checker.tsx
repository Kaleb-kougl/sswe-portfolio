'use client';

import { AlertCircle } from 'lucide-react';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';

import type { FitReport } from '@/lib/fit/contract';

import { afterLoadAndIdle, usePrivateMode, type Flow } from './private-mode';

type Results = typeof import('./fit-results');
type Scan = import('./fit-results').Scan;

/* ---------------------------------------------------------------------------
   FitChecker — the /fit client island.

   Scan first: `analyzeWithoutModel` is pure code over the corpus, so the
   report is on screen as soon as the button is pressed, on every device.
   Private mode (optional, on-device) can then replace it; the scan stays one
   disclosure away. Nothing here sends the JD anywhere: there is no fetch in
   this file, and the only network request Private mode makes is for the
   model's weights, which never include it (e2e/fit.spec.ts checks the wire).

   First-load JS is this form and the Private-mode hook. The engine (corpus,
   analysis, report view) is `./fit-results`, fetched at idle after `load`
   and awaited on submit, so a fast paste-and-press still works.
   --------------------------------------------------------------------------- */

/**
 * `JD_MAX_CHARS` from `@/lib/fit/contract`, restated so this first-load
 * module doesn't import the contract (and zod with it). e2e/fit.spec.ts holds
 * the textarea's maxlength to the real constant.
 */
const JD_LIMIT = 12_000;

let resultsModule: Promise<Results> | null = null;
const loadResults = () => (resultsModule ??= import('./fit-results'));

/** The report that model rows build while they arrive, before `done`. */
function partialReport(scan: FitReport, rows: FitReport['requirements']): FitReport {
  return { role: scan.role, mode: 'model', requirements: rows, coverage: null };
}

/** What the polite live region says. Per step and per row, never per token or per byte. */
function statusLine(flow: Flow, expected: number): string {
  switch (flow.step) {
    case 'storage':
      return 'Private mode: checking storage.';
    case 'consent':
      return '';
    case 'bench':
      return 'Private mode: testing whether this device is fast enough.';
    case 'slow':
      return `This device would take about ${flow.seconds} seconds per requirement. The download hasn’t started.`;
    case 'no-storage':
      return 'Not enough storage for Private mode. The keyword scan still stands.';
    case 'loading':
      return flow.progress?.phase === 'download' || !flow.progress
        ? 'Private mode: downloading the model.'
        : 'Private mode: starting the model.';
    case 'running':
      return flow.rows.length === 0
        ? 'Private mode: reading the job description.'
        : `${flow.rows.length} of ~${Math.max(expected, flow.rows.length)} requirements checked`;
    case 'done':
      return `Private-mode report ready: ${flow.report.requirements.length} requirements.`;
    case 'problem':
      return `${flow.message} The keyword scan still stands.`;
    default:
      return '';
  }
}

export function FitChecker() {
  const uid = useId();
  const ids = { field: `${uid}-jd`, hint: `${uid}-hint`, count: `${uid}-count`, error: `${uid}-error` };

  const [jd, setJd] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [scan, setScan] = useState<Scan | null>(null);
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const privateMode = usePrivateMode();
  const { flow, reset } = privateMode;

  // The engine chunk, at idle after load: off the critical path, ready by
  // the time anyone has pasted a job description.
  useEffect(() => afterLoadAndIdle(() => void loadResults()), []);

  // Focus moves to the report's heading when a scan finishes, so keyboard and
  // screen-reader users land on the result instead of hunting for it.
  useEffect(() => {
    if (scan) headingRef.current?.focus();
  }, [scan]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    let engine: Results;
    try {
      engine = await loadResults();
    } catch {
      resultsModule = null;
      setLoading(false);
      setError('The checker couldn’t load. Check your connection and try again.');
      return;
    }
    setLoading(false);
    setResults(engine);
    const check = engine.validateJd(jd);
    if (!check.ok) {
      setError(check.message);
      fieldRef.current?.focus();
      return;
    }
    setError(null);
    reset();
    setScan((prev) => ({ report: engine.analyzeWithoutModel(check.jd), jd: check.jd, run: (prev?.run ?? 0) + 1 }));
  }

  const modelReport =
    flow.step === 'done' ? flow.report : flow.step === 'running' && flow.rows.length > 0 && scan ? partialReport(scan.report, flow.rows) : null;
  const shown = modelReport ?? scan?.report ?? null;
  const expected = scan?.report.requirements.length ?? 0;
  const atLimit = jd.length >= JD_LIMIT;

  return (
    <>
      <form onSubmit={onSubmit} noValidate className="rounded-xl border border-hairline bg-surface p-5 shadow-raised sm:p-7">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={ids.field} className="font-ui text-sm font-semibold text-ink">
            Job description
          </label>
          <span id={ids.count} className="font-mono text-[11px] font-bold tabular-nums tracking-[0.08em] text-muted">
            {jd.length.toLocaleString('en-US')} / {JD_LIMIT.toLocaleString('en-US')}
            <span className="sr-only"> characters</span>
          </span>
        </div>
        <p id={ids.hint} className="mt-1 font-ui text-sm text-muted">
          Paste the whole posting. Headers like &ldquo;Requirements&rdquo; and &ldquo;Nice to have&rdquo; help.
          {atLimit ? ' That’s the limit; anything past it was cut off.' : ''}
        </p>
        <textarea
          ref={fieldRef}
          id={ids.field}
          name="jd"
          rows={12}
          maxLength={JD_LIMIT}
          value={jd}
          onChange={(event) => setJd(event.target.value)}
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={[ids.hint, ids.count, error ? ids.error : null].filter(Boolean).join(' ')}
          className={
            'mt-3 block w-full resize-y rounded-sm border border-control bg-paper px-3.5 py-3 font-ui text-base leading-relaxed text-ink shadow-hairline transition-colors placeholder:text-muted hover:border-ink/40 ' +
            (error ? 'border-ink bg-panel-subtle' : '')
          }
        />
        {error ? (
          <p id={ids.error} role="alert" className="mt-2 flex items-center gap-1.5 font-ui text-sm font-semibold text-ink">
            <AlertCircle size={15} strokeWidth={2.5} aria-hidden="true" className="shrink-0" />
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="inline-flex min-h-[44px] items-center justify-center rounded-pill bg-cta px-6 py-3 font-ui text-base font-bold text-cta-ink shadow-cta transition-opacity hover:opacity-95"
          >
            {loading ? 'Checking…' : 'Check fit'}
          </button>
          <span className="font-ui text-sm text-muted">Instant, on this device.</span>
        </div>
      </form>

      {/* Always in the DOM, so the first update is announced. */}
      <p aria-live="polite" data-testid="fit-status" className="sr-only">
        {statusLine(flow, expected)}
      </p>

      {scan && shown && results ? (
        <results.FitResults
          scan={scan}
          shown={shown}
          modelReport={modelReport}
          privateMode={privateMode}
          headingRef={headingRef}
        />
      ) : null}
    </>
  );
}
