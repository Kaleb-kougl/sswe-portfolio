import Link from 'next/link';

/** Shared focus treatment — `interactive` owns focus rings. */
const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive';

/**
 * The ONE primary action on this screen is "Return to IDE" — getting the user
 * back to the app is the point of a 404. The resume download drops to the
 * outlined secondary treatment.
 */
const PRIMARY_ACTION =
  `inline-flex min-h-[44px] items-center justify-center border-[3px] border-border bg-action px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.08em] text-action-ink shadow-[5px_5px_0_#161310] transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[7px_7px_0_#161310] active:translate-x-0 active:translate-y-0 active:shadow-[3px_3px_0_#161310] ${FOCUS_RING}`;

const SECONDARY_ACTION =
  `inline-flex min-h-[44px] items-center justify-center border-[3px] border-border bg-header-bg px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.08em] text-header-ink shadow-[3px_3px_0_#161310] transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5px_5px_0_#161310] active:translate-x-0 active:translate-y-0 active:shadow-[2px_2px_0_#161310] ${FOCUS_RING}`;

export default function NotFound() {
  return (
    <div className="flex h-dvh w-full items-center justify-center bg-bg-editor p-4">
      <div className="mx-auto max-w-md space-y-6 border-[3px] border-border bg-bg-panel p-8 text-center shadow-[9px_9px_0_#161310]">
        {/*
          Display numeral, not a link — so it stays ink. `interactive` (cobalt)
          is only for things the user can act on or has acted on.
        */}
        <p className="font-display text-7xl font-black tracking-[-0.035em] text-text-primary">
          404
        </p>
        <h2 className="font-display text-3xl font-black uppercase tracking-[-0.025em] text-text-primary">
          File Not Found
        </h2>
        <p className="font-mono text-sm text-text-muted">
          {'> [ERROR] The requested resource could not be located in the project hierarchy.'}
        </p>
        <div className="flex flex-col gap-4">
          {/* Primary CTA — the only `action` surface on this screen. */}
          <Link href="/" className={PRIMARY_ACTION}>
            Return to IDE
          </Link>
          {/* Secondary — quieter shadow, outlined ink-on-paper. */}
          <a href="/KalebK_Resume.pdf" download className={SECONDARY_ACTION}>
            Download Resume PDF
          </a>
        </div>
      </div>
    </div>
  );
}
