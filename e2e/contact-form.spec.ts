import { test, expect, type Page } from '@playwright/test';

import { CONTACT_INFO } from '../src/data/resumeData';
import { RECAPTCHA_SITE_KEY } from '../src/data/site';

/**
 * The contact form and the Route Handler behind it.
 *
 * `src/app/api/contact/route.ts` has no mail provider wired up: with no
 * `CONTACT_DELIVERY_KEY` in the environment it answers `not_configured` with
 * HTTP 503. The rule the UI is held to here is that nothing ever reports
 * "sent" unless it was sent — a contact form that swallows mail is worse than
 * no contact form.
 *
 * reCAPTCHA
 * ---------
 * The form fetches a v3 token before it posts. Google is never contacted for
 * real in this suite: every test stubs `google.com/recaptcha/*` — with a fake
 * loader, or with an abort where a blocked script is the thing under test.
 * That keeps the suite offline-safe and, more importantly, deterministic; a
 * test whose result depends on whether a third party answered is not a test.
 *
 * `not_configured` is decided before the token is looked at (see
 * `deliverContactMessage`), so every assertion below holds whether or not a
 * token was obtained. The `unverified` branch — a configured deployment
 * receiving a tokenless submission — cannot be reached here, because
 * `playwright.config.ts` deliberately clears `CONTACT_DELIVERY_KEY` for the
 * test server; it is documented in `docs/contact-delivery.md`.
 */

/** Matches the loader script and the `<link rel=preload>` React emits for it. */
const RECAPTCHA_URL = /google\.com\/recaptcha\//;

const STUB_TOKEN = 'stub-recaptcha-token';

/** A stand-in for Google's api.js: same global, no network, instant token. */
const RECAPTCHA_STUB = `
window.grecaptcha = {
  ready: function (callback) { callback(); },
  execute: function () { return Promise.resolve(${JSON.stringify(STUB_TOKEN)}); }
};
`;

/** Answer Google's script locally. Returns the URLs that were requested. */
async function stubRecaptcha(page: Page): Promise<string[]> {
  const requested: string[] = [];
  await page.route(RECAPTCHA_URL, async (route) => {
    requested.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'text/javascript',
      body: RECAPTCHA_STUB,
    });
  });
  return requested;
}

const VALID = {
  reason: 'Contract',
  name: 'Dana Reviewer',
  email: 'dana@example.com',
  message: 'Saw the module federation work — can we talk?',
} as const;

const contactForm = (page: Page) => page.locator('#contact form');

async function gotoContact(page: Page) {
  await page.goto('/');
  // `src/app/loading.tsx` wraps the route in a Suspense boundary, so wait for
  // React to reveal the real page before driving the form.
  await expect(page.locator('#hero')).toBeVisible();
  await page.locator('#contact').scrollIntoViewIfNeeded();
}

async function fillValid(page: Page) {
  await page.getByRole('button', { name: VALID.reason, exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill(VALID.name);
  await page.getByLabel('Email', { exact: true }).fill(VALID.email);
  await page.getByLabel('Message', { exact: true }).fill(VALID.message);
}

/** Submit and hand back the POST /api/contact response. */
async function submitAndCaptureResponse(page: Page) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (res) =>
        res.url().includes('/api/contact') && res.request().method() === 'POST',
    ),
    page.getByRole('button', { name: 'Send message' }).click(),
  ]);
  return response;
}

