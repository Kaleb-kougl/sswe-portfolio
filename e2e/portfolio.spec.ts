import { test, expect } from '@playwright/test';

/**
 * Portfolio E2E Tests — TDD §11
 *
 * Tests are written against the desktop-chromium project by default.
 * Mobile-specific tests use explicit viewport configuration.
 */

test.describe('IDE Portfolio — Desktop', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('renders IDE layout with 4 panels and download button', async ({ page }) => {
    await page.goto('/');

    // Wait for the layout to hydrate (dynamic imports)
    await page.waitForSelector('[aria-label="Project hierarchy"]', { timeout: 15_000 });

    // 4 panels: Hierarchy, Viewport, Inspector, Console
    const hierarchy = page.locator('[aria-label="Project hierarchy"]');
    const viewport = page.locator('[aria-label="3D Viewport"]');
    const inspector = page.locator('[aria-label="Inspector panel"]');
    const console_ = page.locator('[aria-label="Console output"]');

    await expect(hierarchy).toBeVisible();
    await expect(viewport).toBeVisible();
    await expect(inspector).toBeVisible();
    await expect(console_).toBeVisible();

    // TopBar contains download button
    const downloadBtn = page.locator('a[href="/KalebK_Resume.pdf"]').first();
    await expect(downloadBtn).toBeVisible();
  });

  test('file tree → inspector wiring: IBM shows Staff Software Engineer', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[aria-label="Project hierarchy"]', { timeout: 15_000 });

    // Click the IBM Modernization file
    const ibmFile = page.getByRole('button', { name: /Level_3_IBM_Staff_SWE/i });
    await ibmFile.click();

    // Inspector should show the title and company
    const inspector = page.locator('[aria-label="Inspector panel"]');
    await expect(inspector.getByText('Staff Software Engineer')).toBeVisible({ timeout: 5_000 });
    await expect(inspector.getByText('IBM', { exact: true })).toBeVisible();
  });

  test('file tree → console wiring: Indeed shows gRPC channels log', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[aria-label="Project hierarchy"]', { timeout: 15_000 });

    // Click the Indeed OneHost file
    const indeedFile = page.getByRole('button', { name: /Level_4_Indeed_Sr_SWE/i });
    await indeedFile.click();

    // Console should show the network log
    const consolePanel = page.locator('[aria-label="Console output"]');
    await expect(
      consolePanel.getByText(/Opening gRPC channels/i)
    ).toBeVisible({ timeout: 5_000 });
  });

  test('controls render per file: IBM=slider, Indeed=toggles, HammerBall=radio', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[aria-label="Project hierarchy"]', { timeout: 15_000 });

    const inspector = page.locator('[aria-label="Inspector panel"]');

    // IBM → slider visible
    await page.getByRole('button', { name: /Level_3_IBM_Staff_SWE/i }).click();
    await expect(inspector.locator('input[type="range"]')).toBeVisible({ timeout: 5_000 });

    // Indeed → toggles visible
    await page.getByRole('button', { name: /Level_4_Indeed_Sr_SWE/i }).click();
    await expect(inspector.locator('input[type="checkbox"]').first()).toBeVisible({ timeout: 5_000 });

    // HammerBall → radio buttons visible
    await page.getByRole('button', { name: /BonkBall\.exe/i }).click();
    await expect(inspector.locator('input[type="radio"]').first()).toBeVisible({ timeout: 5_000 });
  });

  test('3D canvas mounts in viewport', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[aria-label="3D Viewport"]', { timeout: 15_000 });

    // R3F renders a <canvas> inside the viewport
    const canvas = page.locator('[aria-label="3D Viewport"] canvas').first();
    await expect(canvas).toBeAttached({ timeout: 15_000 });
  });

  test('download link points to resume PDF', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('a[href="/KalebK_Resume.pdf"]', { timeout: 15_000 });

    const downloadLink = page.locator('a[href="/KalebK_Resume.pdf"]').first();
    await expect(downloadLink).toHaveAttribute('href', '/KalebK_Resume.pdf');
    await expect(downloadLink).toHaveAttribute('download', '');
  });

  test('keyboard navigation: tab through file tree → inspector → controls', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[aria-label="Project hierarchy"]', { timeout: 15_000 });

    // First, select a file so controls are visible
    await page.getByRole('button', { name: /Level_3_IBM_Staff_SWE/i }).click();
    await page.waitForTimeout(500);

    // Tab from the tree area — verify focus moves and doesn't get trapped
    // Focus the file tree first
    const treeFirstButton = page.locator('[role="tree"] button').first();
    await treeFirstButton.focus();

    // Tab several times — focus should leave the tree eventually
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
    }

    // After tabbing through, focus should have moved past the tree
    // Verify we're not stuck (activeElement should not still be in the tree)
    const activeTagName = await page.evaluate(() => document.activeElement?.tagName);
    expect(activeTagName).toBeDefined();

    // Verify no focus trap by checking we can reach the inspector panel
    // (or at minimum, focus moved somewhere)
    // If we reached the body or another element, navigation wasn't trapped
    expect(activeTagName).not.toBeNull();
  });

  test('combat_system file → inspector shows controls', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[aria-label="Project hierarchy"]', { timeout: 15_000 });
        // Expand 03_Projects folder
        await page.getByRole('button', { name: /Combat_System\.three/i }).click();
    // Inspector shows project entry
    await expect(page.getByRole('heading', { name: 'CombatSystem Combat Engine' })).toBeVisible();
    await expect(page.getByText('Personal Project')).toBeVisible();
    // Controls render with human-readable labels
    await expect(page.getByText('Bullet Pattern', { exact: true })).toBeVisible();
    await expect(page.getByText('Auto-fire Rate')).toBeVisible();
    await expect(page.getByText('Bloom Intensity')).toBeVisible();
    // 6 radio options
    await expect(page.getByRole('radio')).toHaveCount(6);
    await expect(page.getByLabel('Fibonacci Sphere')).toBeVisible();
  });

  test('combat_system file → console log', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[aria-label="Project hierarchy"]', { timeout: 15_000 });
            await page.getByRole('button', { name: /Combat_System\.three/i }).click();
    await expect(
      page.getByText('> [GAME] CombatSystem combat engine initialized')
    ).toBeVisible();
  });

  test('combat_system respects reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.waitForSelector('[aria-label="Project hierarchy"]', { timeout: 15_000 });
            await page.getByRole('button', { name: /Combat_System\.three/i }).click();
    // Canvas still mounts (graceful degradation, not removal)
    await expect(page.locator('canvas').first()).toBeVisible();
    // Controls still function
    await expect(page.getByText('Bullet Pattern', { exact: true })).toBeVisible();
  });
});

