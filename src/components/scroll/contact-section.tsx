'use client';

import {
  type FormEvent,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AlertCircle, ArrowUpRight, Download } from 'lucide-react';
import { CONTACT_INFO } from '@/data/resumeData';

/* ---------------------------------------------------------------------------
   ContactSection

   The form genuinely posts to the Route Handler at `src/app/api/contact/route.ts`.
   There is no mail provider wired up in this repo, so that handler answers
   `not_configured` and this UI says so in plain words and points at the mailto
   link. It never claims a message was sent.

   Progressive enhancement: the <form> carries real `method`/`action`
   attributes, so with JavaScript disabled the browser posts it natively and
   the handler replies with an HTML result page. The docs
   (01-app/01-getting-started/07-mutating-data.md) are explicit that Server
   Action progressive enhancement is a Server Component property — a Client
   Component (which this must be, for the pills and live progress meter) only
   "queues" such submissions until hydration. Hence the Route Handler.
   --------------------------------------------------------------------------- */

const REASONS = [
  'Full-time role',
  'Contract',
  'Open source',
  'Just saying hi',
] as const;

type Reason = (typeof REASONS)[number];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MESSAGE_LIMIT = 4000;

type FieldName = 'reason' | 'name' | 'email' | 'message';
type FieldErrors = Partial<Record<FieldName, string>>;

type ContactResult = {
  ok: boolean;
  code: 'sent' | 'invalid' | 'rejected' | 'not_configured' | 'delivery_failed';
  message: string;
  fieldErrors?: FieldErrors;
};

type Status =
  | { tone: 'idle' }
  | { tone: 'pending' }
  | { tone: 'sent'; message: string }
  | { tone: 'problem'; message: string; showMailto: boolean };

/** Shared input recipe. A `control` border is only 1.51:1 on paper, so it is
 *  always paired with a `paper` fill + hairline shadow, never left to carry
 *  the control on its own. 16px text keeps iOS Safari from zooming on focus. */
const FIELD_CLASS =
  'w-full min-h-[44px] rounded-sm border border-control bg-paper px-3.5 py-2.5 ' +
  'text-base text-ink shadow-hairline placeholder:text-muted ' +
  'transition-colors hover:border-ink/40';

const FIELD_ERROR_CLASS = 'border-ink bg-panel-subtle';

/** White pill with a `control` border + shadow — the quiet secondary action. */
const SECONDARY_LINK_CLASS =
  'inline-flex min-h-[44px] items-center gap-2 rounded-pill border border-control ' +
  'bg-surface px-5 py-2.5 font-ui text-sm font-semibold text-ink shadow-hairline ' +
  'transition-colors hover:border-ink hover:bg-panel';

/**
 * No-JS fallback for the reason pills. The pills are `aria-pressed` buttons
 * (per the design), which are inert without JavaScript — so with scripting
 * off the browser renders this native radio group instead and the handler
 * reads the first non-empty `reason` entry it finds. Written through
 * `dangerouslySetInnerHTML` because React serialises <noscript> children on
 * the server but the browser parses them as text on the client, which would
 * otherwise produce a hydration mismatch.
 */
const NOSCRIPT_REASONS = `
<div class="mt-3 rounded-sm border border-control bg-panel p-3 shadow-hairline">
  <p class="mb-2 font-ui text-sm font-semibold text-ink">JavaScript is off — choose one:</p>
  ${REASONS.map(
    (reason) => `<label class="mr-4 inline-flex items-center gap-2 font-ui text-base text-body">
    <input type="radio" name="reason" value="${reason}"> ${reason}
  </label>`,
  ).join('')}
</div>`;

