import globals from 'globals';

// Correctness checks only. Authoring assets and generated build output are excluded.
export default [
  { ignores: ['node_modules/**', 'dist/**', 'tmp/**', '.history/**', 'public/**',
    'reference/**', 'src/editor/_clod_shims/**', '**/*.generated.js'] },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module',
      globals: { ...globals.browser, ...globals.node, ...globals.worker } },
    rules: {
      'no-undef': 'error',
      'no-unreachable': 'error',
      'no-unused-vars': ['error', { args: 'none', varsIgnorePattern: '^_',
        caughtErrors: 'none', ignoreRestSiblings: true }],
    },
  },
];
