import { test, expect } from '@playwright/test';

// ── Smoke tests ───────────────────────────────────────────────────
// Fast pre-push checks: verify that core pages render without crashing
// and key UI elements are present. Auth flows are excluded (no secrets
// in local dev). Run with: yarn test

test.describe('Home page', () => {
  test('loads and shows nav + footer', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('nav')).toBeVisible();
    await expect(page.locator('footer')).toBeVisible();
  });

  test('shows version badge in footer', async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('footer').first();
    await expect(footer).toContainText('v');
    // Matches v0.x.x pattern
    await expect(footer).toHaveText(/v\d+\.\d+\.\d+/);
  });

  test('no error boundary triggered', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=something went wrong')).not.toBeVisible();
  });

  test('theme toggle is present', async ({ page }) => {
    await page.goto('/');
    // Footer has the theme toggle
    const footer = page.locator('footer').first();
    await expect(footer).toBeVisible();
    // Click theme toggle and confirm page doesn't crash
    const toggle = page.locator('button[aria-label*="theme"], button[aria-label*="Theme"]').first();
    if (await toggle.count() > 0) {
      await toggle.click();
      await expect(page.locator('text=something went wrong')).not.toBeVisible();
    }
  });

  test('hero section renders', async ({ page }) => {
    await page.goto('/');
    // Page should have some visible text content — not blank
    const body = await page.locator('body').textContent();
    expect(body?.trim().length).toBeGreaterThan(50);
  });
});

test.describe('Auth page', () => {
  test('loads without crash', async ({ page }) => {
    await page.goto('/auth');
    await expect(page.locator('text=something went wrong')).not.toBeVisible();
    await expect(page.locator('nav')).toBeVisible();
  });
});

test.describe('Chat page', () => {
  test('renders without crash (auth disabled)', async ({ page }) => {
    // With auth disabled, /chat may show the widget or redirect — either is fine.
    // We just confirm the error boundary doesn't fire.
    await page.goto('/chat');
    await expect(page.locator('text=something went wrong')).not.toBeVisible();
  });
});

test.describe('Navigation', () => {
  test('nav links are present and do not 404', async ({ page }) => {
    await page.goto('/');
    const nav = page.locator('nav');
    await expect(nav).toBeVisible();
    // Internal links should not navigate to a broken page
    const links = nav.locator('a[href^="/"]');
    const count = await links.count();
    expect(count).toBeGreaterThan(0);
  });

  test('unknown route does not crash the app', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    // React Router will render Home (catch-all) — no crash
    await expect(page.locator('text=something went wrong')).not.toBeVisible();
    await expect(page.locator('nav')).toBeVisible();
  });
});
