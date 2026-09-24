'use client';

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
      className="error-page"
    >
      <div className="error-page__panel">
        {/*
          Decorative alert glyph. Deliberately ink-on-paper inverted rather than
          a tangerine chip: `action` is reserved for the single CTA below and is
          never a decorative fill.
        */}
        <div
          aria-hidden="true"
          className="error-page__glyph"
        >
          <span className="text-2xl leading-none">⚠</span>
        </div>
        <h2 className="error-page__title">
          Something went wrong
        </h2>
        <p className="error-page__message">
          {error.message || 'An unexpected error occurred.'}
        </p>
        {error.digest && (
          <p className="error-page__digest">
            Digest: {error.digest}
          </p>
        )}
        <div className="flex flex-col gap-4">
          {/* Primary CTA — the only `action` surface on this screen. */}
          <button type="button" onClick={reset} className="button button--brutal button--pressable active:shadow-[3px_3px_0_#161310]">
            Try again
          </button>
          {/* Secondary — quieter shadow, outlined ink-on-paper. */}
          <a href="/KalebK_Resume.pdf" download className="button button--brutal button--pressable shadow-[3px_3px_0_#161310] hover:shadow-[5px_5px_0_#161310] active:shadow-[2px_2px_0_#161310]">
            Download Resume PDF
          </a>
        </div>
      </div>
    </div>
  );
}
