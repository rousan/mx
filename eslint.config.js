import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import jsdoc from 'eslint-plugin-jsdoc';
import prettier from 'eslint-config-prettier';

/**
 * Flat ESLint config for the mx monorepo.
 *
 * Layers the JS + typescript-eslint recommended rule sets, the JSDoc plugin
 * (warnings, to nudge toward the project's documentation conventions without
 * blocking the build), and the Prettier compatibility config last so formatting
 * concerns are owned entirely by Prettier.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'npm/bin/**',
      'npm/templates/**',
      'npm/mission-control/**',
      // The dashboard is a React/Vite app with its own conventions; the repo's
      // JSDoc-on-everything TS config doesn't apply to JSX components.
      'apps/mission-control/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  jsdoc.configs['flat/recommended-typescript'],
  {
    rules: {
      // JSDoc is authored by hand per the project's coding rules; keep the
      // plugin's structural checks as warnings rather than hard errors.
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/require-param-description': 'warn',
      'jsdoc/require-returns-description': 'warn',
      // Void/never functions carry no meaningful return value to document.
      'jsdoc/require-returns': 'off',
      'jsdoc/require-returns-check': 'off',
      // Match the project's JSDoc style: a blank line between the description
      // and the first tag, no blank lines between tags.
      'jsdoc/tag-lines': ['warn', 'never', { startLines: 1 }],
      // Allow intentionally-unused args when prefixed with an underscore.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  prettier,
);