test.describe('Contact form', () => {
  test.beforeEach(async ({ page }) => {
    await stubRecaptcha(page);
    await gotoContact(page);
  });

  test('the progress meter counts 0 through 4 as fields are completed', async ({
    page,
  }) => {
    const meter = page.getByRole('progressbar', {
      name: 'Contact form completion',
    });

    await expect(meter).toHaveAttribute('aria-valuemin', '0');
    await expect(meter).toHaveAttribute('aria-valuemax', '4');
    await expect(meter).toHaveAttribute('aria-valuenow', '0');
    await expect(page.getByText('0 of 4', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: VALID.reason, exact: true }).click();
    await expect(meter).toHaveAttribute('aria-valuenow', '1');

    await page.getByLabel('Name', { exact: true }).fill(VALID.name);
    await expect(meter).toHaveAttribute('aria-valuenow', '2');

    await page.getByLabel('Email', { exact: true }).fill(VALID.email);
    await expect(meter).toHaveAttribute('aria-valuenow', '3');

    await page.getByLabel('Message', { exact: true }).fill(VALID.message);
    await expect(meter).toHaveAttribute('aria-valuenow', '4');
    await expect(meter).toHaveAttribute(
      'aria-valuetext',
      '4 of 4 fields complete',
    );
    await expect(page.getByText('4 of 4', { exact: true })).toBeVisible();
  });

  test('an incomplete submit is announced and never reaches the server', async ({
    page,
  }) => {
    let posted = false;
    page.on('request', (request) => {
      if (request.url().includes('/api/contact') && request.method() === 'POST') {
        posted = true;
      }
    });

    await page.getByRole('button', { name: 'Send message' }).click();

    const alerts = contactForm(page).locator('[role="alert"]');
    await expect(alerts).toHaveCount(4);
    await expect(alerts).toHaveText([
      'Pick what this is about.',
      'Please add your name.',
      'Please add an email address so I can reply.',
      'Please add a short message.',
    ]);

    await expect(
      page.getByText('Please fix the highlighted fields and send again.'),
    ).toBeVisible();

    // Client-side validation short-circuits the network call entirely.
    expect(posted).toBe(false);
  });

  test('a malformed email is announced on the email field', async ({ page }) => {
    await fillValid(page);
    await page.getByLabel('Email', { exact: true }).fill('dana@example');
    await page.getByRole('button', { name: 'Send message' }).click();

    const email = page.getByLabel('Email', { exact: true });
    await expect(email).toHaveAttribute('aria-invalid', 'true');

    const alert = contactForm(page).locator('[role="alert"]');
    await expect(alert).toHaveCount(1);
    await expect(alert).toHaveText('That address does not look right.');
  });

  test('with no delivery key the API answers 503 and the UI says so', async ({
    page,
  }) => {
    await fillValid(page);
    const response = await submitAndCaptureResponse(page);

    expect(response.status()).toBe(503);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: 'not_configured',
    });

    await expect(
      page.getByText(/isn.t connected to a mail service yet/i),
    ).toBeVisible();
    await expect(page.getByText(/nothing was sent/i)).toBeVisible();

    // The escape hatch: the message points at the address that does work.
    await expect(
      page.locator('#contact').getByRole('link', {
        name: `Email ${CONTACT_INFO.email}`,
      }),
    ).toBeVisible();
  });

  test('a failed send never claims success', async ({ page }) => {
    await fillValid(page);
    const response = await submitAndCaptureResponse(page);
    expect(response.ok()).toBe(false);

    await expect(page.getByText(/nothing was sent/i)).toBeVisible();
    await expect(page.getByText(/message sent/i)).toHaveCount(0);
    await expect(page.getByText(/thanks|we.ll be in touch/i)).toHaveCount(0);

    // The success branch clears the form. Nothing was cleared, so it was not
    // taken: the typed values are still there for a retry.
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue(VALID.name);
    await expect(page.getByLabel('Message', { exact: true })).toHaveValue(
      VALID.message,
    );
    await expect(
      page.getByRole('button', { name: VALID.reason, exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  test('the honeypot is hidden from people and untabbable', async ({ page }) => {
    const honeypot = page.locator('input[name="company"]');

    await expect(honeypot).toHaveCount(1);
    await expect(honeypot).toHaveAttribute('tabindex', '-1');
    await expect(honeypot).toHaveAttribute('autocomplete', 'off');

    // The field itself is a normal input; it is the wrapper that hides it — a
    // 0x0 `overflow: hidden`, `aria-hidden`, `pointer-events: none` box. So the
    // wrapper is what gets asserted, not `toBeHidden()` on the input.
    const wrapper = await honeypot.evaluate((el) => {
      const host = el.closest('[aria-hidden="true"]') as HTMLElement | null;
      if (!host) return null;
      const rect = host.getBoundingClientRect();
      const style = getComputedStyle(host);
      return {
        width: rect.width,
        height: rect.height,
        overflow: style.overflow,
        pointerEvents: style.pointerEvents,
      };
    });

    expect(wrapper).not.toBeNull();
    expect(wrapper!.width).toBe(0);
    expect(wrapper!.height).toBe(0);
    expect(wrapper!.overflow).toBe('hidden');
    expect(wrapper!.pointerEvents).toBe('none');

    // Nothing inside it can be reached with the keyboard.
    await expect(honeypot).not.toBeFocused();
    const focusable = await honeypot.evaluate((el) => (el as HTMLInputElement).tabIndex);
    expect(focusable).toBe(-1);
  });

  test('a filled honeypot is rejected with 400 and is not reported as sent', async ({
    page,
  }) => {
    await fillValid(page);

    // Only automation reaches this field, so only automation can fill it.
    await page
      .locator('input[name="company"]')
      .evaluate((el) => {
        (el as HTMLInputElement).value = 'Acme Bulk Mailer';
      });

    const response = await submitAndCaptureResponse(page);

    expect(response.status()).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, code: 'rejected' });

    await expect(
      page.getByText(/flagged as automated and was not sent/i),
    ).toBeVisible();
    await expect(page.getByText(/message sent/i)).toHaveCount(0);
  });

  test('the token is posted under the name Formspree reads', async ({
    page,
  }) => {
    await fillValid(page);

    const [request] = await Promise.all([
      page.waitForRequest(
        (req) =>
          req.url().includes('/api/contact') && req.method() === 'POST',
      ),
      page.getByRole('button', { name: 'Send message' }).click(),
    ]);

    const body = request.postDataJSON();
    // Exactly this name, all the way through. Formspree looks for
    // `g-recaptcha-response` and nothing else; renaming it for one hop and
    // translating it back is an invitation to get it wrong later.
    expect(body['g-recaptcha-response']).toBe(STUB_TOKEN);
  });

  test('a blocked reCAPTCHA script resolves honestly instead of spinning', async ({
    page,
  }) => {
    // Registered after the stub, so it wins: this is a privacy extension, a
    // corporate proxy, or simply being offline.
    await page.route(RECAPTCHA_URL, (route) => route.abort());

    await fillValid(page);

    const [request, response] = await Promise.all([
      page.waitForRequest(
        (req) => req.url().includes('/api/contact') && req.method() === 'POST',
        { timeout: 20_000 },
      ),
      page.waitForResponse(
        (res) =>
          res.url().includes('/api/contact') && res.request().method() === 'POST',
        { timeout: 20_000 },
      ),
      page.getByRole('button', { name: 'Send message' }).click(),
    ]);

    // It gives up on the token and posts anyway: the server is the only thing
    // that knows whether anything was delivered, so it owns the outcome.
    expect(request.postDataJSON()['g-recaptcha-response']).toBe('');

    // Here that outcome is `not_configured` — delivery is unconfigured in this
    // suite, and that is decided before the token is looked at. With a key set
    // the same submission would come back `unverified`. Either way it is a
    // finished answer with the working address in it, not a spinner.
    expect(response.ok()).toBe(false);

    await expect(page.getByText(/nothing was sent/i)).toBeVisible();
    await expect(
      page.locator('#contact').getByRole('link', {
        name: `Email ${CONTACT_INFO.email}`,
      }),
    ).toBeVisible();

    // Not stuck pending: the button is live again and nothing claims success.
    await expect(
      page.getByRole('button', { name: 'Send message' }),
    ).toBeEnabled();
    await expect(page.getByText(/message sent/i)).toHaveCount(0);
  });

  test('the reCAPTCHA notice and the no-JS warning are both present', async ({
    page,
  }) => {
    // Google's terms allow hiding the badge only alongside this notice.
    const notice = page.locator('#contact').getByText(/Protected by reCAPTCHA/i);
    await expect(notice).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Privacy Policy' }),
    ).toHaveAttribute('href', 'https://policies.google.com/privacy');
    await expect(
      page.getByRole('link', { name: 'Terms of Service' }),
    ).toHaveAttribute('href', 'https://policies.google.com/terms');

    // The <noscript> warning ships in the HTML (inert while scripting is on),
    // and the old radio fallback it replaced is gone — a token cannot exist
    // without JavaScript, so collecting four fields first would only waste the
    // visitor's time.
    const noscript = await contactForm(page)
      .locator('noscript')
      .innerHTML();
    expect(noscript).toContain('This form needs JavaScript');
    expect(noscript).toContain(CONTACT_INFO.email);
    expect(noscript).not.toContain('type="radio"');
  });
});

