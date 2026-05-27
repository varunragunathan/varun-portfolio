import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// ── Discussion E2E tests ───────────────────────────────────────────
// These tests mock the discussion API so they never need a live D1
// database. Auth is disabled (VITE_ENABLE_AUTH=false in test config).

const MOCK_TOPICS = [
  {
    id: 'topic-abc',
    title: 'Thought of the day',
    author: 'bold-bear-38',
    created_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
    comment_count: 3,
    pinned: true,
  },
  {
    id: 'topic-xyz',
    title: 'What AI tools do you use daily?',
    author: 'swift-fox-12',
    created_at: new Date(Date.now() - 24 * 3600_000).toISOString(),
    comment_count: 0,
    pinned: false,
  },
];

const MOCK_THREAD = {
  topic: {
    id: 'topic-abc',
    title: 'Thought of the day',
    author: 'bold-bear-38',
    created_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
    body: '"Take up one idea. Make it your life." — Swami Vivekananda',
    comment_count: 1,
    pinned: true,
  },
  comments: [
    {
      id: 'c1',
      parent_id: null,
      depth: 0,
      author: 'swift-fox-12',
      author_id: 'user-2',
      body: 'Really resonates with me.',
      created_at: new Date(Date.now() - 1 * 3600_000).toISOString(),
      deleted: false,
    },
  ],
};

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

async function mockDiscussionRoutes(page) {
  await page.route('**/api/discussion/topics?**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ topics: MOCK_TOPICS, hasMore: false }),
    })
  );
  await page.route('**/api/discussion/topics', route => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ topics: MOCK_TOPICS, hasMore: false }),
      });
    } else {
      route.continue();
    }
  });
  await page.route('**/api/discussion/topics/topic-abc', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_THREAD),
    })
  );
}

function getCritical(violations) {
  return violations.filter(v => v.impact === 'critical' || v.impact === 'serious');
}

// ─────────────────────────────────────────────────────────────────
// Topic list page
// ─────────────────────────────────────────────────────────────────

test.describe('Discussion list page', () => {
  test('loads without crash', async ({ page }) => {
    await mockDiscussionRoutes(page);
    await page.goto('/discussion');
    await expect(page.locator('text=something went wrong')).not.toBeVisible();
    await expect(page.locator('nav')).toBeVisible();
  });

  test('renders topic list', async ({ page }) => {
    await mockDiscussionRoutes(page);
    await page.goto('/discussion');
    await expect(page.locator('text=Thought of the day')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=What AI tools do you use daily?')).toBeVisible();
  });

  test('shows pinned badge on pinned topic', async ({ page }) => {
    await mockDiscussionRoutes(page);
    await page.goto('/discussion');
    await expect(page.locator('text=Pinned').first()).toBeVisible({ timeout: 5000 });
  });

  test('shows reply count on topics with comments', async ({ page }) => {
    await mockDiscussionRoutes(page);
    await page.goto('/discussion');
    await expect(page.locator('text=3 replies')).toBeVisible({ timeout: 5000 });
  });

  test('shows sign-in nudge for unauthenticated users', async ({ page }) => {
    await mockDiscussionRoutes(page);
    await page.goto('/discussion');
    await expect(page.locator('text=Sign in').first()).toBeVisible({ timeout: 5000 });
  });

  test('empty board message when no topics exist', async ({ page }) => {
    await page.route('**/api/discussion/topics**', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ topics: [], hasMore: false }),
      })
    );
    await page.goto('/discussion');
    await expect(page.locator('text=No topics yet')).toBeVisible({ timeout: 5000 });
  });

  test('page heading is visible', async ({ page }) => {
    await mockDiscussionRoutes(page);
    await page.goto('/discussion');
    await expect(page.locator('h1:has-text("Discussion")')).toBeVisible({ timeout: 5000 });
  });
});

// ─────────────────────────────────────────────────────────────────
// Thread page
// ─────────────────────────────────────────────────────────────────

test.describe('Discussion thread page', () => {
  test('loads without crash', async ({ page }) => {
    await mockDiscussionRoutes(page);
    await page.goto('/discussion/topic-abc');
    await expect(page.locator('text=something went wrong')).not.toBeVisible();
  });

  test('renders topic title and body', async ({ page }) => {
    await mockDiscussionRoutes(page);
    await page.goto('/discussion/topic-abc');
    await expect(page.locator('h1:has-text("Thought of the day")')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Swami Vivekananda')).toBeVisible();
  });

  test('renders comment with avatar initials', async ({ page }) => {
    await mockDiscussionRoutes(page);
    await page.goto('/discussion/topic-abc');
    // Avatar: "swift-fox-12" → initials "SF"
    await expect(page.locator('text=SF').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Really resonates with me.')).toBeVisible();
  });

  test('shows author name and time-ago on comment', async ({ page }) => {
    await mockDiscussionRoutes(page);
    await page.goto('/discussion/topic-abc');
    await expect(page.locator('text=swift-fox-12')).toBeVisible({ timeout: 5000 });
    // Time-ago format
    await expect(page.locator('text=/ago|just now/')).toBeVisible();
  });

  test('back link navigates to discussion list', async ({ page }) => {
    await mockDiscussionRoutes(page);
    await page.goto('/discussion/topic-abc');
    await expect(page.locator('text=← Discussion')).toBeVisible({ timeout: 5000 });
    await page.click('text=← Discussion');
    await expect(page).toHaveURL('/discussion');
  });

  test('renders 404 state for unknown topic', async ({ page }) => {
    await page.route('**/api/discussion/topics/bad-id', route =>
      route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Not found' }) })
    );
    await page.goto('/discussion/bad-id');
    await expect(page.locator('text=Topic not found')).toBeVisible({ timeout: 5000 });
  });

  test('clicking a topic card navigates to thread', async ({ page }) => {
    await mockDiscussionRoutes(page);
    await page.goto('/discussion');
    await page.locator('text=Thought of the day').first().click();
    await expect(page).toHaveURL('/discussion/topic-abc');
    await expect(page.locator('h1:has-text("Thought of the day")')).toBeVisible({ timeout: 5000 });
  });
});

// ─────────────────────────────────────────────────────────────────
// Accessibility
// ─────────────────────────────────────────────────────────────────

test.describe('Discussion accessibility (axe)', () => {
  test('topic list has no critical a11y violations', async ({ page }) => {
    await mockDiscussionRoutes(page);
    await page.goto('/discussion');
    await page.waitForSelector('text=Thought of the day', { timeout: 5000 });
    await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    const critical = getCritical(results.violations);
    if (results.violations.length > critical.length) {
      console.log('Non-critical a11y violations:',
        results.violations
          .filter(v => v.impact !== 'critical' && v.impact !== 'serious')
          .map(v => `[${v.impact}] ${v.id}: ${v.description}`)
      );
    }
    expect(critical).toEqual([]);
  });

  test('thread page has no critical a11y violations', async ({ page }) => {
    await mockDiscussionRoutes(page);
    await page.goto('/discussion/topic-abc');
    await page.waitForSelector('h1:has-text("Thought of the day")', { timeout: 5000 });
    await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    const critical = getCritical(results.violations);
    if (results.violations.length > critical.length) {
      console.log('Non-critical a11y violations:',
        results.violations
          .filter(v => v.impact !== 'critical' && v.impact !== 'serious')
          .map(v => `[${v.impact}] ${v.id}: ${v.description}`)
      );
    }
    expect(critical).toEqual([]);
  });
});
