import { describe, it, expect, vi } from 'vitest'
import { buildCorsOriginChecker } from '../cors'

describe('buildCorsOriginChecker (C-03)', () => {
  const allowed = ['https://app.bravocrm.cl', 'http://localhost:5173']
  const checker = buildCorsOriginChecker(allowed)

  it('permite un origen presente en la allowlist', () => {
    const cb = vi.fn()
    checker('https://app.bravocrm.cl', cb)
    expect(cb).toHaveBeenCalledWith(null, true)
  })

  it('rechaza un origen que no está en la allowlist (nunca *)', () => {
    const cb = vi.fn()
    checker('https://evil.example', cb)
    expect(cb).toHaveBeenCalledTimes(1)
    const [err, allow] = cb.mock.calls[0]
    expect(err).toBeInstanceOf(Error)
    expect(allow).toBeUndefined()
  })

  it('permite peticiones sin cabecera Origin (curl, monitores de uptime)', () => {
    const cb = vi.fn()
    checker(undefined, cb)
    expect(cb).toHaveBeenCalledWith(null, true)
  })
})
