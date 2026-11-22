import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

// Correctness rules for the TypeScript frontend and the Node helper scripts.
// The Python backend is linted by ruff (npm run lint:backend).
export default tseslint.config(
  { ignores: ['node_modules/**', 'frontend/dist/**', 'data/**', 'backend/**'] },
  {
    files: ['scripts/**/*.js', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { args: 'none', varsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  {
    files: ['frontend/**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommended],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { args: 'none', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
