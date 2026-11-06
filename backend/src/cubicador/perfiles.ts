// Perfiles de entrevista del cubicador. Datos puros: sin DB ni LLM.
// El servidor (no Gemini) decide con estas reglas si la cubicacion procede.
import type { PerfilId } from './types'

export interface PreguntaPerfil {
  clave: string
  texto: string
  completa: (datos: Record<string, unknown>) => boolean
  impacto: number
}

export interface PerfilEntrevista {
  id: PerfilId
  minimo: number
  todasObligatorias: boolean
  preguntas: PreguntaPerfil[]
  segundoNivel: (datos: Record<string, unknown>) => string[]
}

// Un dato cuenta solo si trae contenido real (no vacio, no null).
function hay(valor: unknown): boolean {
  if (valor === undefined || valor === null) return false
  if (typeof valor === 'string') return valor.trim() !== ''
  if (typeof valor === 'number') return Number.isFinite(valor)
  return true
}

function esLinea(valor: unknown): boolean {
  if (typeof valor !== 'object' || valor === null) return false
  const l = valor as { diametro?: unknown; largo_m?: unknown }
  return hay(l.diametro) && typeof l.largo_m === 'number' && l.largo_m > 0
}

function textoDe(valor: unknown): string {
  return typeof valor === 'string' ? valor.toUpperCase().replace(/[\s-]/g, '') : ''
}

function sistemaDe(valor: unknown): string {
  return typeof valor === 'string' ? valor.toLowerCase() : ''
}

const HVAC: PerfilEntrevista = {
  id: 'hvac',
  minimo: 3,
  todasObligatorias: true,
  preguntas: [
    {
      clave: 'trabajo_equipo',
      texto: 'Que trabajo hay que hacer (instalar, reparar, mantener) y en que equipo o sistema?',
      completa: d => hay(d.tipo_trabajo) && hay(d.sistema),
      impacto: 3,
    },
    {
      clave: 'refrigerante_lineas',
      texto:
        'Que refrigerante usa, cuanta carga dice la placa (kg) y que diametro y largo tienen la linea de liquido y la de gas?',
      completa: d =>
        hay(d.refrigerante) &&
        hay(d.carga_placa_kg) &&
        esLinea(d.linea_liquido) &&
        esLinea(d.linea_gas),
      impacto: 5,
    },
    {
      clave: 'estado_sistema',
      texto:
        'En que estado esta el sistema hoy: funciona, tiene fugas, el compresor parte, hay alarmas?',
      completa: d => hay(d.estado_texto),
      impacto: 4,
    },
  ],
  segundoNivel: d => {
    const extra: string[] = []
    const ref = textoDe(d.refrigerante)
    const sistema = sistemaDe(d.sistema)
    if (ref === 'R32') {
      extra.push(
        'Que tamano tiene el local donde va el equipo y cual es la carga maxima permitida para ese recinto?'
      )
    }
    if (ref === 'R22') {
      extra.push(
        'Se piensa reconvertir el equipo (retrofit) o se consigue R-22 disponible para recargar?'
      )
    }
    if (sistema.includes('camara') || sistema.includes('central')) {
      extra.push(
        'Cual es la ventana horaria de trabajo y hay que mover el producto almacenado mientras se interviene?'
      )
    }
    return extra
  },
}

const CIERRE_METALICO: PerfilEntrevista = {
  id: 'cierre_metalico',
  minimo: 3,
  todasObligatorias: false,
  preguntas: [
    {
      clave: 'medidas',
      texto: 'Que medidas tiene el vano o cierre (ancho y alto en metros)?',
      completa: d => hay(d.medidas),
      impacto: 5,
    },
    {
      clave: 'tipo_cierre',
      texto: 'Que tipo de cierre es: porton corredero, abatible, reja, cortina enrollable?',
      completa: d => hay(d.tipo_cierre),
      impacto: 4,
    },
    {
      clave: 'anclaje',
      texto: 'A que se ancla: hormigon, albanileria, perfil metalico existente?',
      completa: d => hay(d.anclaje),
      impacto: 3,
    },
    {
      clave: 'cerradura',
      texto: 'Que cerradura lleva: candado, chapa de embutir, chapa electrica?',
      completa: d => hay(d.cerradura),
      impacto: 2,
    },
    {
      clave: 'comuna',
      texto: 'En que comuna esta la obra?',
      completa: d => hay(d.comuna),
      impacto: 1,
    },
  ],
  segundoNivel: d => {
    if (d.chapa_electrica !== true) return []
    return [
      'Que debe pasar con la chapa si se corta la energia (queda abierta o cerrada)?',
      'Cuantas horas de respaldo necesita ante un corte de luz?',
      'A que distancia esta el tablero electrico del cierre?',
      'Por donde corre el cable: embutido, bandeja a la vista o canalizacion subterranea?',
    ]
  },
}

export const PERFILES: Record<PerfilId, PerfilEntrevista> = {
  hvac: HVAC,
  cierre_metalico: CIERRE_METALICO,
}