function validateClientSide(values: {
  reason: Reason | null;
  name: string;
  email: string;
  message: string;
}): FieldErrors {
  const errors: FieldErrors = {};
  if (!values.reason) errors.reason = 'Pick what this is about.';
  if (!values.name.trim()) errors.name = 'Please add your name.';
  if (!values.email.trim()) {
    errors.email = 'Please add an email address so I can reply.';
  } else if (!EMAIL_PATTERN.test(values.email.trim())) {
    errors.email = 'That address does not look right.';
  }
  if (!values.message.trim()) errors.message = 'Please add a short message.';
  return errors;
}

export function ContactSection() {
  const uid = useId();
  const formRef = useRef<HTMLFormElement>(null);

  const [reason, setReason] = useState<Reason | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<Status>({ tone: 'idle' });

  const ids = useMemo(
    () => ({
      heading: `${uid}-heading`,
      legend: `${uid}-legend`,
      name: `${uid}-name`,
      email: `${uid}-email`,
      message: `${uid}-message`,
      company: `${uid}-company`,
      reasonError: `${uid}-reason-error`,
      nameError: `${uid}-name-error`,
      emailError: `${uid}-email-error`,
      messageError: `${uid}-message-error`,
    }),
    [uid],
  );

  /** The four counted fields, exactly as the progress meter advertises them. */
  const completed =
    (reason ? 1 : 0) +
    (name.trim() ? 1 : 0) +
    (EMAIL_PATTERN.test(email.trim()) ? 1 : 0) +
    (message.trim() ? 1 : 0);

  const pending = status.tone === 'pending';

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (pending) return;

      const clientErrors = validateClientSide({ reason, name, email, message });
      if (Object.keys(clientErrors).length > 0) {
        setErrors(clientErrors);
        setStatus({
          tone: 'problem',
          message: 'Please fix the highlighted fields and send again.',
          showMailto: false,
        });
        return;
      }

      setErrors({});
      setStatus({ tone: 'pending' });

      // The honeypot lives in the DOM only; read it straight off the form.
      const honeypot = formRef.current
        ? String(new FormData(formRef.current).get('company') ?? '')
        : '';

      try {
        const response = await fetch('/api/contact', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            reason,
            name: name.trim(),
            email: email.trim(),
            message: message.trim(),
            company: honeypot,
          }),
        });

        const result = (await response.json()) as ContactResult;

        if (result.ok) {
          setStatus({ tone: 'sent', message: result.message });
          setReason(null);
          setName('');
          setEmail('');
          setMessage('');
          return;
        }

        setErrors(result.fieldErrors ?? {});
        setStatus({
          tone: 'problem',
          message: result.message,
          // Anything that isn't the visitor's fault gets the mailto escape hatch.
          showMailto: result.code !== 'invalid',
        });
      } catch {
        setStatus({
          tone: 'problem',
          message: "The message couldn't be sent — the server didn't respond.",
          showMailto: true,
        });
      }
    },
    [email, message, name, pending, reason],
  );

  const describedBy = (field: FieldName, errorId: string) =>
    errors[field] ? errorId : undefined;

  return (
    <section
      id="contact"
      aria-labelledby={ids.heading}
      className="px-5 py-20 md:py-28"
    >
      {/* --- Header ------------------------------------------------------- */}
      <div className="mx-auto max-w-[640px] text-center">
        <p className="eyebrow">GET IN TOUCH</p>
        <h2
          id={ids.heading}
          className="mt-4 font-display text-[32px] leading-[1.05] text-ink md:text-[56px]"
        >
          Let&rsquo;s build the next platform.
        </h2>
        <p className="mt-4 font-ui text-base text-body">
          Four quick fields, or email me directly at{' '}
          <a href={`mailto:${CONTACT_INFO.email}`}>{CONTACT_INFO.email}</a>
        </p>
      </div>

      {/* --- Card --------------------------------------------------------- */}
      <div className="mx-auto mt-10 w-full max-w-[640px] rounded-xl border border-hairline bg-surface p-5 shadow-raised sm:p-8">
        {/* Progress meter ------------------------------------------------- */}
        <div className="mb-6">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
              Progress
            </span>
            <span className="font-mono text-[11px] font-bold tracking-[0.08em] text-ink">
              {completed} of 4
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Contact form completion"
            aria-valuenow={completed}
            aria-valuemin={0}
            aria-valuemax={4}
            aria-valuetext={`${completed} of 4 fields complete`}
            className="h-2 w-full overflow-hidden rounded-pill bg-panel-subtle"
          >
            <div
              className="h-full rounded-pill bg-ink transition-[width] duration-300"
              style={{ width: `${(completed / 4) * 100}%` }}
            />
          </div>
        </div>

        <form
          ref={formRef}
          action="/api/contact"
          method="post"
          onSubmit={handleSubmit}
          noValidate
        >
          {/* Honeypot: off-screen, aria-hidden, untabbable. No human fills
              this in, so any value is treated as automated by the handler. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute h-0 w-0 overflow-hidden"
          >
            <label htmlFor={ids.company}>Company (leave this field empty)</label>
            <input
              id={ids.company}
              name="company"
              type="text"
              tabIndex={-1}
              autoComplete="off"
            />
          </div>

          {/* Reason pills ------------------------------------------------- */}
          <fieldset
            className="m-0 border-0 p-0"
            aria-describedby={describedBy('reason', ids.reasonError)}
          >
            <legend
              id={ids.legend}
              className="mb-3 font-ui text-sm font-semibold text-ink"
            >
              What&rsquo;s this about?
            </legend>
            <div className="flex flex-wrap gap-2">
              {REASONS.map((option) => {
                const selected = reason === option;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setReason(option);
                      setErrors((prev) => ({ ...prev, reason: undefined }));
                    }}
                    className={
                      'min-h-[44px] rounded-pill border px-4 py-2.5 font-ui text-sm font-semibold transition-colors ' +
                      (selected
                        ? // Selected is a full ink fill, not a border change —
                          // the border alone is far under the 3:1 non-text minimum.
                          'border-ink bg-ink text-paper shadow-card'
                        : 'border-control bg-surface text-body shadow-hairline hover:border-ink hover:text-ink')
                    }
                  >
                    {option}
                  </button>
                );
              })}
            </div>

            <noscript dangerouslySetInnerHTML={{ __html: NOSCRIPT_REASONS }} />
            {/* Carries the pill choice on a native (pre-hydration) submit. */}
            <input type="hidden" name="reason" value={reason ?? ''} />

            {errors.reason ? (
              <p
                id={ids.reasonError}
                role="alert"
                className="mt-2 flex items-center gap-1.5 font-ui text-sm font-semibold text-ink"
              >
                <AlertCircle size={15} strokeWidth={2.5} aria-hidden="true" />
                {errors.reason}
              </p>
            ) : null}
          </fieldset>

          {/* Name + Email ------------------------------------------------- */}
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label
                htmlFor={ids.name}
                className="mb-1.5 block font-ui text-sm font-semibold text-ink"
              >
                Name
              </label>
              <input
                id={ids.name}
                name="name"
                type="text"
                autoComplete="name"
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={describedBy('name', ids.nameError)}
                className={`${FIELD_CLASS} ${errors.name ? FIELD_ERROR_CLASS : ''}`}
              />
              {errors.name ? (
                <p
                  id={ids.nameError}
                  role="alert"
                  className="mt-1.5 flex items-center gap-1.5 font-ui text-sm font-semibold text-ink"
                >
                  <AlertCircle size={15} strokeWidth={2.5} aria-hidden="true" />
                  {errors.name}
                </p>
              ) : null}
            </div>

            <div>
              <label
                htmlFor={ids.email}
                className="mb-1.5 block font-ui text-sm font-semibold text-ink"
              >
                Email
              </label>
              <input
                id={ids.email}
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                maxLength={200}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={describedBy('email', ids.emailError)}
                className={`${FIELD_CLASS} ${errors.email ? FIELD_ERROR_CLASS : ''}`}
              />
              {errors.email ? (
                <p
                  id={ids.emailError}
                  role="alert"
                  className="mt-1.5 flex items-center gap-1.5 font-ui text-sm font-semibold text-ink"
                >
                  <AlertCircle size={15} strokeWidth={2.5} aria-hidden="true" />
                  {errors.email}
                </p>
              ) : null}
            </div>
          </div>

          {/* Message ------------------------------------------------------ */}
          <div className="mt-4">
            <label
              htmlFor={ids.message}
              className="mb-1.5 block font-ui text-sm font-semibold text-ink"
            >
              Message
            </label>
            <textarea
              id={ids.message}
              name="message"
              rows={3}
              maxLength={MESSAGE_LIMIT}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              aria-invalid={errors.message ? true : undefined}
              aria-describedby={describedBy('message', ids.messageError)}
              className={`${FIELD_CLASS} resize-y ${errors.message ? FIELD_ERROR_CLASS : ''}`}
            />
            {errors.message ? (
              <p
                id={ids.messageError}
                role="alert"
                className="mt-1.5 flex items-center gap-1.5 font-ui text-sm font-semibold text-ink"
              >
                <AlertCircle size={15} strokeWidth={2.5} aria-hidden="true" />
                {errors.message}
              </p>
            ) : null}
          </div>

          {/* Submit + status ---------------------------------------------- */}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-pill bg-cta px-6 py-3 font-ui text-base font-bold text-cta-ink shadow-cta transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? 'Sending…' : 'Send message'}
            </button>

            <p
              aria-live="polite"
              className="font-ui text-sm text-muted sm:flex-1"
            >
              {status.tone === 'idle' ? (
                <span className="text-muted">
                  I read everything and reply within a couple of days.
                </span>
              ) : null}
              {status.tone === 'pending' ? <span>Sending…</span> : null}
              {status.tone === 'sent' ? (
                <span className="font-semibold text-success">
                  {status.message}
                </span>
              ) : null}
              {status.tone === 'problem' ? (
                <span className="font-semibold text-ink">
                  {status.message}
                  {status.showMailto ? (
                    <>
                      {' '}
                      <a href={`mailto:${CONTACT_INFO.email}`}>
                        Email {CONTACT_INFO.email}
                      </a>
                      .
                    </>
                  ) : null}
                </span>
              ) : null}
            </p>
          </div>
        </form>
      </div>

      {/* --- Secondary links --------------------------------------------- */}
      <div className="mx-auto mt-8 flex max-w-[640px] flex-wrap justify-center gap-3">
        <a
          href={`https://${CONTACT_INFO.linkedin}`}
          target="_blank"
          rel="noopener noreferrer"
          className={SECONDARY_LINK_CLASS}
        >
          LinkedIn
          <ArrowUpRight size={15} strokeWidth={2.5} aria-hidden="true" />
        </a>
        <a
          href={CONTACT_INFO.github}
          target="_blank"
          rel="noopener noreferrer"
          className={SECONDARY_LINK_CLASS}
        >
          GitHub
          <ArrowUpRight size={15} strokeWidth={2.5} aria-hidden="true" />
        </a>
        {/* Relative, not the deployed absolute URL — an absolute link to one
            origin breaks on every other origin, local dev included. */}
        <a
          href="/KalebK_Resume.pdf"
          download
          className={SECONDARY_LINK_CLASS}
        >
          Résumé (PDF)
          <Download size={15} strokeWidth={2.5} aria-hidden="true" />
        </a>
      </div>

      {/* --- Footer ------------------------------------------------------- */}
      <p className="mx-auto mt-10 max-w-[640px] text-center font-mono text-xs tracking-[0.06em] text-muted">
        © 2026 Kaleb Kougl · {CONTACT_INFO.location}
      </p>
    </section>
  );
}
