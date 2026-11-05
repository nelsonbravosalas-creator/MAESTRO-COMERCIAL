import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

const { calcularMock, guardarMock } = vi.hoisted(() => ({
  calcularMock: vi.fn(),
  guardarMock: vi.fn(),
}))

vi.mock('../../../api/api', () => ({
  api: {
    calcularRemuneracion: calcularMock,
    guardarRemuneracionPerfil: guardarMock,
  },
  default: {},
}))

import { CalculoPerfilModal } from '../CalculoPerfilModal'
import type {
  PerfilGuardado,
  RemuneracionParametros,
  RemuneracionResultado,
} from '../../../types/remuneraciones'
import type { CatalogItemUI } from '../../../types'

const PARAMS = {
  imm: 500000,
  uf: 39744,
  utm: 66500,
  diasTrabajadosMes: 20,
  diasBaseMes: 30,
  incluirIuscCosto: false,
  movilizacionDiaria: 2000,
  diasMovilizacion: 30,
  colacionDiaria: 11000,
  diasColacion: 21,
  bonoVacacionesAnual: 0,
  aguinaldoFiestasPatriasAnual: 50000,
  aguinaldoNavidadAnual: 50000,
} as unknown as RemuneracionParametros

const INPUTS = {
  sueldoLiquido: 800000,
  tipoContrato: 'Indefinido' as const,
  jornadaSemanal: 44,
  seguroElectrico: false,
  colacionMensual: 45000,
  movilizacionMensual: 35000,
  bonoVacacionesAnual: 0,
  aguinaldoFiestasPatriasAnual: 0,
  aguinaldoNavidadAnual: 0,
}

const RESULTADO = {
  inputs: INPUTS,
  base: 711462,
  gratificacion: 177866,
  imponible: 889328,
  haberes: 969328,
  afp: 101739,
  salud: 62253,
  afcTrabajador: 5336,
  iusc: 0,
  descuentos: 169328,
  liquido: 800000,
  sis: 0,
  mutual: 0,
  afcPatronal: 0,
  seguroElectrico: 0,
  seguros: 50425,
  provisionVacaciones: 0,
  provisionIas: 0,
  costoCajaMensual: 1019753,
  costoLicitacionMensual: 1130919,
  costoLicitacionDiarioPlanilla: 37697,
  costoDiarioTrabajado: 56546,
  valorHoraOrdinaria: 0,
  horaExtra50: 0,
  costoHoraExtra50: 0,
  factorK: 1.41,
  alertas: [],
} as unknown as RemuneracionResultado

let container: HTMLDivElement
let root: Root

// Sin `item` la ventana es el cálculo de sueldo mínimo.
function render(
  item?: CatalogItemUI,
  perfil?: PerfilGuardado,
  onApplied?: (price: number) => void,
  params: RemuneracionParametros = PARAMS
) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root.render(
      <CalculoPerfilModal
        item={item}
        perfil={perfil}
        params={params}
        canEdit={true}
        onClose={() => undefined}
        onApplied={onApplied}
      />
    )
  })
  return { onApplied: onApplied ?? vi.fn() }
}

function botonPorTexto(texto: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find(b => b.textContent === texto) as
    HTMLButtonElement | undefined
}

// El cálculo solo corre al pulsar "Calcular".
async function pulsarCalcular() {
  const boton = botonPorTexto('Calcular') as HTMLButtonElement
  await act(async () => {
    boton.click()
  })
}

// Texto del valor (dd) asociado a una etiqueta (dt) de la ventana.
function valorDe(etiqueta: string): string | undefined {
  const dt = Array.from(container.querySelectorAll('dt')).find(d => d.textContent === etiqueta)
  return dt?.nextElementSibling?.textContent ?? undefined
}

const PERFIL_GUARDADO = (id: string) =>
  ({
    catalog_item_id: id,
    inputs: INPUTS,
    resultado: RESULTADO,
    costo_diario: 56546,
    updated_at: '',
  }) as PerfilGuardado

