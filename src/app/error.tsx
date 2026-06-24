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
      className="flex h-dvh w-full items-center justify-center bg-bg-editor"
    >
      <div className="mx-auto max-w-md space-y-6 border-[3px] border-border bg-bg-panel p-8 text-center shadow-[9px_9px_0_#161310]">
        <div className="mx-auto flex h-12 w-12 items-center justify-center border-[3px] border-border bg-tangerine">
          <span className="text-2xl">⚠</span>
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
        <div className="flex flex-col gap-3">
          <button
            onClick={reset}
            className="border-[3px] border-border bg-cobalt px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.08em] text-white shadow-[5px_5px_0_#161310] transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5"
          >
            Try again
          </button>
          <a
            href="/KalebK_Resume.pdf"
            download
            className="font-mono text-xs font-bold uppercase tracking-[0.08em] text-text-accent underline decoration-[3px] underline-offset-4 transition-colors hover:bg-lime hover:text-ink"
          >
            Download Resume PDF
          </a>
        </div>
      </div>
    </div>
  );
}
