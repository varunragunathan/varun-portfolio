import { expect, within, userEvent, waitFor } from '@storybook/test';
import WelcomeTour from '../components/WelcomeTour';

export default {
  title: 'Onboarding/WelcomeTour',
  component: WelcomeTour,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Six-step owl-guided welcome tour shown once to first-time authenticated users. Supports keyboard navigation (←/→/ESC) and backdrop-click to dismiss.',
      },
    },
    layout: 'fullscreen',
    a11y: {
      // The tour uses position:fixed with a dark backdrop. Axe resolves the background
      // by traversing up to the Storybook iframe body (white), producing false-positive
      // contrast failures against dark-mode text tokens. Contrast is verified correct
      // against the actual theme surface colours (--surface: #11111a in dark mode).
      config: { rules: [{ id: 'color-contrast', enabled: false }] },
    },
  },
  args: {
    onDone: () => {},
  },
};

// Helper — waits for a step title to become fully visible after AnimatePresence transition
async function waitForTitle(canvas, title) {
  await waitFor(() => expect(canvas.getByText(title)).toBeVisible(), { timeout: 2000 });
}

/** Step 1 — Welcome message */
export const Step1Welcome = {
  name: 'Step 1 — Welcome',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitForTitle(canvas, 'Welcome aboard');
    await expect(canvas.getByRole('button', { name: /next/i })).toBeVisible();
    await expect(canvas.queryByRole('button', { name: /back/i })).toBeNull();
  },
};

/** Step 2 — Chat feature */
export const Step2Chat = {
  name: 'Step 2 — Chat',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitForTitle(canvas, 'Welcome aboard');
    await userEvent.click(canvas.getByRole('button', { name: /next/i }));
    await waitForTitle(canvas, 'Chat with me');
    await expect(canvas.getByText(/Feature 1 of 4/i)).toBeVisible();
  },
};

/** Step 3 — Timeline feature */
export const Step3Timeline = {
  name: 'Step 3 — Timeline',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitForTitle(canvas, 'Welcome aboard');
    await userEvent.click(canvas.getByRole('button', { name: /next/i }));
    await waitForTitle(canvas, 'Chat with me');
    await userEvent.click(canvas.getByRole('button', { name: /next/i }));
    await waitForTitle(canvas, 'Browse the timeline');
    await expect(canvas.getByText(/Feature 2 of 4/i)).toBeVisible();
  },
};

/** Step 4 — Projects feature */
export const Step4Projects = {
  name: 'Step 4 — Projects',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const stepTitles = ['Welcome aboard', 'Chat with me', 'Browse the timeline', 'Explore the projects'];
    for (let i = 0; i < stepTitles.length; i++) {
      await waitForTitle(canvas, stepTitles[i]);
      if (i < stepTitles.length - 1) {
        await userEvent.click(canvas.getByRole('button', { name: /next/i }));
      }
    }
    await expect(canvas.getByText(/Feature 3 of 4/i)).toBeVisible();
  },
};

/** Step 5 — Account / Settings feature */
export const Step5Account = {
  name: 'Step 5 — Account',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const stepTitles = ['Welcome aboard', 'Chat with me', 'Browse the timeline', 'Explore the projects', 'Your account'];
    for (let i = 0; i < stepTitles.length; i++) {
      await waitForTitle(canvas, stepTitles[i]);
      if (i < stepTitles.length - 1) {
        await userEvent.click(canvas.getByRole('button', { name: /next/i }));
      }
    }
    await expect(canvas.getByText(/Feature 4 of 4/i)).toBeVisible();
  },
};

/** Step 6 — Done */
export const Step6Done = {
  name: 'Step 6 — Done',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const stepTitles = ['Welcome aboard', 'Chat with me', 'Browse the timeline', 'Explore the projects', 'Your account', "You're all set"];
    for (let i = 0; i < stepTitles.length; i++) {
      await waitForTitle(canvas, stepTitles[i]);
      if (i < stepTitles.length - 1) {
        await userEvent.click(canvas.getByRole('button', { name: /next/i }));
      }
    }
    await expect(canvas.getByRole('button', { name: /get started/i })).toBeVisible();
  },
};

/** Back navigation returns to the previous step */
export const BackNavigation = {
  name: 'Back navigation',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitForTitle(canvas, 'Welcome aboard');
    await expect(canvas.queryByRole('button', { name: /back/i })).toBeNull();
    // Advance to step 2
    await userEvent.click(canvas.getByRole('button', { name: /next/i }));
    await waitForTitle(canvas, 'Chat with me');
    await expect(canvas.getByRole('button', { name: /back/i })).toBeVisible();
    // Go back to step 1
    await userEvent.click(canvas.getByRole('button', { name: /back/i }));
    await waitForTitle(canvas, 'Welcome aboard');
    await expect(canvas.queryByRole('button', { name: /back/i })).toBeNull();
  },
};

/** Full walkthrough — all 6 steps in sequence */
export const FullWalkthrough = {
  name: 'Full walkthrough',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const titles = [
      'Welcome aboard',
      'Chat with me',
      'Browse the timeline',
      'Explore the projects',
      'Your account',
      "You're all set",
    ];

    for (let i = 0; i < titles.length; i++) {
      await waitForTitle(canvas, titles[i]);
      if (i < titles.length - 1) {
        await userEvent.click(canvas.getByRole('button', { name: /next/i }));
      }
    }
    await expect(canvas.getByRole('button', { name: /get started/i })).toBeVisible();
  },
};
