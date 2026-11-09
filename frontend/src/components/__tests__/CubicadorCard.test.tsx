import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CubicadorCard, esUrlSegura, textoPrecio } from '../CubicadorCard'
import type { CubicadorItem, EstadoCubicador } from '../../api/api'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const item = (over: Partial<CubicadorItem>): CubicadorItem => ({
  id: 'i1',
  categoria: 'mat',
  descripcion: 'Gas refrigerante R-404A',
  unidad: 'kg',
  cantidad: 12.5,
  dias: 1,
  formula: 'carga × 1,1',
  precio_unitario: 15000,
  fuente: 'tienda',
  tienda: 'Sodimac',
  fuente_url: 'https://www.sodimac.cl/x',
  estado_precio: 'con_precio',
  ...over,
})

const base: EstadoCubicador = {
  borrador_id: 'b-1',
  perfil: 'hvac',
  estado: 'entrevista',
  compuerta: {
    respondidas: 1,
    requeridas: 3,
    habilitado: false,
    faltantes: ['potencia', 'ubicacion'],
    siguientes: ['¿Qué potencia tiene el equipo?', '¿Dónde está la obra?'],
  },
  datos_completos: 1,
  datos_totales: 5,
  resultado: null,
  precios_pendientes: 0,
}

const render = (estado: EstadoCubicador, onCubicar = vi.fn(), busy = false) => {
  act(() => root.render(<CubicadorCard estado={estado} onCubicar={onCubicar} busy={busy} />))
  return onCubicar
}

describe('helpers', () => {
  it('solo enlaza http(s)', () => {
    expect(esUrlSegura('https://a.cl')).toBe(true)
    expect(esUrlSegura('http://a.cl')).toBe(true)
    expect(esUrlSegura('javascript:alert(1)')).toBe(false)
    expect(esUrlSegura(undefined)).toBe(false)
  })

  it('texto de precio según el estado', () => {
    expect(textoPrecio(item({ estado_precio: 'sin_precio', precio_unitario: null }))).toBe(
      'sin precio'
    )
    expect(textoPrecio(item({ estado_precio: 'pendiente', precio_unitario: null }))).toBe(
      'pendiente'
    )
    expect(textoPrecio(item({}))).toContain('15')
  })
})

describe('CubicadorCard', () => {
  it('con la compuerta cerrada muestra el contador, lista lo que falta y deshabilita el botón', () => {
    const onCubicar = render(base)
    const boton = container.querySelector('button') as HTMLButtonElement
    expect(container.textContent).toContain('1 de 3 respuestas')
    expect(container.textContent).toContain('¿Qué potencia tiene el equipo?')
    expect(boton.disabled).toBe(true)
    expect(boton.getAttribute('aria-disabled')).toBe('true')
    act(() => boton.click())
    expect(onCubicar).not.toHaveBeenCalled()
  })

  it('con la compuerta abierta muestra datos y supuestos y permite cubicar', () => {
    const estado: EstadoCubicador = {
      ...base,
      compuerta: { respondidas: 3, requeridas: 3, habilitado: true, faltantes: [], siguientes: [] },
      datos_completos: 3,
      resultado: {
        items: [],
        supuestos: [{ clave: 'a', texto: 'Se asume acceso libre', critico: false }],
        advertencias: [],
        dotacion: null,
      },
    }
    const onCubicar = render(estado)
    const boton = container.querySelector('button') as HTMLButtonElement
    expect(container.textContent).toContain('3 de 5 datos · 1 supuestos')
    expect(boton.disabled).toBe(false)
    act(() => boton.click())
    expect(onCubicar).toHaveBeenCalledTimes(1)
  })

  it('muestra «Consultando precios…» solo mientras hay precios pendientes', () => {
    render({ ...base, precios_pendientes: 4 })
    expect(container.textContent).toContain('Consultando precios… (4 pendientes)')
    render({ ...base, precios_pendientes: 0 })
    expect(container.textContent).not.toContain('Consultando precios')
  })

  it('muestra el botón bloqueado mientras está ocupado', () => {
    const estado: EstadoCubicador = {
      ...base,
      compuerta: { respondidas: 3, requeridas: 3, habilitado: true, faltantes: [], siguientes: [] },
    }
    const onCubicar = render(estado, vi.fn(), true)
    const boton = container.querySelector('button') as HTMLButtonElement
    expect(boton.disabled).toBe(true)
    act(() => boton.click())
    expect(onCubicar).not.toHaveBeenCalled()
  })

  it('renderiza el listado: categorías, precio, enlace seguro, supuestos críticos y dotación', () => {
    const estado: EstadoCubicador = {
      ...base,
      estado: 'cubicado',
      compuerta: { respondidas: 3, requeridas: 3, habilitado: true, faltantes: [], siguientes: [] },
      resultado: {
        items: [
          item({}),
          item({
            id: 'i2',
            categoria: 'ele',
            descripcion: 'Cable 3x2,5',
            estado_precio: 'sin_precio',
            precio_unitario: null,
            fuente: null,
            fuente_url: 'javascript:alert(1)',
            tienda: undefined,
          }),
          item({
            id: 'i3',
            categoria: 'ins',
            descripcion: 'Soldadura',
            estado_precio: 'pendiente',
            precio_unitario: null,
            fuente_url: undefined,
          }),
        ],
        supuestos: [
          { clave: 's1', texto: 'Distancia 20 m', critico: true },
          { clave: 's2', texto: 'Acceso libre', critico: false },
        ],
        advertencias: ['Precios referenciales'],
        dotacion: { personas: 2, dias: 3, hh_calculadas: 40, hh_cotizadas: 48, holgura_hh: 8 },
      },
    }
    render(estado)
    const texto = container.textContent ?? ''
    expect(texto).toContain('Provisión de Materiales')
    expect(texto).toContain('Materiales Eléctricos')
    expect(texto).toContain('Insumos Industriales y Gases')
    expect(texto).toContain('sin precio')
    expect(texto).toContain('pendiente')
    expect(texto).toContain('Precios referenciales')
    expect(texto).toContain('HH calculadas 40')
    expect(texto).toContain('holgura 8 HH')

    const enlaces = Array.from(container.querySelectorAll('a'))
    expect(enlaces).toHaveLength(1)
    expect(enlaces[0].getAttribute('href')).toBe('https://www.sodimac.cl/x')
    expect(enlaces[0].getAttribute('rel')).toBe('noopener noreferrer')
    expect(enlaces[0].getAttribute('target')).toBe('_blank')
    expect(container.querySelector('a[href^="javascript"]')).toBeNull()

    expect(container.querySelectorAll('.cubicador-supuesto--critico')).toHaveLength(1)
    expect(container.querySelectorAll('details').length).toBeGreaterThan(0)
    expect(container.querySelectorAll('.cubicador-tabla-scroll').length).toBe(3)
  })
})
