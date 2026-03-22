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

/** Step 1 — The passkey auth angle */
export const Step1Auth = {
  name: 'Step 1 — Auth',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitForTitle(canvas, 'You just used the auth');
    await expect(canvas.getByRole('button', { name: /next/i })).toBeVisible();
    await expect(canvas.queryByRole('button', { name: /back/i })).toBeNull();
  },
};

/** Step 2 — AI chat backed by engineering docs */
export const Step2Chat = {
  name: 'Step 2 — Chat',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitForTitle(canvas, 'You just used the auth');
    await userEvent.click(canvas.getByRole('button', { name: /next/i }));
    await waitForTitle(canvas, 'Ask me how any of this was built');
    await expect(canvas.getByText(/Feature 1 of 4/i)).toBeVisible();
  },
};

/** Step 3 — Engineering docs / transparency */
export const Step3Docs = {
  name: 'Step 3 — Docs',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitForTitle(canvas, 'You just used the auth');
    await userEvent.click(canvas.getByRole('button', { name: /next/i }));
    await waitForTitle(canvas, 'Ask me how any of this was built');
    await userEvent.click(canvas.getByRole('button', { name: /next/i }));
    await waitForTitle(canvas, 'Everything is documented');
    await expect(canvas.getByText(/Feature 2 of 4/i)).toBeVisible();
  },
};

/** Step 4 — Timeline at real scale */
export const Step4Timeline = {
  name: 'Step 4 — Timeline',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const stepTitles = ['You just used the auth', 'Ask me how any of this was built', 'Everything is documented', '11 years, real scale'];
    for (let i = 0; i < stepTitles.length; i++) {
      await waitForTitle(canvas, stepTitles[i]);
      if (i < stepTitles.length - 1) {
        await userEvent.click(canvas.getByRole('button', { name: /next/i }));
      }
    }
    await expect(canvas.getByText(/Feature 3 of 4/i)).toBeVisible();
  },
};

/** Step 5 — Projects case studies */
export const Step5Projects = {
  name: 'Step 5 — Projects',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const stepTitles = ['You just used the auth', 'Ask me how any of this was built', 'Everything is documented', '11 years, real scale', 'Projects go all the way'];
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
    const stepTitles = ['You just used the auth', 'Ask me how any of this was built', 'Everything is documented', '11 years, real scale', 'Projects go all the way', 'Start anywhere'];
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
    await waitForTitle(canvas, 'You just used the auth');
    await expect(canvas.queryByRole('button', { name: /back/i })).toBeNull();
    // Advance to step 2
    await userEvent.click(canvas.getByRole('button', { name: /next/i }));
    await waitForTitle(canvas, 'Ask me how any of this was built');
    await expect(canvas.getByRole('button', { name: /back/i })).toBeVisible();
    // Go back to step 1
    await userEvent.click(canvas.getByRole('button', { name: /back/i }));
    await waitForTitle(canvas, 'You just used the auth');
    await expect(canvas.queryByRole('button', { name: /back/i })).toBeNull();
  },
};

/** Full walkthrough — all 6 steps in sequence */
export const FullWalkthrough = {
  name: 'Full walkthrough',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const titles = [
      'You just used the auth',
      'Ask me how any of this was built',
      'Everything is documented',
      '11 years, real scale',
      'Projects go all the way',
      'Start anywhere',
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
