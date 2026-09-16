import { CONTACT_INFO } from '@/data/resumeData';

/**
 * POST /api/contact — the contact form's submit target.
 *
 * Why a Route Handler and not a Server Action:
 * `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`
 * notes that progressive enhancement for `<form action={serverFn}>` is a
 * property of **Server Components** ("Server Components support progressive
 * enhancement by default"); in Client Components submissions are merely
 * "queued ... until hydration". ContactSection has to be a Client Component
 * (toggle pills, a live progress meter), so a Server Action there would be
 * dead with JS disabled. A plain `<form method="post" action="/api/contact">`
 * posting to this handler works with or without JavaScript.
 *
 * Accepts both shapes:
 *   - `application/json`      → the enhanced (fetch) path, replies with JSON
 *   - form-encoded / multipart → the no-JS native browser POST, replies HTML
 */

const REASONS = [
  'Full-time role',
  'Contract',
  'Open source',
  'Just saying hi',
] as const;

const LIMITS = {
  name: 120,
  email: 200,
  message: 4000,
} as const;

// Deliberately loose: "something@something.something" with no whitespace.
// Anything stricter rejects real addresses.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ContactFieldErrors = Partial<
  Record<'reason' | 'name' | 'email' | 'message', string>
>;

export type ContactResult = {
  ok: boolean;
  /** Machine-readable outcome, so the UI can branch without string matching. */
  code: 'sent' | 'invalid' | 'rejected' | 'not_configured' | 'delivery_failed';
  message: string;
  fieldErrors?: ContactFieldErrors;
};

export type ContactMessage = {
  reason: string;
  name: string;
  email: string;
  message: string;
};

/** How long to wait on the delivery provider before giving up. */
const DELIVERY_TIMEOUT_MS = 10_000;

/**
 * Resolve `CONTACT_DELIVERY_KEY` into a Formspree endpoint.
 *
 * Accepts either the full endpoint (`https://formspree.io/f/abcdwxyz`) or the
 * bare form id (`abcdwxyz`), because the Formspree dashboard shows both and it
 * is genuinely ambiguous which one to paste. Anything else is treated as
 * unconfigured rather than fired blindly at an arbitrary URL — an env var typo
 * should not become an outbound request to someone else's server.
 */
