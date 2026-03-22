import { expect, within } from '@storybook/test';
import { SkipLink } from '../components/UI';
import '../components/UI.css';

export default {
  title: 'UI/SkipLink',
  component: SkipLink,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Keyboard-only skip link. Visually hidden until focused — allows keyboard users to jump past navigation to main content.',
      },
    },
  },
};

/** Default — renders with correct href */
export const Default = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const link = canvas.getByRole('link', { name: /skip to content/i });
    await expect(link).toHaveAttribute('href', '#main');
  },
};
