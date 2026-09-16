import { test, expect, type Page } from '@playwright/test';

import { CONTACT_INFO } from '../src/data/resumeData';

/**
 * The contact form and the Route Handler behind it.
 *
 * `src/app/api/contact/route.ts` has no mail provider wired up: with no
 * `CONTACT_DELIVERY_KEY` in the environment it answers `not_configured` with
 * HTTP 503. The rule the UI is held to here is that nothing ever reports
 * "sent" unless it was sent — a contact form that swallows mail is worse than
 * no contact form.
 */

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
