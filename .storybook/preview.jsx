import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../src/hooks/useTheme';
import { AuthProvider }  from '../src/hooks/useAuth.jsx';
import '../src/index.css';

/** Wrap every story with ThemeProvider + AuthProvider + MemoryRouter.
 *  AuthProvider with VITE_ENABLE_AUTH unset renders as unauthenticated
 *  (user: null) and makes no network calls — safe in Storybook.
 *  The inner div uses var(--bg) so components render on their actual
 *  theme background instead of Storybook's default white canvas.
 */
export const decorators = [
  (Story) => (
    <ThemeProvider>
      <AuthProvider>
        <MemoryRouter>
          <div style={{ padding: '24px', background: 'var(--bg)', minHeight: '100vh' }}>
            <Story />
          </div>
        </MemoryRouter>
      </AuthProvider>
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
