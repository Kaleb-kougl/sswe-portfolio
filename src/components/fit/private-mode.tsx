'use client';

import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';

import { useSaveData } from '@/hooks/useSaveData';
import type { FitReport, Requirement } from '@/lib/fit/contract';
import type { LocalFitError, LocalFitSession, LoadProgress, PrivateModeOffer, ProbeOutcome } from '@/lib/fit/local/client';
import { formatBytes, LOCAL_MODEL, PRIVATE_MODE_ENABLED } from '@/lib/fit/local/model';

/* ---------------------------------------------------------------------------
   PRIVATE MODE on /fit: the plan's gate table, as UI.

   LOAD BOUNDARY. `@/lib/fit/local/client` (the gate, the protocol and the
   session; no WebLLM, ~4 KB gzip) is reached only through `import()`:
     - at idle after `load`, for step 1 (the probe, in a throwaway worker)
     - on press, for everything else (the same promise, so one fetch)
   WebLLM itself sits behind the client's `new Worker(new URL('./worker.ts'))`,
   which only a confirmed download creates. `model.ts` is plain data (sizes
   for the consent dialog) and is the one static import from `local/`.

     step 1  probe         at idle; the box says "Checking…" meanwhile
     step 2  Data Saver    useSaveData → button disabled with the reason
     step 3  storage       on press
     step 4  consent       <dialog>: size, host, caching, the JD stays here
     step 5  benchmark     before the download; > 10 s asks first
     step 6  watchdog      in the worker; `too_slow` latches for the session
   --------------------------------------------------------------------------- */

type ClientModule = typeof import('@/lib/fit/local/client');

let clientModule: Promise<ClientModule> | null = null;
const loadClient = () => (clientModule ??= import('@/lib/fit/local/client'));

/** After `load`, then idle — the probe must never compete with first paint. */
export function afterLoadAndIdle(callback: () => void): () => void {
  let cancelled = false;
  let idleHandle: number | undefined;
  const idle = () => {
    if (cancelled) return;
    if (typeof window.requestIdleCallback === 'function') {
      idleHandle = window.requestIdleCallback(() => !cancelled && callback(), { timeout: 2_000 });
    } else {
      idleHandle = window.setTimeout(() => !cancelled && callback(), 200);
    }
  };
  if (document.readyState === 'complete') idle();
  else window.addEventListener('load', idle, { once: true });
  return () => {
    cancelled = true;
    window.removeEventListener('load', idle);
    if (idleHandle !== undefined) {
      if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idleHandle);
      window.clearTimeout(idleHandle);
    }
  };
}

export const MODEL_SIZE = formatBytes(LOCAL_MODEL.downloadBytes);
export const MODEL_HOST = 'huggingface.co';

export type Flow =
  | { step: 'idle' }
  | { step: 'storage' }
  | { step: 'no-storage' }
  | { step: 'consent'; cached: boolean }
  | { step: 'bench' }
  | { step: 'slow'; seconds: number }
  | { step: 'loading'; progress: LoadProgress | null }
  | { step: 'running'; rows: Requirement[] }
  | { step: 'done'; report: FitReport }
  | { step: 'problem'; message: string };

/** A plain sentence for every way a run can end early. The scan always stays. */
export function problemMessage(code: LocalFitError['code'] | string): string {
  switch (code) {
    case 'cancelled':
      return 'Private mode was cancelled.';
    case 'too_slow':
      return 'Private mode was too slow on this device (no result within 15 seconds), so it stopped.';
    case 'quota':
      return 'The browser ran out of storage while saving the model.';
    case 'load_failed':
      return 'The model couldn’t be downloaded or started. Check your connection and try again.';
    case 'no_webgpu':
      return 'This browser couldn’t start WebGPU for the model.';
    case 'device_lost':
      return 'The graphics device reset while the model was running.';
    case 'invalid_output':
      return 'The model’s answer didn’t match the expected format, so it was discarded.';
    case 'invalid_jd':
      return 'Private mode couldn’t read this job description.';
    case 'busy':
      return 'Private mode was still busy with the last request. Try again in a moment.';
    case 'not_loaded':
      return 'The model wasn’t loaded. Try again.';
    case 'worker_failed':
    case 'disposed':
      return 'Private mode’s background worker couldn’t start.';
    default:
      return 'Something went wrong in Private mode.';
  }
}

function errorCode(err: unknown): string {
  return typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : 'internal';
}

const DISABLED: ProbeOutcome = { supported: false, reason: 'disabled', probe: null };

/**
 * The session and the gate, for one /fit page. `run(jd)` is the button;
 * the returned `flow` is what the panel and the report render from.
 */
