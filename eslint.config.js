// Lint rules: the standard JS/TS recommended checks, plus this project's readability style.
// `npm run lint` reports problems; `npm run lint:fix` fixes the ones that can be fixed automatically.
import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['dist/', 'public/', 'assets/'] },

  js.configs.recommended,
  tseslint.configs.recommended,

  { languageOptions: { globals: globals.browser } },
  { files: ['scripts/**', '*.config.{js,ts}'], languageOptions: { globals: globals.node } },

  {
    plugins: { '@stylistic': stylistic },
    rules: {
      // Every if / for / while gets braces, and blocks span multiple lines with one statement per line.
      curly: ['error', 'all'],
      '@stylistic/brace-style': ['error', '1tbs', { allowSingleLine: false }],
      '@stylistic/max-statements-per-line': ['error', { max: 1 }],
      '@stylistic/indent': ['error', 2, { SwitchCase: 1, flatTernaryExpressions: true }],
      '@stylistic/no-trailing-spaces': 'error',

      // Blank lines between the logical steps of a function.
      '@stylistic/padding-line-between-statements': [
        'error',
        // after the imports
        { blankLine: 'always', prev: 'import', next: '*' },
        { blankLine: 'any', prev: 'import', next: 'import' },
        // a group of variable declarations is set apart from the code around it
        { blankLine: 'always', prev: ['const', 'let'], next: '*' },
        { blankLine: 'always', prev: '*', next: ['const', 'let'] },
        { blankLine: 'any', prev: ['const', 'let'], next: ['const', 'let'] },
        // around multi-line if / for / switch / try blocks
        { blankLine: 'always', prev: '*', next: 'multiline-block-like' },
        { blankLine: 'always', prev: 'multiline-block-like', next: '*' },
        // before returning
        { blankLine: 'always', prev: '*', next: 'return' },
        // every switch case is its own paragraph
        { blankLine: 'always', prev: '*', next: ['case', 'default'] },
        // type declarations stand apart
        { blankLine: 'always', prev: '*', next: ['interface', 'type'] },
        { blankLine: 'always', prev: ['interface', 'type'], next: '*' },
      ],
      '@stylistic/lines-between-class-members': ['error', 'always', { exceptAfterSingleLine: true }],
    },
  },
);
