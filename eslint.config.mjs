import js from '@eslint/js';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import jsdoc from 'eslint-plugin-jsdoc';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import sonarjs from 'eslint-plugin-sonarjs';
import unusedImports from 'eslint-plugin-unused-imports';

export default [
  js.configs.recommended,
  {
    ignores: [
      '.mastra/**',
      'dist/**',
      'build/**',
      '*.d.ts',
      'node_modules/**',
      'coverage/**',
      '*.min.js',
      'mastra-generated/**',
    ],
  },
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        URL: 'readonly',
        NodeJS: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
      'unused-imports': unusedImports,
      'simple-import-sort': simpleImportSort,
      import: importPlugin,
      jsdoc: jsdoc,
      sonarjs: sonarjs,
    },
    rules: {
      ...typescript.configs.recommended.rules,

      // TypeScript specific rules
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/prefer-as-const': 'error',

      // General JavaScript/TypeScript rules
      'prefer-const': 'error',
      'no-var': 'error',
      'no-console': 'warn',
      'no-debugger': 'error',
      'no-alert': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-return-await': 'error',
      'prefer-template': 'error',
      'prefer-spread': 'error',
      'prefer-rest-params': 'error',
      'prefer-arrow-callback': 'error',
      'arrow-body-style': ['error', 'as-needed'],
      'object-shorthand': 'error',
      'no-duplicate-imports': 'error',
      'no-useless-rename': 'error',
      'no-useless-computed-key': 'error',
      'no-useless-constructor': 'error',
      'no-useless-return': 'error',
      'no-nested-ternary': 'warn',
      'no-unneeded-ternary': 'error',
      'no-else-return': 'error',
      'consistent-return': 'error',

      // Security rules
      'no-script-url': 'error',
      'no-caller': 'error',
      'no-extend-native': 'error',
      'no-extra-bind': 'error',
      'no-invalid-this': 'error',
      'no-multi-spaces': 'error',
      'no-multi-str': 'error',
      'no-new-wrappers': 'error',

      // Best practices
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      curly: ['error', 'all'],
      'dot-notation': 'error',
      'no-empty-function': 'error',
      'no-floating-decimal': 'error',
      'no-sequences': 'error',
      'no-throw-literal': 'error',
      'no-void': 'error',
      'no-with': 'error',
      'wrap-iife': 'error',
      yoda: 'error',

      // Unused imports handling
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],

      // Import sorting and organization
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'import/first': 'error',
      'import/newline-after-import': 'error',
      'import/no-duplicates': 'error',

      // JSDoc rules for better documentation
      'jsdoc/require-jsdoc': [
        'warn',
        {
          require: {
            FunctionDeclaration: true,
            MethodDefinition: true,
            ClassDeclaration: true,
            ArrowFunctionExpression: true,
            FunctionExpression: true,
          },
          contexts: [
            'ExportNamedDeclaration[declaration.type="FunctionDeclaration"]',
            'ExportDefaultDeclaration[declaration.type="FunctionDeclaration"]',
            'ExportNamedDeclaration[declaration.type="VariableDeclaration"]',
          ],
          exemptEmptyFunctions: true,
          checkConstructors: false,
          publicOnly: true,
        },
      ],
      'jsdoc/require-description': 'warn',
      'jsdoc/require-param-description': 'warn',
      'jsdoc/require-returns-description': 'warn',
      'jsdoc/check-param-names': 'error',
      'jsdoc/check-tag-names': 'error',
      'jsdoc/valid-types': 'error',

      // Code quality and complexity rules
      'sonarjs/cognitive-complexity': ['error', 15],
      'sonarjs/no-duplicate-string': ['warn', { threshold: 3 }],
      'sonarjs/no-identical-functions': 'warn',
      'sonarjs/no-collapsible-if': 'warn',
      'sonarjs/prefer-immediate-return': 'warn',
      'sonarjs/prefer-object-literal': 'warn',
      'sonarjs/prefer-single-boolean-return': 'warn',
      'sonarjs/no-small-switch': 'warn',
      'sonarjs/no-redundant-boolean': 'warn',
      'sonarjs/no-inverted-boolean-check': 'warn',

      // Deprecated usage detection
      'no-restricted-syntax': [
        'warn',
        {
          selector: 'CallExpression[callee.name=/.*[Dd]eprecated.*/]',
          message: 'Do not use deprecated functions.',
        },
        {
          selector: 'MemberExpression[property.name=/.*[Dd]eprecated.*/]',
          message: 'Do not use deprecated properties or methods.',
        },
        {
          selector: 'ImportDeclaration[source.value=/.*deprecated.*/i]',
          message: 'Do not import from deprecated modules.',
        },
      ],
      'no-restricted-imports': [
        'warn',
        {
          patterns: [
            {
              group: ['**/deprecated/**'],
              message: 'Do not import from deprecated modules.',
            },
            {
              group: ['**/*deprecated*'],
              message: 'Do not import deprecated functions or modules.',
            },
          ],
        },
      ],
    },
  },
  // Specific rules for Mastra utility and generated files
  {
    files: [
      'src/mastra/**/*.{ts,tsx}',
      'src/agents/**/*.{ts,tsx}',
      'src/workflows/**/*.{ts,tsx}',
    ],
    rules: {
      'jsdoc/require-jsdoc': 'off', // Less strict JSDoc for utility files
      'sonarjs/no-duplicate-string': 'off', // Allow some duplication in config files
    },
  },
  prettier,
];
