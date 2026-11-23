import { describe, it, expect } from 'vitest'
import { scrubPii } from '../pii'
describe('scrubPii (formatos chilenos en texto libre)', () => {
  it('enmascara RUT sin guion con K, RUT con espacios, fijos y paréntesis, y respeta magnitudes', () => {
    expect(scrubPii('RUT 18234567k del encargado')).toBe('RUT [RUT] del encargado')
    expect(scrubPii('RUT 12.345.678 - 9')).toBe('RUT [RUT]')
    expect(scrubPii('Fijo +56 2 2987 6543')).toBe('Fijo [TELEFONO]')
    expect(scrubPii('Llamar (+569) 9123-4567')).toBe('Llamar [TELEFONO]')
    expect(scrubPii('Plazo 5 dias, 8 tecnicos, 120 m2')).toBe('Plazo 5 dias, 8 tecnicos, 120 m2')
  })
})
