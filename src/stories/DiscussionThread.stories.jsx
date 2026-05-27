import React from 'react';
import { expect, within, waitFor } from '@storybook/test';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../hooks/useAuth.jsx';
import DiscussionThread from '../pages/DiscussionThread.jsx';
import '../pages/Discussion.css';

// ── Fixture data ───────────────────────────────────────────────────

const TOPIC = {
  id: 'topic-1',
  title: 'Thought of the day',
  author: 'bold-bear-38',
  created_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
  body: '"Take up one idea. Make it your life." — Swami Vivekananda',
  comment_count: 2,
  pinned: false,
};

const COMMENTS = [
  {
    id: 'c1',
    parent_id: null,
    depth: 0,
    author: 'swift-fox-12',
    author_id: 'user-2',
    body: 'Really resonates. Focused work beats scattered effort every time.',
    created_at: new Date(Date.now() - 1 * 3600_000).toISOString(),
    deleted: false,
  },
  {
    id: 'c2',
    parent_id: 'c1',
    depth: 1,
    author: 'calm-owl-55',
    author_id: 'user-3',
    body: 'Agreed — especially in the era of constant notifications.',
    created_at: new Date(Date.now() - 30 * 60_000).toISOString(),
    deleted: false,
  },
];

const COMMENTS_WITH_DELETED = [
  ...COMMENTS,
  {
    id: 'c3',
    parent_id: null,
    depth: 0,
    author: '[deleted]',
    author_id: 'user-4',
    body: null,
    created_at: new Date(Date.now() - 4 * 3600_000).toISOString(),
    deleted: true,
  },
];

// ── Decorator: MemoryRouter seeded to the thread route ─────────────

function withThread(topicData, Story) {
  return (
    <AuthProvider>
      <MemoryRouter initialEntries={['/discussion/topic-1']}>
        <Routes>
          <Route path="/discussion/:id" element={<Story />} />
          <Route path="/discussion" element={<div>Discussion list</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

function mockThreadFetch(topic, comments) {
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, ...args) => {
    if (String(url).includes('/api/discussion/topics/topic-1')) {
      return new Response(JSON.stringify({ topic, comments }), {
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
  title: 'Discussion/Thread',
  component: DiscussionThread,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Thread view with recursive comment tree, avatars, and reply forms.',
      },
    },
  },
};

// ── Stories ────────────────────────────────────────────────────────

/** Full thread with nested reply */
export const WithComments = {
  decorators: [(Story) => withThread(TOPIC, Story)],
  beforeEach() {
    return mockThreadFetch(TOPIC, COMMENTS);
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => canvas.getByText('Thought of the day'), { timeout: 3000 });
    await expect(canvas.getByText('Thought of the day')).toBeInTheDocument();
    await expect(canvas.getByText('swift-fox-12')).toBeInTheDocument();
    await expect(canvas.getByText('calm-owl-55')).toBeInTheDocument();
    await expect(canvas.getByText('Really resonates. Focused work beats scattered effort every time.')).toBeInTheDocument();
    // Avatar initials rendered
    await expect(canvas.getByText('SF')).toBeInTheDocument();
  },
};

/** Thread with a deleted comment renders [deleted] placeholder */
export const WithDeletedComment = {
  decorators: [(Story) => withThread(TOPIC, Story)],
  beforeEach() {
    return mockThreadFetch(TOPIC, COMMENTS_WITH_DELETED);
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => canvas.getByText('[deleted]'), { timeout: 3000 });
    await expect(canvas.getByText('[deleted]')).toBeInTheDocument();
  },
};

/** Empty thread — shows "No comments yet" state */
export const EmptyThread = {
  decorators: [(Story) => withThread({ ...TOPIC, comment_count: 0 }, Story)],
  beforeEach() {
    return mockThreadFetch({ ...TOPIC, comment_count: 0 }, []);
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => canvas.getByText(/No comments yet/), { timeout: 3000 });
    await expect(canvas.getByText(/No comments yet/)).toBeInTheDocument();
  },
};

/** 404 — topic not found */
export const NotFound = {
  decorators: [(Story) => withThread(null, Story)],
  beforeEach() {
    const orig = globalThis.fetch;
    globalThis.fetch = async (url, ...args) => {
      if (String(url).includes('/api/discussion/topics/')) {
        return new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return orig(url, ...args);
    };
    return () => { globalThis.fetch = orig; };
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => canvas.getByText(/Topic not found/), { timeout: 3000 });
    await expect(canvas.getByText(/Topic not found/)).toBeInTheDocument();
  },
};
