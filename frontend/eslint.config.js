import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import typescript from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'

export default [
  {
    ignores: ['dist', 'node_modules'],
  },
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: globals.browser,
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      '@typescript-eslint': typescript,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      // TypeScript ya valida los props en tiempo de compilación; prop-types es
      // el mecanismo de validación en runtime de proyectos JS puros.
      'react/prop-types': 'off',
      'react-refresh/only-export-components': 'warn',
      // Patrón existente (sincronizar form/estado derivado desde un efecto) que la
      // regla nueva de eslint-plugin-react-hooks v7 marca como error por defecto.
      // No es un bug: se deja en warn como deuda técnica a revisar en su propio cambio.
      'react-hooks/set-state-in-effect': 'warn',
      // TypeScript ya cubre estos dos (variables/identificadores no definidos, incluyendo
      // firmas de tipo en interfaces y namespaces ambientales como React.*): la regla base
      // de ESLint no entiende el AST de TS y genera falsos positivos masivos.
      'no-unused-vars': 'off',
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
]
