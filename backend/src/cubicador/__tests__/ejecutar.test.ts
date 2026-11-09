import { describe, it, expect } from 'vitest'
import { ejecutarCubicacion, estadoCubicador, resumirFicha } from '../ejecutar'
import { aLineas } from '../ingreso'
import { borradorBase, fakeBd, FICHA_VRF } from './fakeBd'
import type { ResultadoCubicacion } from '../types'

async function falla(
  p: Promise<unknown>
): Promise<{ status?: number; message: string; payload?: Record<string, unknown> }> {
  try {
    await p
  } catch (e) {
    return e as { status?: number; message: string; payload?: Record<string, unknown> }
  }
  throw new Error('no lanzó')
}

describe('ejecutarCubicacion', () => {
  it('procede con compuerta cerrada no cubica', async () => {
    const { pool, filas } = fakeBd([
      borradorBase({ ficha: { ...FICHA_VRF, datos: { sistema: 'vrf' } } }),
    ])
    const err = await falla(ejecutarCubicacion(pool, 'b1', 'u1'))
    expect(err.status).toBe(422)
    expect(err.payload?.faltantes).toEqual(expect.arrayContaining(['refrigerante_lineas']))
    expect(filas.get('b1')?.resultado).toBeNull()
    expect(filas.get('b1')?.estado).toBe('entrevista')
  })

  it('borrador ajeno da 404', async () => {
    const { pool } = fakeBd([borradorBase({ ficha: FICHA_VRF })])
    const err = await falla(ejecutarCubicacion(pool, 'b1', 'otro-usuario'))
    expect(err.status).toBe(404)
  })

  it('con la compuerta abierta guarda el resultado y pasa a cubicado', async () => {
    const { pool, filas } = fakeBd([borradorBase({ ficha: FICHA_VRF })])
    const estado = await ejecutarCubicacion(pool, 'b1', 'u1')
    expect(estado.estado).toBe('cubicado')
    expect(estado.resultado?.items.length).toBeGreaterThan(0)
    expect(estado.compuerta.habilitado).toBe(true)
    expect(estado.datos_completos).toBe(estado.datos_totales)
    expect(filas.get('b1')?.version).toBe(2)
  })

  it('un borrador ya ingresado no se vuelve a cubicar', async () => {
    const { pool } = fakeBd([borradorBase({ ficha: FICHA_VRF, estado: 'ingresado' })])
    expect((await falla(ejecutarCubicacion(pool, 'b1', 'u1'))).status).toBe(409)
  })
})

describe('resumirFicha y estadoCubicador', () => {
  it('el resumen no lleva RUT ni correo', () => {
    const b = borradorBase({
      ficha: {
        descripcion: 'cliente 12.345.678-5 escribe a ana@empresa.cl',
        datos: { contacto: 'ana@empresa.cl' },
        no_sabe: [],
        supuestos: [],
      },
    })
    const texto = resumirFicha(b)
    expect(texto).not.toMatch(/12\.345\.678-5|ana@empresa\.cl/)
    expect(texto).toContain('Compuerta: 0 de 3')
  })

  it('cuenta los precios pendientes', () => {
    const resultado: ResultadoCubicacion = {
      items: [
        {
          id: 'a',
          categoria: 'mat',
          descripcion: 'Cobre',
          unidad: 'm',
          cantidad: 1,
          dias: 1,
          formula: '',
          precio_unitario: null,
          fuente: null,
          estado_precio: 'pendiente',
        },
      ],
      supuestos: [],
      advertencias: [],
      dotacion: null,
    }
    expect(estadoCubicador(borradorBase({ resultado })).precios_pendientes).toBe(1)
  })
})

describe('aLineas', () => {
  it('incluye los ítems sin precio con precio 0', () => {
    const resultado: ResultadoCubicacion = {
      items: [
        {
          id: 'a',
          categoria: 'ins',
          descripcion: 'Gas',
          unidad: 'kg',
          cantidad: 5.4,
          dias: 1,
          formula: '',
          precio_unitario: null,
          fuente: null,
          estado_precio: 'sin_precio',
        },
        {
          id: 'b',
          categoria: 'mo',
          descripcion: 'HH',
          unidad: 'hh',
          cantidad: 16,
          dias: 2,
          formula: '',
          precio_unitario: 9000,
          fuente: null,
          estado_precio: 'con_precio',
        },
      ],
      supuestos: [],
      advertencias: [],
      dotacion: null,
    }
    expect(aLineas(resultado)).toEqual([
      {
        category_id: 'ins',
        descripcion: 'Gas',
        unidad: 'kg',
        cantidad: 5.4,
        dias: 1,
        precio_unitario: 0,
      },
      {
        category_id: 'mo',
        descripcion: 'HH',
        unidad: 'hh',
        cantidad: 16,
        dias: 2,
        precio_unitario: 9000,
      },
    ])
  })
})
