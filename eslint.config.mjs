import nx from '@nx/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: ['**/dist', '**/out-tsc', '**/vite.config.*.timestamp*'],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            // The API must never import web code, and shared libs must never
            // import app code — the boundary that keeps libs/platform-core
            // usable from both the NestJS server and the browser bundles.
            { sourceTag: 'scope:api', onlyDependOnLibsWithTags: ['scope:api', 'scope:shared'] },
            { sourceTag: 'scope:web', onlyDependOnLibsWithTags: ['scope:web', 'scope:shared'] },
            { sourceTag: 'scope:shared', onlyDependOnLibsWithTags: ['scope:shared'] },
          ],
        },
      ],
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.mjs',
    ],
    rules: {
      // `any` re-opens every hole strict mode just closed. Currently a warning
      // because the 16 `catch (err: any)` blocks in the social publishers are
      // deleted wholesale by BasePublisher's typed error mapping; promote to
      // 'error' once that lands and the count reaches zero.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // The React apps carry `eslint-disable-next-line react-hooks/exhaustive-deps`
    // comments, but the plugin defining that rule was never registered — so the
    // disables were errors and the stale-closure bugs the rule catches went
    // unchecked. Both apps were entirely unlinted before this branch.
    // Matched by extension, not path: each project's lint target runs
    // `eslint .` from its own directory, so workspace-relative globs miss.
    files: ['**/*.tsx', '**/*.jsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
