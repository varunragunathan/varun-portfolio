import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../src/hooks/useTheme';
import '../src/index.css';

/** Wrap every story with ThemeProvider + MemoryRouter.
 *  The inner div uses var(--bg) so components render on their actual
 *  theme background instead of Storybook's default white canvas.
 */
export const decorators = [
  (Story) => (
    <ThemeProvider>
      <MemoryRouter>
        <div style={{ padding: '24px', background: 'var(--bg)', minHeight: '100vh' }}>
          <Story />
        </div>
      </MemoryRouter>
    </ThemeProvider>
  ),
];

export const parameters = {
  // Disable Storybook's built-in background switcher — the decorator
  // already handles the background via CSS variables from ThemeProvider.
  backgrounds: { disable: true },
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/i,
    },
  },
  a11y: {
    // 'error' means a11y violations fail the test run (enforced in CI)
    test: 'error',
  },
};
