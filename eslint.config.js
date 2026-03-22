// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [js.configs.recommended, {
  files: ['src/**/*.{js,jsx}'],
  plugins: {
    'jsx-a11y': jsxA11y,
    'react-hooks': reactHooks,
  },
  rules: {
    ...jsxA11y.configs.recommended.rules,
    ...reactHooks.configs.recommended.rules,
    // React 17+ new JSX transform — no need to import React for JSX
    'no-unused-vars': ['error', { varsIgnorePattern: '^React$', argsIgnorePattern: '^_' }],
    // react-hooks v7 new rule — too aggressive for timer/async patterns; downgrade to warn
    'react-hooks/set-state-in-effect': 'warn',
  },
  languageOptions: {
    globals: { ...globals.browser },
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
}, ...storybook.configs["flat/recommended"]];
