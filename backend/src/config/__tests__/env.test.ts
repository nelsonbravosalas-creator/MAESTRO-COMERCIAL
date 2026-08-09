import { describe, it, expect } from 'vitest'
import { loadEnv, EnvValidationError } from '../env'

const validEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/bravocrm',
  JWT_SECRET: 'a'.repeat(32),
  NODE_ENV: 'test' as const,
  ALLOWED_ORIGINS: 'http://localhost:5173',
}

describe('loadEnv', () => {
  it('arranca con las variables mínimas correctas', () => {
    const env = loadEnv(validEnv)
    expect(env.JWT_SECRET).toBe(validEnv.JWT_SECRET)
    expect(env.JWT_EXPIRY).toBe('1h')
  })

  it('falla si falta JWT_SECRET', () => {
    const { JWT_SECRET, ...rest } = validEnv
    expect(() => loadEnv(rest)).toThrow(EnvValidationError)
    expect(() => loadEnv(rest)).toThrow(/JWT_SECRET/)
  })

  it('falla si JWT_SECRET tiene menos de 32 caracteres', () => {
    expect(() => loadEnv({ ...validEnv, JWT_SECRET: 'corto' })).toThrow(EnvValidationError)
  })

  it('falla si falta ALLOWED_ORIGINS', () => {
    const { ALLOWED_ORIGINS, ...rest } = validEnv
    expect(() => loadEnv(rest)).toThrow(EnvValidationError)
  })

  it('reporta todas las variables inválidas, sin exponer sus valores', () => {
    const { JWT_SECRET, ALLOWED_ORIGINS, ...rest } = validEnv
    try {
      loadEnv(rest)
      expect.unreachable('loadEnv debía lanzar')
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError)
      const err = error as EnvValidationError
      expect(err.variableNames).toEqual(['ALLOWED_ORIGINS', 'JWT_SECRET'])
      expect(err.message).not.toContain(validEnv.JWT_SECRET)
    }
  })

  // Sin esto, un despliegue con la config rota devuelve un 500 opaco: el proceso
  // muere durante el import y no queda nada que responder ni que loguear.
  it('no mata el proceso cuando la configuración es inválida', () => {
    const { JWT_SECRET, ...rest } = validEnv
    let exitCalled = false
    const realExit = process.exit
    // @ts-expect-error sustitución temporal para detectar una llamada a exit
    process.exit = () => {
      exitCalled = true
    }
    try {
      expect(() => loadEnv(rest)).toThrow(EnvValidationError)
    } finally {
      process.exit = realExit
    }
    expect(exitCalled).toBe(false)
  })
})