beforeEach(() => {
  calcularMock.mockReset()
  guardarMock.mockReset()
  calcularMock.mockResolvedValue(RESULTADO)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('CalculoPerfilModal · cálculo solo con botón', () => {
  it('no calcula al abrir y calcula al pulsar Calcular', async () => {
    render({ id: 'mo-1', desc: 'Técnico', unidad: 'Jornada', price: 0 }, PERFIL_GUARDADO('mo-1'))

    expect(calcularMock).not.toHaveBeenCalled()
    expect(container.textContent).not.toContain('Valor jornada')

    await pulsarCalcular()

    expect(calcularMock).toHaveBeenCalledWith(INPUTS)
    expect(container.textContent).toContain('Valor jornada')
    expect(container.textContent).toContain('$56.546')
  })

  it('cambiar un dato no vuelve a calcular y marca el resultado como desactualizado', async () => {
    render({ id: 'mo-1', desc: 'Técnico', unidad: 'Jornada', price: 0 }, PERFIL_GUARDADO('mo-1'))
    await pulsarCalcular()

    const sueldo = container.querySelector('input[type="number"]') as HTMLInputElement
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setter.call(sueldo, '900000')
      sueldo.dispatchEvent(new Event('input', { bubbles: true }))
    })

    expect(calcularMock).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('Cambiaste los datos: vuelve a calcular.')
    expect(container.textContent).not.toContain('Valor jornada')
  })

  it('el total mensual excluye el IUSC por defecto y el IUSC queda como referencia', async () => {
    const conIusc = { ...RESULTADO, iusc: 20000 } as unknown as RemuneracionResultado
    calcularMock.mockResolvedValue(conIusc)
    render({ id: 'mo-1', desc: 'Técnico', unidad: 'Jornada', price: 0 }, PERFIL_GUARDADO('mo-1'))
    await pulsarCalcular()

    expect(container.textContent).toContain('Impuesto único (referencia, fuera del costo)')
    expect(valorDe('Total mensual')).toBe('$1.130.919')
  })

  it('con incluirIuscCosto el IUSC entra al total mensual', async () => {
    const conIusc = { ...RESULTADO, iusc: 20000 } as unknown as RemuneracionResultado
    calcularMock.mockResolvedValue(conIusc)
    render(
      { id: 'mo-1', desc: 'Técnico', unidad: 'Jornada', price: 0 },
      PERFIL_GUARDADO('mo-1'),
      undefined,
      { ...PARAMS, incluirIuscCosto: true } as RemuneracionParametros
    )
    await pulsarCalcular()

    expect(valorDe('Total mensual')).toBe('$1.150.919')
  })

  it('no deja aplicar el precio de un ítem que aún no está guardado', async () => {
    render(
      { id: 'tmp-123', desc: 'Nuevo perfil', unidad: 'Jornada', price: 0 },
      PERFIL_GUARDADO('tmp-123'),
      vi.fn()
    )
    await pulsarCalcular()

    const boton = container.querySelector('.modal-footer .btn-primary-sm') as HTMLButtonElement
    expect(boton.disabled).toBe(true)
    expect(boton.textContent).toContain('Guarda el catálogo primero')
    expect(guardarMock).not.toHaveBeenCalled()
  })

  it('aplica el costo guardado al precio unitario', async () => {
    guardarMock.mockResolvedValue({ costo_diario: 56546 })
    const { onApplied } = render(
      { id: 'mo-1', desc: 'Técnico', unidad: 'Jornada', price: 0 },
      PERFIL_GUARDADO('mo-1'),
      vi.fn()
    )
    await pulsarCalcular()

    const boton = container.querySelector('.modal-footer .btn-primary-sm') as HTMLButtonElement
    await act(async () => {
      boton.click()
    })

    expect(guardarMock).toHaveBeenCalledWith('mo-1', INPUTS)
    expect(onApplied).toHaveBeenCalledWith(56546)
  })
})

describe('CalculoPerfilModal · sueldo mínimo', () => {
  it('abre con el sueldo mínimo (IMM) como líquido y calcula al pulsar Calcular', async () => {
    render(undefined)

    expect(calcularMock).not.toHaveBeenCalled()
    await pulsarCalcular()

    expect(calcularMock).toHaveBeenCalledWith(
      expect.objectContaining({ sueldoLiquido: PARAMS.imm })
    )
    expect(container.textContent).toContain('Costo jornada · sueldo mínimo')
  })

  it('no ofrece aplicar a un perfil', async () => {
    render(undefined)
    await pulsarCalcular()

    expect(botonPorTexto('Aplicar al precio unitario')).toBeUndefined()
    expect(botonPorTexto('Cerrar')).toBeDefined()
    expect(guardarMock).not.toHaveBeenCalled()
  })
})
