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
          backgroundColor: '#1e1e2e',
          color: '#cdd6f4',
          fontFamily: 'Inter, system-ui, sans-serif',
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
            border: '1px solid #313244',
            borderRadius: '0.5rem',
            backgroundColor: '#11111b',
          }}
        >
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>
            Critical Error
          </h2>
          <p
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.875rem',
              color: '#6c7086',
              marginBottom: '1.5rem',
            }}
          >
            {error.message || 'A critical application error occurred.'}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <button
              onClick={reset}
              style={{
                backgroundColor: '#89b4fa',
                color: '#1e1e2e',
                border: 'none',
                borderRadius: '0.375rem',
                padding: '0.5rem 1rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            <a
              href="/KalebK_Resume.pdf"
              download
              style={{
                color: '#89b4fa',
                fontSize: '0.875rem',
                textDecoration: 'underline',
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
