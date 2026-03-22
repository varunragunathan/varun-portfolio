import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../src/hooks/useTheme';
import '../src/index.css';

/** Wrap every story with ThemeProvider + MemoryRouter */
export const decorators = [
  (Story) => (
    <ThemeProvider>
      <MemoryRouter>
        <div style={{ padding: '24px' }}>
          <Story />
        </div>
      </MemoryRouter>
    </ThemeProvider>
  ),
];

export const parameters = {
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
