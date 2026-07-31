import { describe, it, expect, vi, afterEach } from 'vitest'
import { loadEnv } from '../env'

const validEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/bravocrm',
  JWT_SECRET: 'a'.repeat(32),
  NODE_ENV: 'test' as const,
  ALLOWED_ORIGINS: 'http://localhost:5173',
}

describe('loadEnv', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('arranca con las variables mínimas correctas', () => {
    const env = loadEnv(validEnv)
    expect(env.JWT_SECRET).toBe(validEnv.JWT_SECRET)
    expect(env.JWT_EXPIRY).toBe('1h')
  })

  it('falla (exit != 0) si falta JWT_SECRET', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`)
    }) as never)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { JWT_SECRET, ...rest } = validEnv
    expect(() => loadEnv(rest)).toThrow('exit:1')
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('falla (exit != 0) si JWT_SECRET tiene menos de 32 caracteres', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`)
    }) as never)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => loadEnv({ ...validEnv, JWT_SECRET: 'corto' })).toThrow('exit:1')
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('falla (exit != 0) si falta ALLOWED_ORIGINS', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`)
    }) as never)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { ALLOWED_ORIGINS, ...rest } = validEnv
    expect(() => loadEnv(rest)).toThrow('exit:1')
    expect(exitSpy).toHaveBeenCalledWith(1)
  })
})
