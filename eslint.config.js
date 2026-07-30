const js = require('@eslint/js');
const prettierConfig = require('eslint-config-prettier');
const prettier = require('eslint-plugin-prettier');
const globals = require('globals');

module.exports = [
  {
    ignores: [
      'coverage/**',
      'gtfs-files/**',
      'lib/gtfs/static/**',
      'lib/gtfs/tmp/**',
      'node_modules/**',
      'tmp/**',
    ],
  },
  js.configs.recommended,
  prettierConfig,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        ...globals.browser,
        ...globals.jest,
        ...globals.node,
      },
    },
    plugins: {
      prettier,
    },
    rules: {
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },
];
