import { expect, within, userEvent } from '@storybook/test';
import { ThemeToggle } from '../components/UI';

export default {
  title: 'UI/ThemeToggle',
  component: ThemeToggle,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: '3-segment theme control (Auto / Light / Dark). Uses aria-pressed for accessibility.',
      },
    },
  },
};

/** Default — auto is selected on first render */
export const Default = {};

/** Clicking Light sets aria-pressed=true on the Light button */
export const ClickLight = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const lightBtn = canvas.getByRole('button', { name: 'Light' });
    await userEvent.click(lightBtn);
    await expect(lightBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas.getByRole('button', { name: 'Auto' })).toHaveAttribute('aria-pressed', 'false');
    await expect(canvas.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'false');
  },
};

/** Clicking Dark sets aria-pressed=true on the Dark button */
export const ClickDark = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const darkBtn = canvas.getByRole('button', { name: 'Dark' });
    await userEvent.click(darkBtn);
    await expect(darkBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'false');
  },
};

/** Cycling through all three modes */
export const CycleAllModes = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const auto  = canvas.getByRole('button', { name: 'Auto' });
    const light = canvas.getByRole('button', { name: 'Light' });
    const dark  = canvas.getByRole('button', { name: 'Dark' });

    await userEvent.click(light);
    await expect(light).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(dark);
    await expect(dark).toHaveAttribute('aria-pressed', 'true');
    await expect(light).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(auto);
    await expect(auto).toHaveAttribute('aria-pressed', 'true');
    await expect(dark).toHaveAttribute('aria-pressed', 'false');
  },
};
