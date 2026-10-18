export type HvacTemplateId =
  | 'ACT-FUGA-VRF'
  | 'ACT-REP-PRECISION-FLUSH'
  | 'ACT-INSTALACION-EQUIPOS'
  | 'ACT-ELECTRICO'
  | 'ACT-MANTENIMIENTO-PREVENTIVO'

export type MarginProfile = 'estandar' | 'competitivo'

export type HvacCategoryId = 'mo' | 'mat' | 'log' | 'rep' | 'ins'

export interface HvacTemplateItemDef {
  category_id: HvacCategoryId
  description: string
  unit: string
  baseQty: number
  scaleWithDays: boolean
  suggestedUnitPrice: number
}

export interface HvacTemplateDef {
  id: HvacTemplateId
  title: string
  baseDays: number
  crew: {
    supervisor: number
    tecnicoSenior: number
    tecnico: number
    ayudante: number
  }
  items: HvacTemplateItemDef[]
  scopeSteps: string[]
  adjustmentRules: string[]
}

export const STANDARD_EXCLUSIONS: string[] = [
  'Obras civiles',
  'Demoliciones',
  'Aumento de potencia eléctrica',
  'Suministro de repuestos no indicados expresamente',
  'Puesta en marcha de otros equipos no indicados',
  'Instalación de faena',
  'Acreditaciones y exámenes especiales',
  'Prevencionista de riesgos permanente en obra',
  'Trabajos en días no hábiles',
  'Retiro de escombros y disposición de residuos',
  'Certificados de disposición de materiales peligrosos',
  'Gastos bancarios',
  'Todo lo no indicado expresamente como incluido',
]

export const STANDARD_COMMERCIAL_TERMS: string[] = [
  'Validez de la oferta: 15 días corridos',
  'Forma de pago: 50% anticipo con la OC, saldo en estados de avance',
  'Facturación en pesos chilenos (CLP)',
]

export function getCategoryMargins(profile: MarginProfile): Record<HvacCategoryId, number> {
  if (profile === 'competitivo') {
    return { mo: 28, mat: 20, log: 25, rep: 30, ins: 30 }
  }
  return { mo: 35, mat: 30, log: 30, rep: 30, ins: 30 }
}

