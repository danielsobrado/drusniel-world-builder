import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

// Same correctness-only rules as the main repository, plus JSX and hooks for the frontend.
const rules = {
  'no-undef': 'error',
  'no-unreachable': 'error',
  'no-unused-vars': ['error', { args: 'none', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
};

export default [
  { ignores: ['node_modules/**', 'frontend/dist/**', 'data/**'] },
  {
    files: ['backend/**/*.js', 'scripts/**/*.js', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node },
    rules,
  },
  {
    files: ['frontend/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...rules,
      // JSX identifiers are not seen by no-unused-vars without the react plugin; count them as used.
      'no-unused-vars': ['error', { args: 'none', varsIgnorePattern: '^(_|[A-Z])', caughtErrors: 'none', ignoreRestSiblings: true }],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
