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
      <div className="mx-auto max-w-md space-y-6 rounded-lg border border-border bg-bg-panel p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-text-red/10">
          <span className="text-2xl">⚠</span>
        </div>
        <h2 className="font-ui text-xl font-semibold text-text-primary">
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
            className="rounded-md bg-text-accent px-4 py-2 text-sm font-medium text-bg-editor transition-colors hover:bg-text-accent/80"
          >
            Try again
          </button>
          <a
            href="/KalebK_Resume.pdf"
            download
            className="text-sm text-text-accent underline underline-offset-2 transition-colors hover:text-text-primary"
          >
            Download Resume PDF
          </a>
        </div>
      </div>
    </div>
  );
}
