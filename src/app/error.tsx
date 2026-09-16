'use client';

/** Shared focus treatment — `interactive` owns focus rings. */
const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive';

/**
 * The ONE primary action on this screen is "Try again" — recovering from the
 * error is what the user came here to do, so `action` (tangerine) is spent on
 * the reset button. Everything else, the resume download included, drops to
 * the outlined secondary treatment.
 */
const PRIMARY_ACTION =
  `inline-flex min-h-[44px] items-center justify-center border-[3px] border-border bg-action px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.08em] text-action-ink shadow-[5px_5px_0_#161310] transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[7px_7px_0_#161310] active:translate-x-0 active:translate-y-0 active:shadow-[3px_3px_0_#161310] ${FOCUS_RING}`;

const SECONDARY_ACTION =
  `inline-flex min-h-[44px] items-center justify-center border-[3px] border-border bg-header-bg px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.08em] text-header-ink shadow-[3px_3px_0_#161310] transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5px_5px_0_#161310] active:translate-x-0 active:translate-y-0 active:shadow-[2px_2px_0_#161310] ${FOCUS_RING}`;

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex h-dvh w-full items-center justify-center bg-bg-editor p-4"
    >
      <div className="mx-auto max-w-md space-y-6 border-[3px] border-border bg-bg-panel p-8 text-center shadow-[9px_9px_0_#161310]">
        {/*
          Decorative alert glyph. Deliberately ink-on-paper inverted rather than
          a tangerine chip: `action` is reserved for the single CTA below and is
          never a decorative fill.
        */}
        <div
          aria-hidden="true"
          className="mx-auto flex h-12 w-12 items-center justify-center border-[3px] border-border bg-ink text-paper"
        >
          <span className="text-2xl leading-none">⚠</span>
        </div>
        <h2 className="font-display text-3xl font-black uppercase tracking-[-0.025em] text-text-primary">
          Something went wrong
        </h2>
        <p className="font-mono text-sm text-text-muted">
          {error.message || 'An unexpected error occurred.'}
        </p>
        {error.digest && (
          <p className="font-mono text-xs text-text-muted">
            Digest: {error.digest}
          </p>
        )}
        <div className="flex flex-col gap-4">
          {/* Primary CTA — the only `action` surface on this screen. */}
          <button type="button" onClick={reset} className={PRIMARY_ACTION}>
            Try again
          </button>
          {/* Secondary — quieter shadow, outlined ink-on-paper. */}
          <a href="/KalebK_Resume.pdf" download className={SECONDARY_ACTION}>
            Download Resume PDF
          </a>
        </div>
      </div>
    </div>
  );
}
