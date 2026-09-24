'use client';

import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import Script from 'next/script';
import { AlertCircle, ArrowUpRight, Download } from 'lucide-react';
import { CONTACT_INFO } from '@/data/contact';
import { RECAPTCHA_SITE_KEY } from '@/data/site';
import {
  RECAPTCHA_FIELD,
  recaptchaScriptSrc,
  requestRecaptchaToken,
} from '@/lib/recaptcha';

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

   reCAPTCHA v3 lives here too, and it is the page's only third-party script.
   `next/script` has four strategies (01-app/03-api-reference/02-components/
   script.md) and none of them is "on interaction", so the interaction gate is
   the render itself: the <Script> is not in the tree until someone touches a
   field, at which point `afterInteractive` injects it once. `loadScript`
   dedupes on `id || src` through a module-level cache, so re-renders and
   re-mounts cannot inject it twice. Until then the page loads zero
   third-party bytes — the hero stays clean.
   --------------------------------------------------------------------------- */

const REASONS = [
  'Full-time role',
  'Contract',
  'Open source',
  'Just saying hi',
] as const;

type Reason = (typeof REASONS)[number];

/** The message a visitor from /fit starts with; they can edit it. */
const FIT_MESSAGE =
  "Hi Kaleb, I checked a role against your work with the fit checker and would like to talk about it.";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MESSAGE_LIMIT = 4000;

type FieldName = 'reason' | 'name' | 'email' | 'message';
type FieldErrors = Partial<Record<FieldName, string>>;

type ContactResult = {
  ok: boolean;
  code:
    | 'sent'
    | 'invalid'
    | 'rejected'
    /** No reCAPTCHA token reached the server, so nothing was forwarded. */
    | 'unverified'
    | 'not_configured'
    | 'delivery_failed';
  message: string;
  fieldErrors?: FieldErrors;
};

type Status =
  | { tone: 'idle' }
  | { tone: 'pending' }
  | { tone: 'sent'; message: string }
  | { tone: 'problem'; message: string; showMailto: boolean };

/** Inputs use `.field__control` (styles/blocks/field.css). A `control` border
 *  is only 1.51:1 on paper, so it is always paired with a `paper` fill +
 *  hairline shadow, never left to carry the control on its own. 16px text
 *  keeps iOS Safari from zooming on focus. */
const fieldClass = (invalid: boolean, extra = '') =>
  `field__control field__control--md${extra ? ` ${extra}` : ''}${invalid ? ' is-invalid' : ''}`;

/** White pill with a `control` border + shadow — the quiet secondary action. */
const SECONDARY_LINK_CLASS = 'button button--pill button--secondary button--md gap-2';

/**
 * The no-JS notice.
 *
 * There used to be a native radio group here standing in for the reason pills,
 * so that a scripting-off browser could still post something the handler could
 * read. reCAPTCHA ended that: a v3 token can only be produced by JavaScript,
 * the Formspree form requires one, and a submission without it is rejected. A
 * fallback that carefully collects four fields and then cannot deliver them is
 * worse than no fallback, so the radios are gone and this says so up front,
 * next to the submit button, before anyone types a word.
 *
 * (The native POST still works and still gets an honest HTML answer from the
 * handler — see `route.ts`. This is about not wasting the visitor's time.)
 *
 * Written through `dangerouslySetInnerHTML` because React serialises
 * <noscript> children on the server but the browser parses them as text on the
 * client, which would otherwise produce a hydration mismatch.
 */
