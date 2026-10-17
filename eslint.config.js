import globals from 'globals';

// Correctness checks only. Authoring assets and generated build output are excluded.
export default [
  { ignores: ['node_modules/**', 'dist/**', 'tmp/**', '.history/**', 'public/**',
    'reference/**', 'src/editor/_clod_shims/**', '**/*.generated.js',
    // Exact historical capture scripts are hashed evidence, not maintained runners.
    'docs/qa/sparse-grass-audit-2026-10-16/capture-script.mjs',
    'docs/qa/sparse-grass-implementation-2026-10-16/capture-sparse-grass-ab.mjs'] },
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
