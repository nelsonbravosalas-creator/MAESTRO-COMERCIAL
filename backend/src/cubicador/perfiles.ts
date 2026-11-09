// Perfiles de entrevista del cubicador. Datos puros: sin DB ni LLM.
// El servidor (no Gemini) decide con estas reglas si la cubicación procede.
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

// Texto valido: cadena no vacia (se rechazan numeros, booleanos, objetos).
function hay(valor: unknown): boolean {
  return typeof valor === 'string' && valor.trim() !== ''
}

// Numero valido: finito y mayor que cero (se rechaza NaN, Infinity, 0, negativos, "20").
function numeroPositivo(valor: unknown): boolean {
  return typeof valor === 'number' && Number.isFinite(valor) && valor > 0
}

// Medidas: texto ("3x2,4 m") u objeto con contenido.
function hayMedidas(valor: unknown): boolean {
  if (hay(valor)) return true
  return typeof valor === 'object' && valor !== null && Object.keys(valor).length > 0
}

function esLinea(valor: unknown): boolean {
  if (typeof valor !== 'object' || valor === null) return false
  const l = valor as { diametro?: unknown; largo_m?: unknown }
  return hay(l.diametro) && numeroPositivo(l.largo_m)
}

function textoDe(valor: unknown): string {
  return typeof valor === 'string' ? valor.toUpperCase().replace(/[\s-]/g, '') : ''
}

// Minusculas y sin tildes, para que "Cámara frigorífica" coincida con "camara".
export function sistemaDe(valor: unknown): string {
  return typeof valor === 'string'
    ? valor
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
    : ''
}

const HVAC: PerfilEntrevista = {
  id: 'hvac',
  minimo: 3,
  todasObligatorias: true,
  preguntas: [
    {
      clave: 'trabajo_equipo',
      texto: '¿Qué trabajo hay que hacer (instalar, reparar, mantener) y en qué equipo o sistema?',
      completa: d => hay(d.tipo_trabajo) && hay(d.sistema),
      impacto: 3,
    },
    {
      clave: 'refrigerante_lineas',
      texto:
        '¿Qué refrigerante usa, cuánta carga dice la placa (kg) y qué diámetro y largo tienen la línea de líquido y la de gas?',
      completa: d =>
        hay(d.refrigerante) &&
        numeroPositivo(d.carga_placa_kg) &&
        esLinea(d.linea_liquido) &&
        esLinea(d.linea_gas),
      impacto: 5,
    },
    {
      clave: 'estado_sistema',
      texto:
        '¿En qué estado está el sistema hoy: funciona, tiene fugas, el compresor parte, hay alarmas?',
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
        '¿Qué tamaño tiene el local donde va el equipo y cuál es la carga máxima permitida para ese recinto?'
      )
    }
    if (ref === 'R22') {
      extra.push(
        '¿Se piensa reconvertir el equipo (retrofit) o se consigue R-22 disponible para recargar?'
      )
    }
    if (sistema.includes('camara') || sistema.includes('central')) {
      extra.push(
        '¿Cuál es la ventana horaria de trabajo y hay que mover el producto almacenado mientras se interviene?'
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
      texto: '¿Qué medidas tiene el vano o cierre (ancho y alto en metros)?',
      completa: d => hayMedidas(d.medidas),
      impacto: 5,
    },
    {
      clave: 'tipo_cierre',
      texto: '¿Qué tipo de cierre es: portón corredero, abatible, reja, cortina enrollable?',
      completa: d => hay(d.tipo_cierre),
      impacto: 4,
    },
    {
      clave: 'anclaje',
      texto: '¿A qué se ancla: hormigón, albañilería, perfil metálico existente?',
      completa: d => hay(d.anclaje),
      impacto: 3,
    },
    {
      clave: 'cerradura',
      texto: '¿Qué cerradura lleva: candado, chapa de embutir, chapa eléctrica?',
      completa: d => hay(d.cerradura),
      impacto: 2,
    },
    {
      clave: 'comuna',
      texto: '¿En qué comuna está la obra?',
      completa: d => hay(d.comuna),
      impacto: 1,
    },
  ],
  segundoNivel: d => {
    if (d.chapa_electrica !== true) return []
    return [
      '¿Qué debe pasar con la chapa si se corta la energía (queda abierta o cerrada)?',
      '¿Cuántas horas de respaldo necesita ante un corte de luz?',
      '¿A qué distancia está el tablero eléctrico del cierre?',
      '¿Por dónde corre el cable: embutido, bandeja a la vista o canalización subterránea?',
    ]
  },
}

export const PERFILES: Record<PerfilId, PerfilEntrevista> = {
  hvac: HVAC,
  cierre_metalico: CIERRE_METALICO,
}
