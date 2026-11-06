import { describe, it, expect, vi } from 'vitest'
import type { Pool } from 'pg'
import { calcularRefrigerante, volumenLinea, type EntradaRefrigerante } from '../calc/refrigerante'
import { PARAMETROS_BASE, cargarParametros } from '../params'

const vrf: EntradaRefrigerante = {
  tipo_trabajo: 'reparacion',
  sistema: 'vrf',
  refrigerante: 'R-410A',
  metodo: 'total',
  carga_placa_kg: 8.5,
  largo_incluido_m: 0,
  lineas: {
    liquido: { diametro: '3/8', largo_m: 40 },
    gas: { diametro: '3/4', largo_m: 40 },
  },
  reutilizable_kg: 0,
}

const camara: EntradaRefrigerante = {
  tipo_trabajo: 'reparacion',
  sistema: 'camara',
  refrigerante: 'R-404A',
  metodo: 'total',
  carga_placa_kg: 4,
  largo_incluido_m: 0,
  lineas: {
    liquido: { diametro: '3/8', largo_m: 20 },
    gas: { diametro: '7/8', largo_m: 20 },
  },
  reutilizable_kg: 0,
}

function lanza422(fn: () => unknown) {
  try {
    fn()
  } catch (e) {
    expect((e as { status?: number }).status).toBe(422)
    return
  }
  throw new Error('no lanzó')
}

describe('calcularRefrigerante', () => {
  it('VRF R-410A', () => {
    const r = calcularRefrigerante(vrf, PARAMETROS_BASE)
    expect(r.kg).toBe(11.1)
    expect(r.cilindros).toBe(1)
    expect(r.kg_cilindro).toBe(11.3)
  })

  it('cámara R-404A con recuperación total', () => {
    const r = calcularRefrigerante(camara, PARAMETROS_BASE)
    expect(r.kg).toBe(5.4)
    expect(r.cilindros).toBe(1)
    expect(r.kg_cilindro).toBe(10.9)
    expect(r.sobrante_kg).toBe(5.5)
    expect(r.formula).toContain('5,4 kg')
  })

  it('placa de 9 kg sigue en 1 cilindro y la de 10 kg pide 2', () => {
    expect(calcularRefrigerante({ ...camara, carga_placa_kg: 9 }, PARAMETROS_BASE).cilindros).toBe(
      1
    )
    expect(calcularRefrigerante({ ...camara, carga_placa_kg: 10 }, PARAMETROS_BASE).cilindros).toBe(
      2
    )
  })

  it('bombeo', () => {
    const r = calcularRefrigerante({ ...camara, metodo: 'bombeo' }, PARAMETROS_BASE)
    expect(r.kg).toBe(1.0)
    expect(r.cilindros).toBe(1)
  })

  it('reutilizable resta', () => {
    const r = calcularRefrigerante({ ...vrf, reutilizable_kg: 2 }, PARAMETROS_BASE)
    expect(r.kg).toBe(9.0)
  })

  it('instalación con línea menor a la incluida', () => {
    const r = calcularRefrigerante(
      { ...vrf, tipo_trabajo: 'instalacion', largo_incluido_m: 50 },
      PARAMETROS_BASE
    )
    expect(r.kg).toBe(0)
    expect(r.cilindros).toBe(0)
  })

  it('acepta diámetros con comillas o unidad', () => {
    const r = calcularRefrigerante(
      {
        ...vrf,
        lineas: {
          liquido: { diametro: '3/8"', largo_m: 40 },
          gas: { diametro: '3/4 in', largo_m: 40 },
        },
      },
      PARAMETROS_BASE
    )
    expect(r.kg).toBe(11.1)
  })

  it('entradas inválidas lanzan 422', () => {
    lanza422(() =>
      calcularRefrigerante(
        { ...vrf, lineas: { liquido: { diametro: '9/9', largo_m: 5 }, gas: vrf.lineas.gas } },
        PARAMETROS_BASE
      )
    )
    lanza422(() =>
      calcularRefrigerante(
        { ...vrf, lineas: { liquido: { diametro: '3/8', largo_m: -1 }, gas: vrf.lineas.gas } },
        PARAMETROS_BASE
      )
    )
    lanza422(() =>
      calcularRefrigerante(
        {
          ...vrf,
          lineas: { liquido: { diametro: '3/8', largo_m: Infinity }, gas: vrf.lineas.gas },
        },
        PARAMETROS_BASE
      )
    )
    lanza422(() => calcularRefrigerante({ ...vrf, refrigerante: 'R-999' }, PARAMETROS_BASE))
    lanza422(() => calcularRefrigerante({ ...vrf, carga_placa_kg: -3 }, PARAMETROS_BASE))
  })
})

describe('volumenLinea', () => {
  it('usa pi/4 x d²', () => {
    expect(volumenLinea('3/8', 40, PARAMETROS_BASE)).toBeCloseTo(1.9704, 3)
  })
})

describe('cargarParametros', () => {
  it('mezcla la tabla sobre la base', async () => {
    const pool = {
      query: vi.fn(async () => ({
        rows: [
          { clave: 'merma_pct', valor: 8 },
          { clave: 'bombeo', valor: { holgura: 0.7 } },
        ],
      })),
    } as unknown as Pool
    const p = await cargarParametros(pool)
    expect(p.merma_pct).toBe(8)
    expect(p.bombeo).toEqual({ tramo: 0.2, merma: 0.3, holgura: 0.7 })
    expect(p.cobre['3/8']).toBe(7.92)
  })

  it('si la consulta falla usa la base', async () => {
    const pool = {
      query: vi.fn(async () => {
        throw new Error('caída')
      }),
    } as unknown as Pool
    const p = await cargarParametros(pool)
    expect(p).toEqual(PARAMETROS_BASE)
  })
})