export function usePrivateMode() {
  const saveData = useSaveData();
  const [probe, setProbe] = useState<ProbeOutcome | null>(PRIVATE_MODE_ENABLED ? null : DISABLED);
  const [latched, setLatched] = useState(false);
  const [flow, setFlow] = useState<Flow>({ step: 'idle' });
  const session = useRef<LocalFitSession | null>(null);
  const jdRef = useRef('');
  /** Bumped by `reset`: anything still resolving from an older run is ignored. */
  const generation = useRef(0);

  // Step 1, at idle after load. The client module is fetched here, off the
  // critical path, and reused on press.
  useEffect(() => {
    if (!PRIVATE_MODE_ENABLED) return;
    let live = true;
    const stop = afterLoadAndIdle(() => {
      void loadClient()
        .then((client) => client.probeLocalModel())
        .then(
          (outcome) => live && setProbe(outcome),
          () => live && setProbe({ supported: false, reason: 'no-worker', probe: null }),
        );
    });
    return () => {
      live = false;
      stop();
      session.current?.dispose();
      session.current = null;
    };
  }, []);

  const offer: PrivateModeOffer = !probe
    ? { state: 'checking' }
    : !probe.supported
      ? { state: 'hidden', reason: probe.reason }
      : saveData
        ? { state: 'disabled', reason: 'save-data', message: 'Private mode is off because Data Saver is on.' }
        : latched
          ? {
              state: 'disabled',
              reason: 'too-slow',
              message: 'Private mode was too slow on this device, so this check uses the keyword scan.',
            }
          : { state: 'available' };

  // The step-6 latch lives in sessionStorage; read it once the client module
  // has loaded (it owns the key), so a reload in the same tab stays disabled.
  useEffect(() => {
    if (!probe?.supported) return;
    let live = true;
    void loadClient().then((client) => live && setLatched(client.isTooSlowThisSession()));
    return () => {
      live = false;
    };
  }, [probe]);

  const fail = useCallback((err: unknown, gen: number) => {
    if (gen !== generation.current) return;
    const code = errorCode(err);
    if (code === 'too_slow') setLatched(true);
    if (code !== 'cancelled') {
      // A failed worker may hold a lost device or a half-loaded model: start
      // clean next time rather than reuse it.
      session.current?.dispose();
      session.current = null;
    }
    setFlow({ step: 'problem', message: problemMessage(code) });
  }, []);

  /** Steps 5, download, run. `skipBench` is the "download anyway" override. */
  const proceed = useCallback(
    async (skipBench: boolean) => {
      const gen = generation.current;
      try {
        const client = await loadClient();
        session.current ??= client.createLocalFitSession();
        const s = session.current;
        if (!s.state.loaded) {
          if (!skipBench) {
            setFlow({ step: 'bench' });
            const bench = await s.bench();
            if (gen !== generation.current) return;
            if (!bench.verdict.ok) {
              setFlow({ step: 'slow', seconds: bench.verdict.seconds });
              return;
            }
          }
          setFlow({ step: 'loading', progress: null });
          let last = -1;
          await s.load((progress) => {
            if (gen !== generation.current) return;
            // WebLLM reports very often; a re-render per whole percent is plenty.
            const pct = Math.floor(progress.fraction * 100);
            if (pct === last && progress.phase !== 'compile') return;
            last = pct;
            setFlow({ step: 'loading', progress });
          });
          if (gen !== generation.current) return;
        }
        setFlow({ step: 'running', rows: [] });
        const rows: Requirement[] = [];
        const report = await s.run(jdRef.current, (row) => {
          if (gen !== generation.current) return;
          rows.push(row);
          setFlow({ step: 'running', rows: [...rows] });
        });
        if (gen !== generation.current) return;
        setFlow({ step: 'done', report });
      } catch (err) {
        fail(err, gen);
      }
    },
    [fail],
  );

  /** The button: steps 3 and 4. A loaded model skips straight to the run. */
  const start = useCallback(
    async (jd: string) => {
      jdRef.current = jd;
      const gen = generation.current;
      if (session.current?.state.loaded) {
        void proceed(true);
        return;
      }
      setFlow({ step: 'storage' });
      try {
        const client = await loadClient();
        const storage = await client.checkStorage();
        if (gen !== generation.current) return;
        setFlow(storage.ok ? { step: 'consent', cached: storage.cached } : { step: 'no-storage' });
      } catch (err) {
        fail(err, gen);
      }
    },
    [fail, proceed],
  );

  const confirm = useCallback(() => void proceed(false), [proceed]);
  const override = useCallback(() => void proceed(true), [proceed]);
  const decline = useCallback(() => setFlow({ step: 'idle' }), []);
  const cancel = useCallback(() => session.current?.cancel(), []);

  /** A new JD: stop whatever is in flight and forget the old model report. */
  const reset = useCallback(() => {
    generation.current++;
    session.current?.cancel();
    setFlow({ step: 'idle' });
  }, []);

  return { offer, flow, start, confirm, override, decline, cancel, reset };
}