test.describe('reCAPTCHA script loading', () => {
  test('Google is not contacted until the form is touched', async ({ page }) => {
    const requested = await stubRecaptcha(page);

    await gotoContact(page);
    // `load`, not `networkidle`: the suite runs against `next dev`, whose HMR
    // traffic never goes quiet. A beat afterwards catches anything deferred to
    // an idle callback.
    await page.waitForLoadState('load');
    await page.waitForTimeout(1_000);

    // Measured, not asserted by hand-waving: the page renders, the hero paints,
    // the contact section is on screen, and Google has still heard nothing.
    expect(requested).toEqual([]);

    await page.getByLabel('Name', { exact: true }).click();

    await expect
      .poll(() => requested.length, { timeout: 10_000 })
      .toBeGreaterThan(0);
    expect(requested[0]).toContain('/recaptcha/api.js');
    expect(requested[0]).toContain(`render=${RECAPTCHA_SITE_KEY}`);

    // Injected once, however much the form is used afterwards — `next/script`
    // dedupes on `id || src` in a module-level cache, so no amount of
    // re-rendering adds a second copy.
    await page.getByLabel('Email', { exact: true }).click();
    await page.getByLabel('Message', { exact: true }).fill('Hello');
    await page.waitForTimeout(500);
    expect(new Set(requested).size).toBe(1);
  });
});

