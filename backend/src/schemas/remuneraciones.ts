import { z } from 'zod'
import { money } from './common'

const rate = z.coerce.number().finite().min(0).max(1)
const amount = z.coerce.number().finite().min(0).max(1_000_000_000)

// Entradas por perfil: lo que el usuario ingresa en la ventana de cálculo.
export const perfilInputsSchema = z.object({
  sueldoLiquido: money,
  tipoContrato: z.enum(['Indefinido', 'Plazo Fijo']),
  jornadaSemanal: z.coerce.number().int().min(1).max(45),
  seguroElectrico: z.boolean(),
  colacionMensual: amount,
  movilizacionMensual: amount,
  bonoVacacionesAnual: amount,
  aguinaldoFiestasPatriasAnual: amount,
  aguinaldoNavidadAnual: amount,
})

export type PerfilInputs = z.infer<typeof perfilInputsSchema>

// Parámetros legales y de dotación. Los nombres siguen las hojas
// Leyes_Sociales y Dotacion. Personal del libro COSTEO INTEGRADO.
export const remuneracionParametrosSchema = z
  .object({
    imm: amount,
    uf: amount,
    utm: amount,
    topeAfpSaludSisUf: z.coerce.number().positive().max(500),
    topeAfcUf: z.coerce.number().positive().max(500),
    gratificacionTopeImm: z.coerce.number().positive().max(12),
    diasBaseMes: z.coerce.number().int().min(1).max(31),
    diasTrabajadosMes: z.coerce.number().int().min(1).max(31),
    horasFactorHe: z.coerce.number().positive().max(100),
    factorHoraExtra: z.coerce.number().min(1).max(3),
    afpFondo: rate,
    afpComision: rate,
    salud: rate,
    afcTrabajadorIndefinido: rate,
    afcTrabajadorPlazoFijo: rate,
    sis: rate,
    mutualBasica: rate,
    mutualSanna: rate,
    mutualAdicional: rate,
    afcPatronalIndefCic: rate,
    afcPatronalIndefFcs: rate,
    afcPatronalPlazoFijo: rate,
    seguroElectrico: rate,
    provisionVacaciones: rate,
    provisionIas: rate,
    movilizacionDiaria: amount,
    diasMovilizacion: z.coerce.number().int().min(0).max(31),
    colacionDiaria: amount,
    diasColacion: z.coerce.number().int().min(0).max(31),
    bonoVacacionesAnual: amount,
    aguinaldoFiestasPatriasAnual: amount,
    aguinaldoNavidadAnual: amount,
    incluirIuscCosto: z.boolean(),
    iuscTramos: z
      .array(
        z.object({
          hasta: z.coerce.number().positive().nullable(),
          tasa: rate,
          rebajaUtm: z.coerce.number().min(0).max(1000),
        })
      )
      .min(2)
      .max(12),
  })
  .superRefine((p, ctx) => {
    const hastas = p.iuscTramos.map(t => t.hasta)
    const ultimo = hastas[hastas.length - 1]
    if (ultimo !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['iuscTramos'],
        message: 'El último tramo IUSC debe ser abierto (sin tope)',
      })
    }
    const finitos = hastas.slice(0, -1) as number[]
    if (finitos.some((h, i) => i > 0 && h <= finitos[i - 1])) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['iuscTramos'],
        message: 'Los tramos IUSC deben estar en orden creciente',
      })
    }
  })

export type RemuneracionParametros = z.infer<typeof remuneracionParametrosSchema>

export const calcularRemuneracionSchema = z.object({
  inputs: perfilInputsSchema,
  params: remuneracionParametrosSchema.optional(),
})
