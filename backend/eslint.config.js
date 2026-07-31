import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'

export default tseslint.config(
  // Las migraciones de node-pg-migrate son CommonJS a propósito (así lo espera
  // la herramienta); no tiene sentido aplicarles las reglas del resto del backend.
  { ignores: ['dist', 'node_modules', 'coverage', 'src/db/migrations/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // A-12: reglas mínimas obligatorias. TypeScript ya cubre no-undef
      // (namespaces ambientales, tipos) mejor que la regla base de ESLint.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-floating-promises': 'off', // requiere parserOptions.project; ver nota abajo
      'no-empty': 'error',
    },
  }
)
