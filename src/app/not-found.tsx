import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="error-page">
      <div className="error-page__panel">
        {/*
          Display numeral, not a link — so it stays ink. `interactive` (cobalt)
          is only for things the user can act on or has acted on.
        */}
        <p className="error-page__code">
          404
        </p>
        <h2 className="error-page__title">
          File Not Found
        </h2>
        <p className="error-page__message">
          {'> [ERROR] The requested resource could not be located in the project hierarchy.'}
        </p>
        <div className="flex flex-col gap-4">
          {/* Primary CTA — the only `action` surface on this screen. */}
          <Link href="/" className="button button--brutal button--pressable active:shadow-[3px_3px_0_#161310]">
            Return to IDE
          </Link>
          {/* Secondary — quieter shadow, outlined ink-on-paper. */}
          <a href="/KalebK_Resume.pdf" download className="button button--brutal button--pressable shadow-[3px_3px_0_#161310] hover:shadow-[5px_5px_0_#161310] active:shadow-[2px_2px_0_#161310]">
            Download Resume PDF
          </a>
        </div>
      </div>
    </div>
  );
}
