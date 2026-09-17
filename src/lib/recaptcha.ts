/**
 * reCAPTCHA v3, the small amount of it this site needs.
 *
 * Formspree's "custom integration" path does not host a widget for you: the
 * site owner registers their own key pair in the form settings, embeds
 * reCAPTCHA themselves, and Formspree verifies the posted token against their
 * secret. The field it looks for is named exactly `g-recaptcha-response`, so
 * that name is used on both hops (browser → route handler → Formspree) rather
 * than renamed halfway.
 *
 * Everything here is written so that a blocked, slow or missing Google script
 * ends in a *decision* rather than a spinner. `requestRecaptchaToken` never
 * throws and never hangs: it resolves with a token, or with `null` after at
 * most `RECAPTCHA_LOAD_TIMEOUT_MS + RECAPTCHA_EXECUTE_TIMEOUT_MS`. The caller
 * then submits anyway and lets the server own the outcome, because a client
 * that quietly gives up is exactly how a contact form starts swallowing mail.
 */

/** The field name Formspree reads the token from. Do not rename. */
export const RECAPTCHA_FIELD = 'g-recaptcha-response';

/** v3 "action", shown in Google's admin console score breakdown. */
export const RECAPTCHA_ACTION = 'contact';

/** Waiting for `window.grecaptcha` to appear after the script is injected. */
export const RECAPTCHA_LOAD_TIMEOUT_MS = 5_000;

/** Waiting for `ready()` + `execute()`, which makes its own network call. */
export const RECAPTCHA_EXECUTE_TIMEOUT_MS = 5_000;

/** How often to look for the global while the script is in flight. */
const POLL_INTERVAL_MS = 50;

/**
 * The loader URL. `render=<siteKey>` is the v3 form: it fetches the challenge
 * machinery for that key so `grecaptcha.execute` can be called on demand,
 * instead of rendering a checkbox widget.
 */
export function recaptchaScriptSrc(siteKey: string): string {
  return `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
}

type Grecaptcha = {
  ready: (callback: () => void) => void;
  execute: (siteKey: string, options: { action: string }) => Promise<string>;
};

declare global {
  interface Window {
    grecaptcha?: Grecaptcha;
  }
}

/** Reject if `work` has not settled within `ms`. Clears its own timer. */
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error(`timed out after ${ms}ms`)),
      ms,
    );
    work.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/**
 * Poll for the global the loader installs. There is no load event to await
 * here — the component that injects the script may have mounted it seconds
 * ago, or the request may be dying quietly in an ad blocker — so the deadline
 * is what ends this, and the poll stops with it rather than running forever.
 */
function waitForGrecaptcha(timeoutMs: number): Promise<Grecaptcha> {
  return new Promise<Grecaptcha>((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;

    const poll = () => {
      const api = window.grecaptcha;
      if (api && typeof api.execute === 'function' && typeof api.ready === 'function') {
        resolve(api);
        return;
      }
      if (Date.now() >= deadline) {
        reject(new Error('reCAPTCHA script did not load'));
        return;
      }
      window.setTimeout(poll, POLL_INTERVAL_MS);
    };

    poll();
  });
}

/**
 * Fetch a fresh token for one submit attempt.
 *
 * Tokens are single-use and expire after about two minutes, so this is called
 * per attempt and the result is never cached.
 *
 * Returns `null` — never throws — when the script is blocked, the API never
 * becomes ready, `execute` hangs or Google hands back nothing usable.
 */
export async function requestRecaptchaToken(
  siteKey: string,
): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  try {
    const api = await waitForGrecaptcha(RECAPTCHA_LOAD_TIMEOUT_MS);

    const token = await withTimeout(
      new Promise<void>((resolve) => api.ready(resolve)).then(() =>
        api.execute(siteKey, { action: RECAPTCHA_ACTION }),
      ),
      RECAPTCHA_EXECUTE_TIMEOUT_MS,
    );

    return typeof token === 'string' && token.length > 0 ? token : null;
  } catch {
    // Deliberately quiet: the caller turns this into a visible, honest
    // message. There is nothing the visitor can do about a blocked script.
    return null;
  }
}