export const HVAC_TEMPLATES: Record<HvacTemplateId, HvacTemplateDef> = {
  'ACT-FUGA-VRF': {
    id: 'ACT-FUGA-VRF',
    title: 'Búsqueda y Reparación de Fuga en Sistema VRF',
    baseDays: 4,
    crew: { supervisor: 0, tecnicoSenior: 1, tecnico: 0, ayudante: 1 },
    items: [
      {
        category_id: 'mo',
        description: 'Técnico Especializado HVAC',
        unit: 'Jornada',
        baseQty: 1,
        scaleWithDays: true,
        suggestedUnitPrice: 120000,
      },
      {
        category_id: 'mo',
        description: 'Ayudante Técnico HVAC',
        unit: 'Jornada',
        baseQty: 1,
        scaleWithDays: true,
        suggestedUnitPrice: 65000,
      },
      {
        category_id: 'ins',
        description: 'Nitrógeno N2 Industrial',
        unit: 'Tubo',
        baseQty: 3,
        scaleWithDays: false,
        suggestedUnitPrice: 35000,
      },
      {
        category_id: 'ins',
        description: 'Soldadura Plata 15% + Oxígeno/Acetileno',
        unit: 'Kit',
        baseQty: 1,
        scaleWithDays: false,
        suggestedUnitPrice: 45000,
      },
      {
        category_id: 'ins',
        description: 'Gas Refrigerante R-410A',
        unit: 'Kg',
        baseQty: 3,
        scaleWithDays: false,
        suggestedUnitPrice: 28000,
      },
      {
        category_id: 'rep',
        description: 'Filtro Deshidratador Bidireccional',
        unit: 'Unidad',
        baseQty: 1,
        scaleWithDays: false,
        suggestedUnitPrice: 48000,
      },
    ],
    scopeSteps: [
      'Conexión de software de servicio (SNET Pro / iCOM), bloqueo LOTO y recuperación de refrigerante remanente.',
      'Presurización escalonada con nitrógeno seco (150/300/550 PSI) y búsqueda de fuga con detector electrónico.',
      'Reparación con soldadura de plata 15% bajo atmósfera de nitrógeno y reemplazo de filtro deshidratador.',
      'Prueba de estanqueidad por 24 horas mínimo y doble vacío profundo hasta 500 micrones.',
      'Recarga de refrigerante por peso y puesta en marcha (PEM) con protocolo de parámetros.',
    ],
    adjustmentRules: [
      '+1 jornada si la fuga no está localizada previamente.',
      '-1 jornada si la fuga ya fue localizada y documentada en informe.',
      '+1 jornada si el equipo se encuentra en altura o acceso restringido.',
    ],
  },
  'ACT-REP-PRECISION-FLUSH': {
    id: 'ACT-REP-PRECISION-FLUSH',
    title: 'Reparación Clima de Precisión con Lavado Químico R-245fa',
    baseDays: 4,
    crew: { supervisor: 0, tecnicoSenior: 1, tecnico: 0, ayudante: 1 },
    items: [
      {
        category_id: 'mo',
        description: 'Técnico Especializado HVAC',
        unit: 'Jornada',
        baseQty: 1,
        scaleWithDays: true,
        suggestedUnitPrice: 120000,
      },
      {
        category_id: 'mo',
        description: 'Ayudante Técnico HVAC',
        unit: 'Jornada',
        baseQty: 1,
        scaleWithDays: true,
        suggestedUnitPrice: 65000,
      },
      {
        category_id: 'ins',
        description: 'Agente de Limpieza de Sistemas R-245fa',
        unit: 'Cilindro',
        baseQty: 1,
        scaleWithDays: false,
        suggestedUnitPrice: 280000,
      },
      {
        category_id: 'ins',
        description: 'Neutralizador de Acidez Acidol / Aceite POE',
        unit: 'Kit',
        baseQty: 2,
        scaleWithDays: false,
        suggestedUnitPrice: 65000,
      },
      {
        category_id: 'mat',
        description: 'Tees y Válvulas de Bola Mini para Puntos de Flush',
        unit: 'Set',
        baseQty: 1,
        scaleWithDays: false,
        suggestedUnitPrice: 55000,
      },
      {
        category_id: 'rep',
        description: 'Filtro Deshidratador Antiácido (Vertiv/Emerson)',
        unit: 'Unidad',
        baseQty: 1,
        scaleWithDays: false,
        suggestedUnitPrice: 68000,
      },
    ],
    scopeSteps: [
      'Bloqueo LOTO, recuperación de refrigerante y presurización con N2 a 250 PSI.',
      'Reparación con soldadura plata 15% e instalación de puntos de inyección para flushing.',
      'Lavado químico con R-245fa impulsado por N2 en evaporador, condensador y líneas.',
      'Reemplazo de filtro deshidratador, barrido con N2 y doble vacío profundo (< 500 micrones).',
      'Carga de refrigerante por peso y puesta en marcha con protocolo iCOM.',
    ],
    adjustmentRules: [
      '+1 a +2 jornadas si se confirma humedad severa o aceite ácido.',
      '+1 jornada si la sala está en producción con ventana horaria restringida.',
    ],
  },
  'ACT-INSTALACION-EQUIPOS': {
    id: 'ACT-INSTALACION-EQUIPOS',
    title: 'Instalación de Equipos de Climatización con Piping',
    baseDays: 21,
    crew: { supervisor: 1, tecnicoSenior: 1, tecnico: 0, ayudante: 1 },
    items: [
      {
        category_id: 'mo',
        description: 'Supervisor de Terreno HVAC',
        unit: 'Jornada',
        baseQty: 1,
        scaleWithDays: true,
        suggestedUnitPrice: 145000,
      },
      {
        category_id: 'mo',
        description: 'Técnico Especializado HVAC',
        unit: 'Jornada',
        baseQty: 1,
        scaleWithDays: true,
        suggestedUnitPrice: 120000,
      },
      {
        category_id: 'mo',
        description: 'Ayudante Técnico HVAC',
        unit: 'Jornada',
        baseQty: 1,
        scaleWithDays: true,
        suggestedUnitPrice: 65000,
      },
      {
        category_id: 'mat',
        description: 'Cañería de Cobre Tipo K y L con Coplas y Soportación Unistrut',
        unit: 'Set',
        baseQty: 1,
        scaleWithDays: false,
        suggestedUnitPrice: 480000,
      },
      {
        category_id: 'mat',
        description: 'Alimentadores Libres de Halógeno y Canalización EMT',
        unit: 'Set',
        baseQty: 1,
        scaleWithDays: false,
        suggestedUnitPrice: 320000,
      },
      {
        category_id: 'ins',
        description: 'Nitrógeno N2, Soldadura Plata 15% y Gases Oxiacetileno',
        unit: 'Kit',
        baseQty: 1,
        scaleWithDays: false,
        suggestedUnitPrice: 240000,
      },
    ],
    scopeSteps: [
      'Replanteo de trazado frigorífico, soportación Unistrut y montaje mecánico de equipos.',
      'Tendido y soldadura de cañerías de cobre tipo K/L con respaldo de nitrógeno seco.',
      'Prueba de estanqueidad a 450 PSI, vacío profundo y carga de refrigerante.',
      'Puesta en marcha (PEM), ajuste de parámetros y entrega a operaciones.',
    ],
    adjustmentRules: [
      'Escalar jornadas proporcionalmente a los metros de piping y cantidad de equipos.',
    ],
  },
  'ACT-ELECTRICO': {
    id: 'ACT-ELECTRICO',
    title: 'Trabajo Eléctrico y Tablero de Fuerza/Control HVAC',
    baseDays: 1,
    crew: { supervisor: 0, tecnicoSenior: 1, tecnico: 0, ayudante: 1 },
    items: [
      {
        category_id: 'mo',
        description: 'Técnico Electricista',
        unit: 'Jornada',
        baseQty: 1,
        scaleWithDays: true,
        suggestedUnitPrice: 125000,
      },
      {
        category_id: 'mo',
        description: 'Ayudante Técnico HVAC',
        unit: 'Jornada',
        baseQty: 1,
        scaleWithDays: true,
        suggestedUnitPrice: 65000,
      },
      {
        category_id: 'mat',
        description: 'Alimentador Libre de Halógeno y Canalización EMT',
        unit: 'Metro',
        baseQty: 25,
        scaleWithDays: false,
        suggestedUnitPrice: 6500,
      },
      {
        category_id: 'mat',
        description: 'Protecciones Termomagnéticas y Diferenciales',
        unit: 'Set',
        baseQty: 1,
        scaleWithDays: false,
        suggestedUnitPrice: 85000,
      },
    ],
    scopeSteps: [
      'Verificación de punto de conexión en tablero existente y bloqueo LOTO.',
      'Montaje de canalización EMT, tendido de alimentador libre de halógeno y conexionado.',
      'Instalación de protecciones termomagnéticas/diferenciales y pruebas de aislación.',
    ],
    adjustmentRules: [
      '+1 jornada si no existe bandeja portaconductores y se requiere canalización completa.',
    ],
  },
  'ACT-MANTENIMIENTO-PREVENTIVO': {
    id: 'ACT-MANTENIMIENTO-PREVENTIVO',
    title: 'Mantenimiento Preventivo de Equipos de Climatización',
    baseDays: 1,
    crew: { supervisor: 0, tecnicoSenior: 0, tecnico: 1, ayudante: 1 },
    items: [
      {
        category_id: 'mo',
        description: 'Técnico Especializado HVAC',
        unit: 'Jornada',
        baseQty: 1,
        scaleWithDays: true,
        suggestedUnitPrice: 120000,
      },
      {
        category_id: 'mo',
        description: 'Ayudante Técnico HVAC',
        unit: 'Jornada',
        baseQty: 1,
        scaleWithDays: true,
        suggestedUnitPrice: 65000,
      },
      {
        category_id: 'ins',
        description: 'Insumos de Mantenimiento y Limpieza de Serpentines',
        unit: 'Gl',
        baseQty: 1,
        scaleWithDays: false,
        suggestedUnitPrice: 35000,
      },
    ],
    scopeSteps: [
      'Aplicación de checklist de mantenimiento preventivo: limpieza de serpentines y filtros.',
      'Medición de superheat/subcooling, reapriete eléctrico y prueba de bombas/bandejas de drenaje.',
      'Registro de parámetros operacionales y entrega de protocolo técnico.',
    ],
    adjustmentRules: [
      'Escalar a razón de 1 jornada base por equipo de precisión o grupo de equipos menores.',
    ],
  },
}