function resolveEndpoint(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  if (/^[A-Za-z0-9]{6,}$/.test(value)) return `https://formspree.io/f/${value}`;

  try {
    const url = new URL(value);
    const isFormspree =
      url.protocol === 'https:' &&
      (url.hostname === 'formspree.io' || url.hostname.endsWith('.formspree.io'));
    return isFormspree ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * The single integration point where a message actually leaves the building.
 *
 * Delivery is Formspree (https://formspree.io): a plain POST, no SDK, no new
 * dependency, and no DNS to configure — which is why it was chosen over Resend,
 * whose domain verification needs records on a domain that has to exist first.
 *
 * `CONTACT_DELIVERY_KEY` holds the form endpoint or its id. Formspree treats
 * the `email` field as the reply-to, so replying to the notification reaches
 * the sender directly.
 *
 * The contract this function must never break: it reports `sent` only when the
 * provider accepted the message. A contact form that swallows mail is worse
 * than no contact form, because the sender stops looking for you.
 */
async function deliverContactMessage(
  message: ContactMessage,
): Promise<ContactResult> {
  const endpoint = resolveEndpoint(process.env.CONTACT_DELIVERY_KEY ?? '');

  if (!endpoint) {
    return {
      ok: false,
      code: 'not_configured',
      message:
        `This form isn't connected to a mail service yet, so nothing was sent. ` +
        `Please email ${CONTACT_INFO.email} directly — that always works.`,
    };
  }

  // Never let the visitor wait on a hung provider.
  const timeout = AbortSignal.timeout(DELIVERY_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Without this Formspree replies with an HTML redirect page.
        Accept: 'application/json',
      },
      body: JSON.stringify({
        name: message.name,
        email: message.email,
        message: message.message,
        // Surfaced in the notification's subject line, so the inbox is triageable.
        _subject: `Portfolio contact — ${message.reason} — ${message.name}`,
        reason: message.reason,
      }),
      signal: timeout,
      cache: 'no-store',
    });

    if (response.ok) {
      return {
        ok: true,
        code: 'sent',
        message: `Thanks — that reached me. I'll reply to ${message.email}.`,
      };
    }

    // Log the provider's own words server-side; show the visitor something
    // actionable instead. Formspree's errors ("form not found", "inactive",
    // monthly cap reached) are the site owner's problem, not the sender's.
    let detail = `HTTP ${response.status}`;
    try {
      const body: unknown = await response.json();
      if (typeof body === 'object' && body !== null) {
        const parsed = body as { error?: unknown; errors?: unknown };
        if (typeof parsed.error === 'string') detail = parsed.error;
        else if (Array.isArray(parsed.errors)) {
          detail = parsed.errors
            .map((e) =>
              typeof e === 'object' && e !== null && 'message' in e
                ? String((e as { message: unknown }).message)
                : String(e),
            )
            .join('; ');
        }
      }
    } catch {
      // Body wasn't JSON. `detail` keeps the status code.
    }
    console.error('[contact] delivery rejected by provider:', detail);

    return {
      ok: false,
      code: 'delivery_failed',
      message:
        `The message couldn't be delivered just now, so it was not sent. ` +
        `Please email ${CONTACT_INFO.email} directly.`,
    };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    console.error('[contact] delivery threw:', error);

    return {
      ok: false,
      code: 'delivery_failed',
      message:
        (timedOut
          ? `The mail service didn't respond in time, so nothing was sent. `
          : `The message couldn't be delivered just now, so it was not sent. `) +
        `Please email ${CONTACT_INFO.email} directly.`,
    };
  }
}