describe('validaciones y advertencias', () => {
  const mensaje = (fn: () => unknown): string => {
    try {
      fn()
    } catch (e) {
      expect((e as { status?: number }).status).toBe(422)
      return (e as Error).message
    }
    throw new Error('no lanzó')
  }

  it('placa ausente o 0 en modo total lanza 422', () => {
    const sinPlaca = { ...vrf, carga_placa_kg: undefined }
    expect(mensaje(() => calcularRefrigerante(sinPlaca, PARAMETROS_BASE))).toBe(
      'La carga de placa es obligatoria cuando se recupera todo el refrigerante.'
    )
    mensaje(() => calcularRefrigerante({ ...vrf, carga_placa_kg: 0 }, PARAMETROS_BASE))
    // bombeo no la exige
    expect(calcularRefrigerante({ ...sinPlaca, metodo: 'bombeo' }, PARAMETROS_BASE).kg).toBe(1.0)
  })

  it('texto en placa o reutilizable pide un número', () => {
    const malo = { ...vrf, carga_placa_kg: '8.5' as unknown as number }
    expect(mensaje(() => calcularRefrigerante(malo, PARAMETROS_BASE))).toBe(
      'La carga de placa debe ser un número.'
    )
    const malo2 = { ...vrf, reutilizable_kg: '2' as unknown as number }
    expect(mensaje(() => calcularRefrigerante(malo2, PARAMETROS_BASE))).toContain(
      'debe ser un número'
    )
  })

  it('reutilizable mayor al total da 0 kg y 0 cilindros', () => {
    const r = calcularRefrigerante({ ...vrf, reutilizable_kg: 50 }, PARAMETROS_BASE)
    expect(r.kg).toBe(0)
    expect(r.cilindros).toBe(0)
  })

  it('límite exacto de cilindro no agrega uno de más', () => {
    const p = { ...PARAMETROS_BASE, merma_pct: 0 }
    const r = calcularRefrigerante(
      {
        ...vrf,
        carga_placa_kg: 11.3,
        lineas: { liquido: { diametro: '3/8', largo_m: 0 }, gas: { diametro: '3/4', largo_m: 0 } },
      },
      p
    )
    expect(r.kg).toBe(11.3)
    expect(r.cilindros).toBe(1)
    expect(r.sobrante_kg).toBe(0)
  })

  it('R-410A en cámara omite el vapor con advertencia', () => {
    const r = calcularRefrigerante(
      { ...camara, refrigerante: 'R-410A', carga_placa_kg: 4 },
      PARAMETROS_BASE
    )
    const sinVapor = calcularRefrigerante(
      { ...vrf, carga_placa_kg: 4, lineas: camara.lineas },
      PARAMETROS_BASE
    )
    expect(r.kg).toBe(sinVapor.kg)
    expect(r.advertencias).toHaveLength(1)
    expect(r.advertencias[0]).toContain('densidad de vapor de R-410A')
    expect(r.formula).toContain('sin vapor')
  })

  it('R-404A en cámara y central incluye vapor sin advertencia', () => {
    expect(calcularRefrigerante(camara, PARAMETROS_BASE).advertencias).toEqual([])
    const c = calcularRefrigerante({ ...camara, sistema: 'central' }, PARAMETROS_BASE)
    expect(c.kg).toBe(5.4)
    expect(c.advertencias).toEqual([])
    expect(calcularRefrigerante(vrf, PARAMETROS_BASE).advertencias).toEqual([])
  })

  it('método o sistema desconocido lanza 422', () => {
    mensaje(() =>
      calcularRefrigerante({ ...vrf, metodo: 'x' as unknown as 'total' }, PARAMETROS_BASE)
    )
    mensaje(() => calcularRefrigerante({ ...vrf, sistema: 'volcan' }, PARAMETROS_BASE))
  })

  it('líneas faltantes lanzan 422', () => {
    mensaje(() =>
      calcularRefrigerante(
        { ...vrf, lineas: { gas: vrf.lineas.gas } as unknown as EntradaRefrigerante['lineas'] },
        PARAMETROS_BASE
      )
    )
    mensaje(() =>
      calcularRefrigerante(
        {
          ...camara,
          lineas: { liquido: camara.lineas.liquido } as unknown as EntradaRefrigerante['lineas'],
        },
        PARAMETROS_BASE
      )
    )
  })

  it('el error de diámetro lista los válidos', () => {
    const m = mensaje(() =>
      calcularRefrigerante(
        { ...vrf, lineas: { liquido: { diametro: '9/9', largo_m: 5 }, gas: vrf.lineas.gas } },
        PARAMETROS_BASE
      )
    )
    expect(m).toContain('1/4')
    expect(m).toContain('7/8')
  })

  it('merma inválida no produce NaN', () => {
    mensaje(() => calcularRefrigerante(vrf, { ...PARAMETROS_BASE, merma_pct: NaN }))
  })

  it('filas de la tabla que no encajan se ignoran', async () => {
    const pool = {
      query: vi.fn(async () => ({
        rows: [
          { clave: 'bombeo', valor: 'roto' },
          { clave: 'cobre', valor: null },
          { clave: 'merma_pct', valor: 'x' },
        ],
      })),
    } as unknown as Pool
    expect(await cargarParametros(pool)).toEqual(PARAMETROS_BASE)
  })
})
