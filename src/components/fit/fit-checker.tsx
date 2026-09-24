'use client';

import { AlertCircle } from 'lucide-react';
import { type FormEvent, useEffect, useEffectEvent, useId, useRef, useState } from 'react';

import type { FitReport } from '@/lib/fit/contract';

import { OPEN_REPORT_EVENT, type OpenReportDetail } from './open-report';
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
  // From the chat's "Open the full report", the page is far below the report,
  // so it is also scrolled to the middle of the screen rather than the edge.
  const openedFromChat = useRef(false);
  useEffect(() => {
    if (!scan) return;
    const heading = headingRef.current;
    if (openedFromChat.current && heading) {
      openedFromChat.current = false;
      heading.focus({ preventScroll: true });
      const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      heading.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    } else heading?.focus();
  }, [scan]);

  async function run(text: string) {
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
    const check = engine.validateJd(text);
    if (!check.ok) {
      setError(check.message);
      fieldRef.current?.focus();
      return;
    }
    setError(null);
    reset();
    setScan((prev) => ({ report: engine.analyzeWithoutModel(check.jd), jd: check.jd, run: (prev?.run ?? 0) + 1 }));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(jd);
  }

  // "Open the full report" in the chat below (./open-report.ts): the JD it
  // summarised goes into this form and runs here, and focus lands on the
  // report heading as for any scan. In-page only; nothing is sent.
  const openReport = useEffectEvent((text: string) => {
    openedFromChat.current = true;
    setJd(text);
    void run(text);
  });
  useEffect(() => {
    const onOpen = (event: Event) => openReport((event as CustomEvent<OpenReportDetail>).detail.jd);
    window.addEventListener(OPEN_REPORT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_REPORT_EVENT, onOpen);
  }, []);

  const modelReport =
    flow.step === 'done' ? flow.report : flow.step === 'running' && flow.rows.length > 0 && scan ? partialReport(scan.report, flow.rows) : null;
  const shown = modelReport ?? scan?.report ?? null;
  const expected = scan?.report.requirements.length ?? 0;
  const atLimit = jd.length >= JD_LIMIT;

  return (
    <>
      <form onSubmit={onSubmit} noValidate className="card card--raised p-5 sm:p-7">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={ids.field} className="field__label">
            Job description
          </label>
          <span id={ids.count} className="fit-checker__count">
            {jd.length.toLocaleString('en-US')} / {JD_LIMIT.toLocaleString('en-US')}
            <span className="sr-only"> characters</span>
          </span>
        </div>
        <p id={ids.hint} className="field__hint">
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
          className={`field__control field__control--lg mt-3${error ? ' is-invalid' : ''}`}
        />
        {error ? (
          <p id={ids.error} role="alert" className="field__error mt-2">
            <AlertCircle size={15} strokeWidth={2.5} aria-hidden="true" className="shrink-0" />
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="button button--pill button--primary button--fade button--lg"
          >
            {loading ? 'Checking…' : 'Check fit'}
          </button>
          <span className="fit-checker__note">Instant, on this device.</span>
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
