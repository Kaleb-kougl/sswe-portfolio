import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex h-dvh w-full items-center justify-center bg-bg-editor">
      <div className="mx-auto max-w-md space-y-6 border-[3px] border-border bg-bg-panel p-8 text-center shadow-[9px_9px_0_#161310]">
        <p className="font-display text-7xl font-black tracking-[-0.035em] text-text-accent">404</p>
        <h2 className="font-display text-3xl font-black uppercase tracking-[-0.025em] text-text-primary">
          File Not Found
        </h2>
        <p className="font-mono text-sm text-text-muted">
          {'> [ERROR] The requested resource could not be located in the project hierarchy.'}
        </p>
        <div className="flex flex-col gap-3">
          <Link
            href="/"
            className="border-[3px] border-border bg-cobalt px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.08em] text-white shadow-[5px_5px_0_#161310] transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5"
          >
            Return to IDE
          </Link>
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