const NOSCRIPT_NOTICE = `
<div class="mt-4 rounded-sm border border-control bg-panel p-3 shadow-hairline">
  <p class="font-ui text-sm font-semibold text-ink">This form needs JavaScript.</p>
  <p class="mt-1 font-ui text-sm text-body">
    It has to run a spam check before it can send, and that check is JavaScript.
    With scripting off, please email
    <a href="mailto:${CONTACT_INFO.email}">${CONTACT_INFO.email}</a> instead —
    that always works.
  </p>
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

export function ContactSection({
  children,
}: {
  /**
   * Server-rendered content placed under the secondary links. page.tsx passes
   * `<UseWithYourAi />` here so its static markup ships as HTML rather than as
   * part of this Client Component's JS.
   */
  children?: ReactNode;
}) {
  const uid = useId();
  const formRef = useRef<HTMLFormElement>(null);

  const [reason, setReason] = useState<Reason | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<Status>({ tone: 'idle' });

  // Arriving from /fit's "Email me about this role" (`/?reason=role#contact`):
  // preselect the reason and start the message. Read after hydration so the
  // page stays static. Nothing from the job description is in the URL.
  // One render after hydration, once per visit: the cascade the lint rule
  // guards against can't happen, and a lazy initial state would mismatch the
  // prerendered HTML.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('reason') !== 'role') return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReason('Full-time role');
    setMessage((current) => current || FIT_MESSAGE);
  }, []);

  /** Flips on the first focus/keystroke anywhere in the form, and never back.
   *  Rendering the <Script> is what starts the download, so this is the whole
   *  "load on first interaction" mechanism. Repeat calls are no-ops — React
   *  bails out of a re-render when the state is identical. */
  const [recaptchaArmed, setRecaptchaArmed] = useState(false);
  const armRecaptcha = useCallback(() => setRecaptchaArmed(true), []);

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

      // Safari does not focus a <button> on click, so a visitor who filled the
      // form with a password manager could reach here having never fired a
      // focus or input event. Arm it now; the script has a few seconds to turn
      // up while the token is awaited below.
      setRecaptchaArmed(true);

      // The honeypot lives in the DOM only; read it straight off the form.
      const honeypot = formRef.current
        ? String(new FormData(formRef.current).get('company') ?? '')
        : '';

      // A fresh token per attempt: v3 tokens are single-use and expire after
      // about two minutes, so none is ever cached. This resolves to `null`
      // rather than throwing or hanging when Google is blocked or slow — and
      // then the request goes out anyway, tokenless, so that the server (which
      // is the only thing that knows whether anything was delivered) decides
      // what the visitor is told. See `route.ts`' `unverified` branch.
      const recaptchaToken = await requestRecaptchaToken(RECAPTCHA_SITE_KEY);

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
            // Formspree's name for it, kept end to end rather than renamed
            // for one hop and translated back.
            [RECAPTCHA_FIELD]: recaptchaToken ?? '',
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
          className="section__heading mt-4 text-ink md:text-[56px]"
        >
          Let&rsquo;s build the next platform.
        </h2>
        <p className="mt-4 font-ui text-base text-body">
          Four quick fields, or email me directly at{' '}
          <a href={`mailto:${CONTACT_INFO.email}`}>{CONTACT_INFO.email}</a>
        </p>
      </div>

      {/* --- Card --------------------------------------------------------- */}
      <div className="card card--raised mx-auto mt-10 w-full max-w-[640px] p-5 sm:p-8">
        {/* Progress meter ------------------------------------------------- */}
        <div className="mb-6">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <span className="label-mono">
              Progress
            </span>
            <span className="contact-progress__count">
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
            className="contact-progress"
          >
            <div
              className="contact-progress__bar"
              style={{ width: `${(completed / 4) * 100}%` }}
            />
          </div>
        </div>

        <form
          ref={formRef}
          action="/api/contact"
          method="post"
          onSubmit={handleSubmit}
          // The interaction gate. `onFocusCapture` (React's name for
          // `focusin`) covers tab, click and tap into any control; the pills
          // are buttons, so a keystroke-only signal would miss them.
          // `onInputCapture` covers autofill, which can populate fields
          // without a focus event.
          onFocusCapture={armRecaptcha}
          onInputCapture={armRecaptcha}
          noValidate
        >
          {/* Nothing is requested from Google until this renders. */}
          {recaptchaArmed ? (
            <Script
              id="recaptcha-v3"
              src={recaptchaScriptSrc(RECAPTCHA_SITE_KEY)}
              strategy="afterInteractive"
            />
          ) : null}
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
              className="field__label mb-3"
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
                    // Selected/unselected styling keys off aria-pressed
                    // (styles/blocks/contact.css).
                    className="contact-reason"
                  >
                    {option}
                  </button>
                );
              })}
            </div>

            {/* Carries the pill choice on a native (pre-hydration) submit. */}
            <input type="hidden" name="reason" value={reason ?? ''} />

            {errors.reason ? (
              <p
                id={ids.reasonError}
                role="alert"
                className="field__error mt-2"
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
                className="field__label mb-1.5 block"
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
                className={fieldClass(Boolean(errors.name))}
              />
              {errors.name ? (
                <p
                  id={ids.nameError}
                  role="alert"
                  className="field__error mt-1.5"
                >
                  <AlertCircle size={15} strokeWidth={2.5} aria-hidden="true" />
                  {errors.name}
                </p>
              ) : null}
            </div>

            <div>
              <label
                htmlFor={ids.email}
                className="field__label mb-1.5 block"
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
                className={fieldClass(Boolean(errors.email))}
              />
              {errors.email ? (
                <p
                  id={ids.emailError}
                  role="alert"
                  className="field__error mt-1.5"
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
              className="field__label mb-1.5 block"
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
              className={fieldClass(Boolean(errors.message), 'resize-y')}
            />
            {errors.message ? (
              <p
                id={ids.messageError}
                role="alert"
                className="field__error mt-1.5"
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
              className="button button--pill button--primary button--fade button--lg button--disableable shrink-0"
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

          <noscript dangerouslySetInnerHTML={{ __html: NOSCRIPT_NOTICE }} />

          {/* Google's terms allow hiding the reCAPTCHA badge only if this
              notice is visible near the form. `globals.css` hides the badge;
              this is the other half of that bargain, and it is not optional.
              The links are unclassed so they pick up the page's own link
              styling from `a:not([class])`. */}
          <p className="mt-4 font-ui text-xs leading-relaxed text-muted">
            Protected by reCAPTCHA. Google&rsquo;s{' '}
            <a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
            >
              Privacy Policy
            </a>{' '}
            and{' '}
            <a
              href="https://policies.google.com/terms"
              target="_blank"
              rel="noopener noreferrer"
            >
              Terms of Service
            </a>{' '}
            apply.
          </p>
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

      {children}

      {/* --- Footer ------------------------------------------------------- */}
      <p className="mx-auto mt-10 max-w-[640px] text-center font-mono text-xs tracking-[0.06em] text-muted">
        © 2026 Kaleb Kougl · {CONTACT_INFO.location}
      </p>
    </section>
  );
}
