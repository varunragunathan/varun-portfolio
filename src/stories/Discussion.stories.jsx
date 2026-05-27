import React from 'react';
import { expect, within, waitFor } from '@storybook/test';
import { AuthProvider } from '../hooks/useAuth.jsx';
import DiscussionPage from '../pages/Discussion.jsx';
import '../pages/Discussion.css';

// ── Fixture data ───────────────────────────────────────────────────

const MOCK_TOPICS = [
  {
    id: 'topic-1',
    title: 'Thought of the day',
    author: 'bold-bear-38',
    created_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
    comment_count: 4,
    pinned: true,
  },
  {
    id: 'topic-2',
    title: 'What AI tools do you use daily?',
    author: 'swift-fox-12',
    created_at: new Date(Date.now() - 24 * 3600_000).toISOString(),
    comment_count: 7,
    pinned: false,
  },
  {
    id: 'topic-3',
    title: 'Best practices for code review',
    author: 'calm-owl-55',
    created_at: new Date(Date.now() - 48 * 3600_000).toISOString(),
    comment_count: 0,
    pinned: false,
  },
];

// Wrap in AuthProvider so useAuth() doesn't throw
function withAuth(Story) {
  return (
    <AuthProvider>
      <Story />
    </AuthProvider>
  );
}

function mockFetch(topicsResponse) {
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, ...args) => {
    if (String(url).includes('/api/discussion/topics')) {
      return new Response(JSON.stringify(topicsResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return orig(url, ...args);
  };
  return () => { globalThis.fetch = orig; };
}

// ── Story config ───────────────────────────────────────────────────

export default {
  title: 'Discussion/TopicList',
  component: DiscussionPage,
  tags: ['autodocs'],
  decorators: [withAuth],
  parameters: {
    docs: {
      description: {
        component: 'Discussion topic list with infinite scroll and optional new-topic form.',
      },
    },
  },
};

// ── Stories ────────────────────────────────────────────────────────

/** Topics loaded — shows pinned badge, reply counts, and the list */
export const WithTopics = {
  beforeEach() {
    return mockFetch({ topics: MOCK_TOPICS, hasMore: false });
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => canvas.getByText('Thought of the day'), { timeout: 3000 });
    await expect(canvas.getByText('Thought of the day')).toBeInTheDocument();
    await expect(canvas.getByText('What AI tools do you use daily?')).toBeInTheDocument();
    await expect(canvas.getByText('Pinned')).toBeInTheDocument();
    await expect(canvas.getByText('4 replies')).toBeInTheDocument();
  },
};

/** Empty board — guest-friendly message */
export const EmptyBoard = {
  beforeEach() {
    return mockFetch({ topics: [], hasMore: false });
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => canvas.getByText(/No topics yet/), { timeout: 3000 });
    await expect(canvas.getByText(/No topics yet/)).toBeInTheDocument();
  },
};

/** Pagination available — shows that more topics exist beyond this page */
export const HasMore = {
  beforeEach() {
    return mockFetch({ topics: MOCK_TOPICS, hasMore: true });
  },
};

/** Loading state — spinner before data arrives */
export const Loading = {
  beforeEach() {
    const orig = globalThis.fetch;
    globalThis.fetch = async () => new Promise(() => {}); // never resolves
    return () => { globalThis.fetch = orig; };
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Loading…')).toBeInTheDocument();
  },
};
