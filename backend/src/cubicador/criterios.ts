// Criterios de reparación HVAC (sección 5 del diseño). Son datos: cada uno dice
// qué hace el bot y cómo cambia la cubicación, para revisarlos y ajustarlos.
export interface CriterioReparacion {
  clave: string
  situacion: string
  criterio: string
  efecto: string
}

export const CRITERIOS_REPARACION: CriterioReparacion[] = [
  {
    clave: 'recuperacion',
    situacion: 'Siempre, antes de abrir el circuito',
    criterio: 'Se recupera el refrigerante; no se ventea. Se pesa lo recuperado.',
    efecto:
      'HH de recuperación y cilindro de recuperación. El gas recuperado no se reutiliza salvo que lo marques.',
  },
  {
    clave: 'busqueda_fuga',
    situacion: 'Búsqueda de fuga',
    criterio:
      'Con nitrógeno seco y detector, nunca con refrigerante. La presión de prueba no supera la de diseño de la placa.',
    efecto:
      'Nitrógeno de presurización escalonada. Si la placa limita la presión, la fórmula usa ese tope.',
  },
  {
    clave: 'fuga_localizada',
    situacion: 'Fuga localizada en una soldadura o tramo accesible',
    criterio:
      'Se repara con soldadura de plata bajo atmósfera de nitrógeno y se cambia el filtro secador.',
    efecto: 'Purga de nitrógeno, soldadura, filtro secador como repuesto.',
  },
  {
    clave: 'fuga_serpentin',
    situacion: 'Fuga en serpentín, corrosión o varios puntos',
    criterio:
      'El bot propone reemplazar el componente o el tramo y lo advierte; no recomienda parchar.',
    efecto: 'El ítem pasa a repuesto con precio pendiente, y las HH suben.',
  },
  {
    clave: 'compresor_quemado',
    situacion: 'Aceite oscuro, olor ácido o compresor quemado',
    criterio:
      'Flushing del circuito, cambio de aceite y filtros de limpieza. Se asume refrigerante nuevo.',
    efecto:
      'Más nitrógeno por barridos, más HH, aceite y filtros, carga completa sin reutilización.',
  },
  {
    clave: 'evacuacion',
    situacion: 'Evacuación',
    criterio:
      'Vacío profundo hasta 500 micrones y mantenimiento sin subir. Con bomba y vacuómetro.',
    efecto: 'HH de vacío. La bomba es equipo, no material.',
  },
  {
    clave: 'estanqueidad',
    situacion: 'Prueba de estanqueidad',
    criterio: 'Se mantiene la presión el tiempo que fije la plantilla (hoy, 24 horas como mínimo).',
    efecto:
      'Visita de control con HH. Un fallo de la prueba es un riesgo anotado, no está cubicado.',
  },
  {
    clave: 'recarga',
    situacion: 'Recarga',
    criterio:
      'Por peso. Las mezclas zeotrópicas (por ejemplo R-407C y R-404A) se cargan en fase líquida y no se completan con recargas parciales sin analizar.',
    efecto: 'Kilos por peso, cilindro entero, merma de mangueras.',
  },
  {
    clave: 'a2l',
    situacion: 'Refrigerante inflamable (A2L, como R-32)',
    criterio:
      'Se verifica la carga máxima permitida según el tamaño del local y se eliminan fuentes de ignición. El bot pregunta y advierte.',
    efecto:
      'Puede agregar herramientas, detector y HH; si no cumple, el bot no cubica y lo explica.',
  },
  {
    clave: 'retrofit',
    situacion: 'Cambio de refrigerante (retrofit)',
    criterio: 'No es automático. Requiere compatibilidad de aceite y componentes.',
    efecto: 'Queda como supuesto crítico y pregunta explícita antes de cubicar.',
  },
]