export type PrivateMode = ReturnType<typeof usePrivateMode>;

// ------------------------------------------------------------------ UI

const SECONDARY_BUTTON =
  'inline-flex min-h-[44px] items-center justify-center rounded-pill border border-control bg-surface px-5 py-2.5 font-ui text-sm font-semibold text-ink shadow-hairline transition-colors hover:border-ink hover:bg-panel disabled:cursor-not-allowed disabled:opacity-60';

const PRIMARY_BUTTON =
  'inline-flex min-h-[44px] items-center justify-center rounded-pill bg-cta px-5 py-2.5 font-ui text-sm font-bold text-cta-ink shadow-cta transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60';

const PHASE_LABEL: Record<LoadProgress['phase'], string> = {
  download: 'Downloading the model',
  cache: 'Loading the model from this browser’s cache',
  compile: 'Preparing the GPU',
  init: 'Starting the model',
};

function mb(bytes: number): string {
  return `${Math.round(bytes / 1e6).toLocaleString('en-US')} MB`;
}

/**
 * The consent dialog (step 4). A native modal <dialog>: it traps focus,
 * Escape cancels, and focus goes back to the button that opened it.
 */
function ConsentDialog({
  open,
  cached,
  onConfirm,
  onDecline,
  returnFocusTo,
}: {
  open: boolean;
  cached: boolean;
  onConfirm: () => void;
  onDecline: () => void;
  returnFocusTo: RefObject<HTMLButtonElement | null>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const confirmed = useRef(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      confirmed.current = false;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="fit-consent-title"
      aria-describedby="fit-consent-body"
      onClose={() => {
        returnFocusTo.current?.focus();
        if (!confirmed.current) onDecline();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-[520px] rounded-xl border border-hairline bg-surface p-0 text-body shadow-raised backdrop:bg-ink/40"
    >
      <div className="p-5 sm:p-7">
        <h2 id="fit-consent-title" className="font-display text-2xl leading-tight text-ink">
          Run Private mode on this device?
        </h2>
        <ul id="fit-consent-body" className="mt-4 list-disc space-y-2 pl-5 font-ui text-sm leading-relaxed text-body">
          {cached ? (
            <li>The model is already saved in this browser, so nothing new is downloaded.</li>
          ) : (
            <li>
              Downloads a {MODEL_SIZE} language model ({LOCAL_MODEL.id}) once, from Hugging Face ({MODEL_HOST}).
              Hugging Face sees your IP address, not the job description.
            </li>
          )}
          <li>The model is cached in this browser, so next time it starts without a download.</li>
          <li>The job description stays on this device. The model runs here, in a background worker.</li>
          <li>Before downloading, a quick test checks this device is fast enough.</li>
        </ul>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button type="button" className={SECONDARY_BUTTON} onClick={() => ref.current?.close()}>
            Cancel
          </button>
          <button
            type="button"
            className={PRIMARY_BUTTON}
            onClick={() => {
              confirmed.current = true;
              ref.current?.close();
              onConfirm();
            }}
          >
            {cached ? 'Run Private mode' : `Download ${MODEL_SIZE} and run`}
          </button>
        </div>
      </div>
    </dialog>
  );
}

/**
 * The Private-mode box, beneath the report. Its space is reserved while
 * step 1 is "Checking…"; when the device can't run the model it renders
 * nothing, and because nothing follows it on the page, nothing moves.
 */
export function PrivateModePanel({
  mode,
  jd,
  expectedRows,
}: {
  mode: PrivateMode;
  jd: string;
  /** The scan's row count: the estimate in "3 of ~8 requirements checked". */
  expectedRows: number;
}) {
  const { offer, flow } = mode;
  const buttonRef = useRef<HTMLButtonElement>(null);

  if (offer.state === 'hidden') {
    return <div data-testid="private-mode" data-offer="hidden" hidden />;
  }

  const reasonId = 'private-mode-reason';
  /** Steps that can't be interrupted from here; the button stays focusable. */
  const waiting = flow.step === 'storage' || flow.step === 'bench' || flow.step === 'consent';
  const primary: { label: string; onClick: () => void } =
    flow.step === 'loading' || flow.step === 'running'
      ? { label: 'Cancel', onClick: mode.cancel }
      : flow.step === 'slow'
        ? { label: 'Download anyway', onClick: mode.override }
        : waiting
          ? { label: flow.step === 'bench' ? 'Testing this device…' : 'Checking storage…', onClick: () => {} }
          : {
              label: flow.step === 'done' || flow.step === 'problem' ? 'Run Private mode again' : 'Try Private mode',
              onClick: () => void mode.start(jd),
            };

  return (
    <section
      data-testid="private-mode"
      data-offer={offer.state}
      aria-labelledby="private-mode-heading"
      className="mt-10 min-h-[176px] rounded-xl border border-hairline bg-panel p-5 shadow-hairline sm:p-6"
    >
      <h2 id="private-mode-heading" className="font-display text-xl leading-tight text-ink">
        Private mode
      </h2>

      {offer.state === 'checking' ? (
        <p className="mt-2 font-ui text-sm text-muted">Checking whether this device can run it…</p>
      ) : (
        <>
          <p className="mt-2 max-w-[60ch] font-ui text-sm leading-relaxed text-body">
            For a closer read, a small language model can run on this device and decide which lines are
            requirements and how important each is. It&rsquo;s a {MODEL_SIZE} download, once. The job description
            still never leaves this device.
          </p>

          {flow.step === 'no-storage' ? (
            <p className="mt-3 font-ui text-sm font-semibold text-ink">
              Not enough storage for the ~{MODEL_SIZE} model. The keyword scan above still stands.
            </p>
          ) : null}

          {flow.step === 'problem' ? (
            <p data-testid="private-mode-problem" className="mt-3 font-ui text-sm font-semibold text-ink">
              {flow.message} The keyword scan above still stands.
            </p>
          ) : null}

          {flow.step === 'slow' ? (
            <p className="mt-3 font-ui text-sm font-semibold text-ink">
              This device would take about {flow.seconds} s to check the first requirement, so the download hasn&rsquo;t
              started.
            </p>
          ) : null}

          {flow.step === 'loading' ? (
            <div className="mt-4">
              <label htmlFor="private-mode-progress" className="block font-ui text-sm font-semibold text-ink">
                {flow.progress ? PHASE_LABEL[flow.progress.phase] : 'Starting the download'}
              </label>
              <progress
                id="private-mode-progress"
                className="mt-2 block h-2 w-full appearance-none overflow-hidden rounded-pill border-0 bg-panel-subtle [&::-moz-progress-bar]:bg-ink [&::-webkit-progress-bar]:bg-panel-subtle [&::-webkit-progress-value]:rounded-pill [&::-webkit-progress-value]:bg-ink"
                max={flow.progress?.totalBytes || LOCAL_MODEL.downloadBytes}
                value={flow.progress && flow.progress.phase !== 'init' ? flow.progress.loadedBytes : undefined}
              />
              <p className="mt-1 font-mono text-[12px] tabular-nums text-muted">
                {mb(flow.progress?.loadedBytes ?? 0)} of {mb(flow.progress?.totalBytes || LOCAL_MODEL.downloadBytes)}
              </p>
            </div>
          ) : null}

          {flow.step === 'running' ? (
            <p className="mt-3 font-ui text-sm font-semibold text-ink">
              {flow.rows.length} of ~{Math.max(expectedRows, flow.rows.length)} requirements checked
            </p>
          ) : null}

          {flow.step === 'done' ? (
            <p className="mt-3 font-ui text-sm font-semibold text-ink">
              The Private-mode report replaced the keyword scan above.{' '}
              <a href="#fit-report-heading">Go to the report</a>
            </p>
          ) : null}

          {/* One button whose job follows the flow, so focus stays on it from
              press → consent → download → Cancel, instead of being dropped
              when one control is swapped for another. */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              ref={buttonRef}
              type="button"
              data-testid="private-mode-button"
              disabled={offer.state === 'disabled'}
              aria-disabled={waiting || undefined}
              aria-describedby={offer.state === 'disabled' ? reasonId : undefined}
              onClick={primary.onClick}
              className={SECONDARY_BUTTON}
            >
              {primary.label}
            </button>
            {flow.step === 'slow' ? (
              <button type="button" className={SECONDARY_BUTTON} onClick={mode.decline}>
                Keep the keyword scan
              </button>
            ) : null}
            {offer.state === 'disabled' ? (
              <p id={reasonId} className="font-ui text-sm text-muted">
                {offer.message}
              </p>
            ) : null}
          </div>
        </>
      )}

      <ConsentDialog
        open={flow.step === 'consent'}
        cached={flow.step === 'consent' && flow.cached}
        onConfirm={mode.confirm}
        onDecline={mode.decline}
        returnFocusTo={buttonRef}
      />
    </section>
  );
}