/** FormData may carry several `reason` entries (see the no-JS fallback). */
function firstNonEmpty(values: FormDataEntryValue[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

type ParsedSubmission = {
  reason: string;
  name: string;
  email: string;
  message: string;
  /** Honeypot. Humans never see this field, so any value means a bot. */
  company: string;
};

async function parseSubmission(
  request: Request,
): Promise<ParsedSubmission | null> {
  const contentType = request.headers.get('content-type') ?? '';

  try {
    if (contentType.includes('application/json')) {
      const body: unknown = await request.json();
      if (typeof body !== 'object' || body === null) return null;
      const raw = body as Record<string, unknown>;
      return {
        reason: readString(raw.reason),
        name: readString(raw.name),
        email: readString(raw.email),
        message: readString(raw.message),
        company: readString(raw.company),
      };
    }

    const formData = await request.formData();
    return {
      reason: firstNonEmpty(formData.getAll('reason')),
      name: readString(formData.get('name')),
      email: readString(formData.get('email')),
      message: readString(formData.get('message')),
      company: readString(formData.get('company')),
    };
  } catch {
    return null;
  }
}

function validate(submission: ParsedSubmission): ContactFieldErrors {
  const fieldErrors: ContactFieldErrors = {};

  if (!submission.reason) {
    fieldErrors.reason = 'Pick what this is about.';
  } else if (!REASONS.includes(submission.reason as (typeof REASONS)[number])) {
    fieldErrors.reason = 'That is not one of the available options.';
  }

  if (!submission.name) {
    fieldErrors.name = 'Please add your name.';
  } else if (submission.name.length > LIMITS.name) {
    fieldErrors.name = `Please keep your name under ${LIMITS.name} characters.`;
  }

  if (!submission.email) {
    fieldErrors.email = 'Please add an email address so I can reply.';
  } else if (submission.email.length > LIMITS.email) {
    fieldErrors.email = `Please keep the address under ${LIMITS.email} characters.`;
  } else if (!EMAIL_PATTERN.test(submission.email)) {
    fieldErrors.email = 'That address does not look right.';
  }

  if (!submission.message) {
    fieldErrors.message = 'Please add a short message.';
  } else if (submission.message.length > LIMITS.message) {
    fieldErrors.message = `Please keep the message under ${LIMITS.message} characters.`;
  }

  return fieldErrors;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * The no-JS reply. A native browser POST navigates away from the page, so it
 * needs a real document to land on — with the outcome, the mailto fallback,
 * and a way back to the form.
 */
function htmlResult(result: ContactResult, status: number): Response {
  const detail = Object.values(result.fieldErrors ?? {})
    .map((error) => `<li>${escapeHtml(error)}</li>`)
    .join('');

  const body = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${result.ok ? 'Message sent' : 'Message not sent'} — ${escapeHtml(CONTACT_INFO.name)}</title>
<style>
  :root { color-scheme: light; }
  body { margin:0; padding:3rem 1.25rem; background:#fffdf7; color:#3a342c;
         font:500 16px/1.55 ui-sans-serif, system-ui, sans-serif; }
  main { max-width:34rem; margin:0 auto; background:#fff; border:1px solid #e6e0d2;
         border-radius:18px; padding:2rem; box-shadow:0 30px 60px -36px rgba(22,19,16,.45); }
  h1 { margin:0 0 .75rem; color:#161310; font-size:1.5rem; letter-spacing:-.03em; }
  ul { margin:0 0 1rem; padding-left:1.15rem; }
  a { color:#1f3be0; }
  .back { display:inline-block; margin-top:1.25rem; padding:.7rem 1.1rem; border-radius:999px;
          background:#ff5e1a; color:#161310; font-weight:700; text-decoration:none; }
</style>
</head>
<body>
<main>
  <h1>${result.ok ? 'Message sent' : 'Message not sent'}</h1>
  ${detail ? `<ul>${detail}</ul>` : ''}
  <p>${escapeHtml(result.message)}</p>
  <p>Email direct: <a href="mailto:${escapeHtml(CONTACT_INFO.email)}">${escapeHtml(CONTACT_INFO.email)}</a></p>
  <a class="back" href="/#contact">Back to the form</a>
</main>
</body>
</html>`;

  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function wantsHtml(request: Request): boolean {
  const accept = request.headers.get('accept') ?? '';
  // The fetch path sets `Accept: application/json` explicitly; a browser
  // navigation sends `text/html,...` and expects a document back.
  return accept.includes('text/html') && !accept.includes('application/json');
}

function reply(
  request: Request,
  result: ContactResult,
  status: number,
): Response {
  if (wantsHtml(request)) return htmlResult(result, status);
  return Response.json(result, { status });
}

export async function POST(request: Request): Promise<Response> {
  const submission = await parseSubmission(request);

  if (!submission) {
    return reply(
      request,
      {
        ok: false,
        code: 'invalid',
        message: "That submission couldn't be read. Please try again.",
      },
      400,
    );
  }

  // Honeypot. An off-screen, aria-hidden, tabindex="-1" field no human fills
  // in. We do not fake a success for it — the rule here is that nothing ever
  // reports "sent" unless it was sent.
  if (submission.company) {
    return reply(
      request,
      {
        ok: false,
        code: 'rejected',
        message: `This submission was flagged as automated and was not sent. If that is wrong, email ${CONTACT_INFO.email} directly.`,
      },
      400,
    );
  }

  const fieldErrors = validate(submission);
  if (Object.keys(fieldErrors).length > 0) {
    return reply(
      request,
      {
        ok: false,
        code: 'invalid',
        message: 'Please fix the highlighted fields and send again.',
        fieldErrors,
      },
      400,
    );
  }

  const result = await deliverContactMessage({
    reason: submission.reason,
    name: submission.name,
    email: submission.email,
    message: submission.message,
  });

  const status = result.ok ? 200 : result.code === 'not_configured' ? 503 : 502;
  return reply(request, result, status);
}
