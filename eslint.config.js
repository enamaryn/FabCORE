// Lint limité (ADR 0002) : modules TypeScript migrés uniquement, sans règles de formatage.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/**', 'poc/**', 'design/**', 'scripts/**'] },
  {
    files: ['src/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      '@typescript-eslint/no-floating-promises': ['error', { allowForKnownSafeCalls: [{ from: 'package', package: 'node:test', name: ['test', 'describe', 'it', 'suite'] }] }],
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true, argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // ADR 0003 : le domaine n'importe que lui-même et les schémas TypeBox.
    files: ['src/domain/**/*.ts'],
    ignores: ['src/domain/**/*.test.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { group: ['../*', 'node:*'], message: 'Le domaine ne dépend d’aucune autre couche ni d’aucune I/O (ADR 0003).' },
      ] }],
    },
  },
);