export function computeHvacLogistics(params: {
  distanceKm: number
  days: number
  crewSize: number
}): Array<{
  category_id: 'log'
  description: string
  unit: string
  quantity: number
  days: number
  suggestedUnitPrice: number
}> {
  const distanceKm = Math.max(0, Number.isFinite(params.distanceKm) ? params.distanceKm : 30)
  const days = Math.max(1, Math.round(params.days || 1))
  const crewSize = Math.max(1, Math.round(params.crewSize || 1))

  if (distanceKm <= 100) {
    return [
      {
        category_id: 'log',
        description: 'Desplazamiento por Km',
        unit: 'Km',
        quantity: Math.max(1, distanceKm * 2),
        days,
        suggestedUnitPrice: 450,
      },
    ]
  }

  if (distanceKm <= 200) {
    return [
      {
        category_id: 'log',
        description: 'Desplazamiento por Km',
        unit: 'Km',
        quantity: Math.max(1, distanceKm * 2),
        days,
        suggestedUnitPrice: 450,
      },
      {
        category_id: 'log',
        description: 'Viáticos y Alimentación',
        unit: 'Persona/Día',
        quantity: crewSize,
        days,
        suggestedUnitPrice: 25000,
      },
    ]
  }

  return [
    {
      category_id: 'log',
      description: 'Desplazamiento por Km',
      unit: 'Km',
      quantity: distanceKm * 2,
      days: 1,
      suggestedUnitPrice: 450,
    },
    {
      category_id: 'log',
      description: 'Flete Herramientas STGO-Faena',
      unit: 'Gl',
      quantity: 1,
      days: 1,
      suggestedUnitPrice: 180000,
    },
    {
      category_id: 'log',
      description: 'Alojamiento Diario',
      unit: 'Noche',
      quantity: crewSize,
      days: Math.max(1, days - 1),
      suggestedUnitPrice: 45000,
    },
    {
      category_id: 'log',
      description: 'Viáticos y Alimentación',
      unit: 'Ración',
      quantity: crewSize,
      days,
      suggestedUnitPrice: 25000,
    },
  ]
}

function normalizeForMatch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export function inferHvacTemplate(text: string): HvacTemplateId {
  const norm = normalizeForMatch(text || '')
  if (norm.includes('vrf') || norm.includes('fuga')) {
    return 'ACT-FUGA-VRF'
  }
  if (
    norm.includes('flush') ||
    norm.includes('r-245fa') ||
    norm.includes('r245fa') ||
    norm.includes('acido') ||
    norm.includes('precision')
  ) {
    return 'ACT-REP-PRECISION-FLUSH'
  }
  if (norm.includes('instalacion') || norm.includes('piping') || norm.includes('montaje')) {
    return 'ACT-INSTALACION-EQUIPOS'
  }
  if (norm.includes('electrico') || norm.includes('tablero') || norm.includes('alimentador')) {
    return 'ACT-ELECTRICO'
  }
  return 'ACT-MANTENIMIENTO-PREVENTIVO'
}
