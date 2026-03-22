import { expect, within, userEvent } from '@storybook/test';
import { vi } from 'vitest';
import { FeedbackForm } from '../components/FeedbackWidget';
import '../components/FeedbackWidget.css';

export default {
  title: 'Feedback/FeedbackForm',
  component: FeedbackForm,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Inline feedback textarea + send button. Submit is disabled until there is non-whitespace input.',
      },
    },
  },
};

/** Empty state — submit is disabled */
export const Empty = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const submit = canvas.getByRole('button', { name: /send/i });
    await expect(submit).toBeDisabled();
  },
};

/** Typing text enables the submit button */
export const WithText = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const textarea = canvas.getByRole('textbox');
    const submit   = canvas.getByRole('button', { name: /send/i });

    await userEvent.type(textarea, 'Great site!');
    await expect(textarea).toHaveValue('Great site!');
    await expect(submit).toBeEnabled();
  },
};

/** Whitespace-only input keeps submit disabled */
export const WhitespaceOnly = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const textarea = canvas.getByRole('textbox');
    const submit   = canvas.getByRole('button', { name: /send/i });

    await userEvent.type(textarea, '   ');
    await expect(submit).toBeDisabled();
  },
};

/** Successful submission shows the done state */
export const SubmitSuccess = {
  play: async ({ canvasElement }) => {
    // Mock fetch to simulate a successful API response
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('{}', { status: 200 })
    );

    const canvas = within(canvasElement);
    const textarea = canvas.getByRole('textbox');
    const submit   = canvas.getByRole('button', { name: /send/i });

    await userEvent.type(textarea, 'Love this portfolio!');
    await userEvent.click(submit);

    // After success the done message appears
    await expect(canvas.getByText(/sent · thank you/i)).toBeVisible();

    vi.restoreAllMocks();
  },
};
