import { describe, it, expect } from 'vitest'
import { uuidParams, money, nonEmptyStr } from '../common'

describe('uuidParams (A-01, AC-1.6)', () => {
  const schema = uuidParams('id', 'contactId')

  it('acepta dos UUIDs válidos', () => {
    const r = schema.safeParse({
      id: '11111111-1111-4111-8111-111111111111',
      contactId: '22222222-2222-4222-8222-222222222222',
    })
    expect(r.success).toBe(true)
  })

  it('rechaza un id que no es UUID', () => {
    const r = schema.safeParse({ id: 'abc', contactId: '22222222-2222-4222-8222-222222222222' })
    expect(r.success).toBe(false)
  })

  it('rechaza si falta un param', () => {
    const r = schema.safeParse({ id: '11111111-1111-4111-8111-111111111111' })
    expect(r.success).toBe(false)
  })
})

describe('money (A-01)', () => {
  it('acepta un número no negativo', () => {
    expect(money.safeParse(1000).success).toBe(true)
  })
  it('rechaza negativos', () => {
    expect(money.safeParse(-1).success).toBe(false)
  })
  it('rechaza NaN/no numérico', () => {
    expect(money.safeParse('no-es-numero').success).toBe(false)
  })
})

describe('nonEmptyStr (A-01)', () => {
  const schema = nonEmptyStr(5)
  it('acepta un string dentro del límite', () => {
    expect(schema.safeParse('ok').success).toBe(true)
  })
  it('rechaza string vacío', () => {
    expect(schema.safeParse('').success).toBe(false)
  })
  it('rechaza string más largo que el máximo', () => {
    expect(schema.safeParse('demasiado-largo').success).toBe(false)
  })
})