test.describe('Contact Route Handler', () => {
  test('rejects a filled honeypot before it validates anything', async ({
    request,
  }) => {
    const response = await request.post('/api/contact', {
      headers: { Accept: 'application/json' },
      data: { ...VALID, company: 'Acme Bulk Mailer' },
    });

    expect(response.status()).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, code: 'rejected' });
  });

  test('reports missing fields with 400 and per-field errors', async ({
    request,
  }) => {
    const response = await request.post('/api/contact', {
      headers: { Accept: 'application/json' },
      data: { reason: '', name: '', email: 'nope', message: '' },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body).toMatchObject({ ok: false, code: 'invalid' });
    expect(Object.keys(body.fieldErrors)).toEqual(
      expect.arrayContaining(['reason', 'name', 'email', 'message']),
    );
  });

  test('an unexpected extra field does not upset parsing', async ({
    request,
  }) => {
    const response = await request.post('/api/contact', {
      headers: { Accept: 'application/json' },
      data: { ...VALID, 'g-recaptcha-response': 'a-token' },
    });

    // Delivery is unconfigured here, so `not_configured` is the answer either
    // way — the point is that the token field is read, not choked on.
    expect(response.status()).toBe(503);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: 'not_configured',
    });
  });

  test('a complete submission is 503 not_configured, never 200', async ({
    request,
  }) => {
    const response = await request.post('/api/contact', {
      headers: { Accept: 'application/json' },
      data: VALID,
    });

    expect(response.status()).toBe(503);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe('not_configured');
    expect(body.message).toContain(CONTACT_INFO.email);
  });
});
