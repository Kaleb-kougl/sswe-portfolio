import { test, expect } from '@playwright/test';

import { MCP_URL } from '../src/data/site';

/**
 * The agent-facing surfaces: `/llms.txt`, `/llms-full.txt`, and the "Use with
 * your AI" block in #contact that advertises the MCP server. Their content is
 * unit-tested in `__tests__/llms.test.ts`; this checks that the routes serve it
 * as text and that the block reaches the page.
 */

test.describe('llms.txt routes', () => {
  test('/llms.txt is plain text with the llmstxt.org sections', async ({ request }) => {
    const response = await request.get('/llms.txt');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('text/plain; charset=utf-8');

    const body = await response.text();
    expect(body).toMatch(/^# Kaleb Kougl\n\n> /);
    for (const heading of ['## Projects', '## Experience', '## Contact', '## Optional']) {
      expect(body).toContain(`\n${heading}\n`);
    }
    expect(body).toContain(MCP_URL);
    expect(body).toContain('/llms-full.txt)');
  });

  test('/llms-full.txt is plain text with profile, evidence and skills', async ({
    request,
  }) => {
    const response = await request.get('/llms-full.txt');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('text/plain; charset=utf-8');

    const body = await response.text();
    expect(body).toMatch(/^# Kaleb Kougl\n\n> /);
    for (const heading of ['## Profile', '## Evidence', '## Skills']) {
      expect(body).toContain(`\n${heading}\n`);
    }
    expect(body).toMatch(/^#### [a-z0-9-]+\.[a-z0-9-]+$/m);
  });
});

test.describe('"Use with your AI" block', () => {
  test('is visible in #contact and carries the MCP URL and setup lines', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('#hero')).toBeVisible();

    const block = page
      .locator('#contact')
      .getByRole('region', { name: 'Use with your AI' });
    await block.scrollIntoViewIfNeeded();
    await expect(block).toBeVisible();
    await expect(
      block.getByRole('heading', { level: 3, name: 'Use with your AI' }),
    ).toBeVisible();

    await expect(block.getByTestId('mcp-url')).toHaveText(MCP_URL);
    await expect(block).toContainText(`claude mcp add --transport http kaleb ${MCP_URL}`);
    await expect(block).toContainText('Add custom connector');
    await expect(block).toContainText('.cursor/mcp.json');
    await expect(block.getByRole('link', { name: '/llms.txt' })).toHaveAttribute(
      'href',
      '/llms.txt',
    );
    await expect(block.getByRole('button', { name: 'Copy server URL' })).toBeVisible();
  });

  test('the copy button puts the URL on the clipboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/');
    await expect(page.locator('#hero')).toBeVisible();

    // Matched on the stable half of the name: it reads "Copied server URL"
    // once clicked.
    const button = page.locator('#contact').getByRole('button', { name: /server URL$/ });
    await button.scrollIntoViewIfNeeded();

    // The button is server-rendered, so it exists before React hydrates it and
    // a click that early does nothing. Retry until one lands.
    await expect(async () => {
      await button.click();
      await expect(button).toHaveText(/^Copied/, { timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(MCP_URL);
  });

  test('never widens the page on a phone', async ({ page, viewport }) => {
    test.skip((viewport?.width ?? 0) >= 900, 'Only the narrow layout can overflow');
    await page.goto('/');
    const block = page.locator('#contact').getByRole('region', { name: 'Use with your AI' });
    await block.scrollIntoViewIfNeeded();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
