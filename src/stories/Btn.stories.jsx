import { expect, within } from '@storybook/test';
import { Btn } from '../components/UI';
import '../components/UI.css';

export default {
  title: 'UI/Btn',
  component: Btn,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Link-styled button with primary and ghost variants.',
      },
    },
  },
  args: {
    href: '#',
    children: 'View project',
  },
};

/** Ghost variant (default) */
export const Ghost = {};

/** Primary variant with filled accent background */
export const Primary = {
  args: { primary: true, children: 'Get started' },
};

/** External link opens in a new tab */
export const External = {
  args: {
    primary: true,
    external: true,
    href: 'https://example.com',
    children: 'GitHub →',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const link = canvas.getByRole('link');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  },
};

/** Both variants side by side */
export const BothVariants = {
  render: () => (
    <div style={{ display: 'flex', gap: 12 }}>
      <Btn href="#">Ghost</Btn>
      <Btn href="#" primary>Primary</Btn>
    </div>
  ),
};
