'use client';

/*
 * global-error replaces the root layout when it renders, so it must ship its
 * own <html>/<body> AND its own styles — it cannot assume globals.css or the
 * font <link>s from the root layout are present. Hence the literal hex values
 * below; they are the same tokens globals.css defines:
 *
 *   paper #FFFDF7 · surface #FFFFFF · ink #161310 · muted #6B6358
 *   action (tangerine) #FF5E1A on action-ink #FFFFFF
 *   interactive (cobalt) #1F3BE0 — focus rings only
 *
 * The ONE primary action here is "Try again"; the resume download is secondary.
 */

const MONO = "'Space Mono', ui-monospace, monospace";

/** Hover/focus states can't be expressed inline, so they live in a scoped
 *  <style> tag. `interactive` owns the focus ring, matching the rest of the app. */
const BUTTON_CSS = `
.ge-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0.5rem 1rem;
  border: 3px solid #161310;
  border-radius: 0;
  font-family: ${MONO};
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-decoration: none;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.ge-btn:focus-visible {
  outline: 2px solid #1F3BE0;
  outline-offset: 2px;
}
/* Primary: the single 'action' surface on this screen. */
.ge-btn-primary {
  background-color: #FF5E1A;
  color: #FFFFFF;
  box-shadow: 5px 5px 0 #161310;
}
.ge-btn-primary:hover { transform: translate(-2px, -2px); box-shadow: 7px 7px 0 #161310; }
.ge-btn-primary:active { transform: none; box-shadow: 3px 3px 0 #161310; }
/* Secondary: outlined ink-on-paper, deliberately quieter than the CTA. */
.ge-btn-secondary {
  background-color: #FFFDF7;
  color: #161310;
  box-shadow: 3px 3px 0 #161310;
}
.ge-btn-secondary:hover { transform: translate(-2px, -2px); box-shadow: 5px 5px 0 #161310; }
.ge-btn-secondary:active { transform: none; box-shadow: 2px 2px 0 #161310; }
@media (prefers-reduced-motion: reduce) {
  .ge-btn, .ge-btn:hover, .ge-btn:active { transition: none; transform: none; }
}
`;

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          backgroundColor: '#FFFDF7',
          color: '#161310',
          fontFamily: 'Manrope, system-ui, sans-serif',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100dvh',
          margin: 0,
          padding: '1rem',
        }}
      >
        <style>{BUTTON_CSS}</style>
        <div
          role="alert"
          style={{
            maxWidth: '28rem',
            padding: '2rem',
            textAlign: 'center',
            border: '3px solid #161310',
            borderRadius: 0,
            backgroundColor: '#FFFFFF',
            boxShadow: '9px 9px 0 #161310',
          }}
        >
          <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '1rem', letterSpacing: '-0.025em', textTransform: 'uppercase' }}>
            Critical Error
          </h2>
          <p
            style={{
              fontFamily: MONO,
              fontSize: '0.875rem',
              color: '#6B6358',
              marginBottom: '1.5rem',
            }}
          >
            {error.message || 'A critical application error occurred.'}
          </p>
          {error.digest && (
            <p
              style={{
                fontFamily: MONO,
                fontSize: '0.75rem',
                color: '#6B6358',
                marginBottom: '1.5rem',
              }}
            >
              Digest: {error.digest}
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <button
              type="button"
              onClick={reset}
              className="ge-btn ge-btn-primary"
            >
              Try again
            </button>
            <a
              href="/KalebK_Resume.pdf"
              download
              className="ge-btn ge-btn-secondary"
            >
              Download Resume PDF
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
