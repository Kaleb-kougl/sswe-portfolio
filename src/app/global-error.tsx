'use client';

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
        }}
      >
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
              fontFamily: "'Space Mono', monospace",
              fontSize: '0.875rem',
              color: '#6B6358',
              marginBottom: '1.5rem',
            }}
          >
            {error.message || 'A critical application error occurred.'}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <button
              onClick={reset}
              style={{
                backgroundColor: '#1F3BE0',
                color: '#FFFFFF',
                border: '3px solid #161310',
                borderRadius: 0,
                padding: '0.5rem 1rem',
                fontFamily: "'Space Mono', monospace",
                fontSize: '0.75rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                boxShadow: '5px 5px 0 #161310',
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            <a
              href="/KalebK_Resume.pdf"
              download
              style={{
                color: '#1F3BE0',
                fontFamily: "'Space Mono', monospace",
                fontSize: '0.75rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                textDecoration: 'underline',
                textDecorationThickness: '3px',
                textUnderlineOffset: '4px',
              }}
            >
              Download Resume PDF
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
