import { test, expect } from '@playwright/test';

test.describe('About Me 3D Scene Integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    
    // Wait for the initialization text to disappear and standard UI to show up.
    await expect(page.locator('text=portfolio.engine.kaleb.kougl').first()).toBeVisible({ timeout: 15000 });
  });

  test('Initial Load State & Mobile UI', async ({ page, isMobile }) => {
    if (isMobile) {
      // For mobile: The sheet (inspector panel) should be expanded by default.
      const bottomSheet = page.getByRole('dialog', { name: /Inspector panel|Console output/ });
      await expect(bottomSheet).toHaveAttribute('aria-modal', 'true');
      
      // Verify hamburger menu is visible
      await expect(page.getByRole('button', { name: 'Open project hierarchy' })).toBeVisible();
    } else {
      // For desktop: The tree should be visible.
      const tree = page.getByRole('tree', { name: 'Project files' });
      await expect(tree).toBeVisible();
      
      // By default "Inspector_Overview.md" is selected.
      const overviewNode = page.getByRole('treeitem', { name: 'Inspector_Overview.md', exact: true });
      await expect(overviewNode).toHaveAttribute('aria-selected', 'true');
    }
  });

  test('Navigation Interaction & Return to Overview', async ({ page, isMobile }) => {
    if (isMobile) {
      await page.getByRole('button', { name: 'Open project hierarchy' }).click();
      await expect(page.getByRole('dialog', { name: 'Project hierarchy' })).toBeVisible();
      
      // Ensure folder is expanded
      const aboutMeFolder = page.getByRole('treeitem', { name: '01_About_Me' }).first();
      const isExpanded = await aboutMeFolder.getAttribute('aria-expanded');
      if (isExpanded === 'false') {
        await aboutMeFolder.locator('button').first().click();
      }
    }

    // 2. Navigation Interaction: Click on "Profile" (Kaleb_Kougl_Summary.json)
    const profileNode = page.getByRole('treeitem', { name: 'Kaleb_Kougl_Summary.json', exact: true });
    await expect(profileNode).toBeVisible();
    
    await profileNode.locator('button').click();

    if (isMobile) {
      await expect(page.getByRole('dialog', { name: 'Project hierarchy' })).toBeHidden();
      await page.getByRole('button', { name: 'Open project hierarchy' }).click();
    }

    // Verify the state updated to selected
    await expect(profileNode).toHaveAttribute('aria-selected', 'true');

    // 3. Return to Overview: Click back to "Overview"
    const overviewNode = page.getByRole('treeitem', { name: 'Inspector_Overview.md', exact: true });
    await expect(overviewNode).toBeVisible();
    
    await overviewNode.locator('button').click();

    // Verify it reverts
    if (!isMobile) {
      await expect(overviewNode).toHaveAttribute('aria-selected', 'true');
    } else {
      await expect(page.getByRole('dialog', { name: 'Project hierarchy' })).toBeHidden();
      // On mobile we can reopen to verify it was selected, but we trust the click worked if the menu closed
      await page.getByRole('button', { name: 'Open project hierarchy' }).click();
      await expect(overviewNode).toHaveAttribute('aria-selected', 'true');
    }
  });
});
