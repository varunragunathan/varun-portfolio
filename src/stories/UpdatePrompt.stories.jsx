import { expect } from '@storybook/test';
import UpdatePrompt from '../components/UpdatePrompt';
import '../components/UpdatePrompt.css';

// UpdatePrompt uses virtual:pwa-register/react — aliased to the mock in
// .storybook/main.js so the story works without a real service worker.

export default {
  title: 'UI/UpdatePrompt',
  component: UpdatePrompt,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'PWA update banner. Appears when a new service worker version is waiting. Hidden by default — only shows when needRefresh=true.',
      },
    },
  },
};

/** Hidden by default (needRefresh=false from the mock) */
export const Hidden = {
  play: async ({ canvasElement }) => {
    const prompt = canvasElement.querySelector('#update-prompt');
    await expect(prompt).toBeNull();
  },
};