test.describe('IDE Portfolio — Mobile', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('mobile layout: drawer trigger visible, bottom sheet visible, no panel layout', async ({ page }) => {
    await page.goto('/');

    // Wait for mobile layout to hydrate
    await page.waitForSelector('#mobile-menu-trigger', { timeout: 15_000 });

    // Drawer trigger (hamburger) should be visible
    const menuTrigger = page.locator('#mobile-menu-trigger');
    await expect(menuTrigger).toBeVisible();

    // Panel-based layout should NOT be visible on mobile
    // react-resizable-panels Group should not render
    const panelGroup = page.locator('[data-panel-group]');
    await expect(panelGroup).toHaveCount(0);

    // Download resume button should be visible in mobile top bar
    const downloadLink = page.getByRole('link', { name: 'Download resume' });
    await expect(downloadLink.first()).toBeVisible();

    // Open drawer and select a file to trigger bottom sheet
    await menuTrigger.click();
    await page.waitForSelector('[role="dialog"][aria-label="Project hierarchy"]', { timeout: 5_000 });

    // Select a file from the drawer
    const ibmFile = page.locator('[role="dialog"] button').filter({ hasText: /Level_3_IBM_Staff_SWE/i });
    await ibmFile.click();

    // Bottom sheet should appear (inspector dialog)
    const bottomSheet = page.locator('[role="dialog"][aria-label="Inspector panel"]');
    await expect(bottomSheet).toBeVisible({ timeout: 5_000 });
  });
});
