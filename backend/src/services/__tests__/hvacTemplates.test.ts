import { describe, it, expect, vi } from 'vitest'
import { Pool } from 'pg'
import {
  HVAC_TEMPLATES,
  STANDARD_EXCLUSIONS,
  STANDARD_COMMERCIAL_TERMS,
  computeHvacLogistics,
  inferHvacTemplate,
  getCategoryMargins,
} from '../hvacTemplates'
import { cubicarEspecificacionHvacTool } from '../../agent/tools/specCubicatorTool'
import { procesarCorreoCotizacionTool, sanitizeEmailPii } from '../../agent/tools/emailIntakeTool'
import { AgentContext } from '../../agent/types'

describe('HVAC Domain Templates & Spec Cubicator (Opción C + Opción A)', () => {
  it('define las 5 plantillas de actividad HVAC, 13 exclusiones y 3 condiciones comerciales', () => {
    expect(Object.keys(HVAC_TEMPLATES)).toEqual([
      'ACT-FUGA-VRF',
      'ACT-REP-PRECISION-FLUSH',
      'ACT-INSTALACION-EQUIPOS',
      'ACT-ELECTRICO',
      'ACT-MANTENIMIENTO-PREVENTIVO',
    ])
    expect(STANDARD_EXCLUSIONS).toHaveLength(13)
    expect(STANDARD_COMMERCIAL_TERMS).toHaveLength(3)
    expect(getCategoryMargins('estandar').mo).toBe(35)
    expect(getCategoryMargins('competitivo').mo).toBe(28)
  })

  it('calcula los 3 tramos logísticos (<=100km, 101-200km, >200km faena remota)', () => {
    const t1 = computeHvacLogistics({ distanceKm: 30, days: 2, crewSize: 2 })
    expect(t1).toHaveLength(1)
    expect(t1[0].description).toContain('Desplazamiento')

    const t2 = computeHvacLogistics({ distanceKm: 150, days: 2, crewSize: 2 })
    expect(t2).toHaveLength(2)
    expect(t2.some(l => l.description.includes('Viáticos'))).toBe(true)

    const t3 = computeHvacLogistics({ distanceKm: 500, days: 3, crewSize: 2 })
    expect(t3).toHaveLength(4)
    expect(t3.some(l => l.description.includes('Flete'))).toBe(true)
    expect(t3.some(l => l.description.includes('Alojamiento'))).toBe(true)
    const aloj = t3.find(l => l.description.includes('Alojamiento'))
    expect(aloj?.days).toBe(2) // days - 1 noches
  })

  it('infiere correctamente la plantilla HVAC según palabras clave técnicas', () => {
    expect(inferHvacTemplate('Reparación de fuga en circuito VRF Samsung')).toBe('ACT-FUGA-VRF')
    expect(inferHvacTemplate('Limpieza con R-245fa y cambio compresor sala servidores')).toBe(
      'ACT-REP-PRECISION-FLUSH'
    )
    expect(inferHvacTemplate('Montaje de equipo rooftop y piping de cobre')).toBe(
      'ACT-INSTALACION-EQUIPOS'
    )
    expect(inferHvacTemplate('Tendido de alimentador y tablero eléctrico fuerza')).toBe(
      'ACT-ELECTRICO'
    )
    expect(inferHvacTemplate('Revisión trimestral de equipos split')).toBe(
      'ACT-MANTENIMIENTO-PREVENTIVO'
    )
  })

  it('cubicarEspecificacionHvacTool cruza con catalog_items y calcula costo neto y venta con márgenes', async () => {
    const mockPool = {
      query: vi.fn(async () => ({
        rows: [
          {
            description: 'Técnico Especializado HVAC',
            unit_name: 'Jornada',
            unit_price: '70000',
            category_id: 'mo',
          },
        ],
      })),
    } as unknown as Pool

    const ctx: AgentContext = {
      pool: mockPool,
      userId: 'u-test',
      instruction: 'cubicar fuga vrf',
      recentTurns: [],
      graphContext: '',
      runId: 'run-cub-1',
      model: 'gemini-3.6-flash',
    }

    const res = await cubicarEspecificacionHvacTool.execute(
      {
        descripcion_requerimiento: 'Fuga crítica en sistema VRF edificio corporativo',
        distancia_km: 40,
        perfil_margen: 'estandar',
      },
      ctx
    )

    const out = res.output as {
      plantilla_aplicada: string
      resumen_costos: { costo_neto_clp: number; venta_neta_clp: number }
      exclusiones: string[]
      lineas: Array<{ match_catalogo: string }>
    }

    expect(out.plantilla_aplicada).toBe('ACT-FUGA-VRF')
    expect(out.resumen_costos.costo_neto_clp).toBeGreaterThan(0)
    expect(out.resumen_costos.venta_neta_clp).toBeGreaterThan(out.resumen_costos.costo_neto_clp)
    expect(out.exclusiones).toHaveLength(13)
    expect(out.lineas.some(l => l.match_catalogo === 'auto')).toBe(true)
  })

  it('sanitizeEmailPii y procesarCorreoCotizacionTool redactan RUT, email y teléfono (A-21)', async () => {
    const rawEmail =
      'Estimados, favor cotizar urgente reparación de fuga VRF en sucursal Rancagua. Contacto Juan Pérez juan.perez@cliente.cl, RUT 76.543.210-K, cel +56 9 8765 4321.'
    const { sanitizedText, redactedCount } = sanitizeEmailPii(rawEmail)

    expect(redactedCount).toBe(3)
    expect(sanitizedText).toContain('[EMAIL_REDACTED]')
    expect(sanitizedText).toContain('[RUT_REDACTED]')
    expect(sanitizedText).toContain('[PHONE_REDACTED]')
    expect(sanitizedText).not.toContain('juan.perez@cliente.cl')
    expect(sanitizedText).not.toContain('76.543.210-K')

    const mockPool = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('FROM clients')) {
          return { rows: [{ id: 'cli-1', name: 'Inmobiliaria Norte S.A.' }] }
        }
        return { rows: [] }
      }),
    } as unknown as Pool

    const ctx: AgentContext = {
      pool: mockPool,
      userId: 'u-test',
      instruction: 'procesar correo',
      recentTurns: [],
      graphContext: '',
      runId: 'run-email-1',
      model: 'gemini-3.6-flash',
    }

    const res = await procesarCorreoCotizacionTool.execute(
      {
        cuerpo_correo: rawEmail,
        cliente_pagador_hint: 'Inmobiliaria Norte',
        enduser_hint: 'Sucursal Rancagua Centro',
        ciudad_faena: 'Rancagua',
        distancia_km: 90,
      },
      ctx
    )

    const out = res.output as {
      pii_protegido: boolean
      redacciones_pii: number
      cliente_pagador_detectado: { name: string }
      enduser_detectado: string
    }

    expect(out.pii_protegido).toBe(true)
    expect(out.redacciones_pii).toBe(3)
    expect(out.cliente_pagador_detectado.name).toBe('Inmobiliaria Norte S.A.')
    expect(out.enduser_detectado).toBe('Sucursal Rancagua Centro')
  })
})
