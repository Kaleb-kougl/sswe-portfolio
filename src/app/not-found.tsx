import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex h-dvh w-full items-center justify-center bg-bg-editor">
      <div className="mx-auto max-w-md space-y-6 rounded-lg border border-border bg-bg-panel p-8 text-center">
        <p className="font-mono text-6xl font-bold text-text-accent">404</p>
        <h2 className="font-ui text-xl font-semibold text-text-primary">
          File Not Found
        </h2>
        <p className="font-mono text-sm text-text-muted">
          {'> [ERROR] The requested resource could not be located in the project hierarchy.'}
        </p>
        <div className="flex flex-col gap-3">
          <Link
            href="/"
            className="rounded-md bg-text-accent px-4 py-2 text-sm font-medium text-bg-editor transition-colors hover:bg-text-accent/80"
          >
            Return to IDE
          </Link>
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
