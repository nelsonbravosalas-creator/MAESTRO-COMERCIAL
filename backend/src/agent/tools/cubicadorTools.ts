// Herramientas del cubicador guiado. El modelo solo escribe datos en la ficha;
// las cantidades las calcula el código del perfil y la compuerta la decide el servidor.
import { AgentContext, AgentTool, AgentToolResult } from '../types'
import {
  addLinesToQuotationOp,
  createQuotationOp,
  manualItemsWarning,
  resolveClientByName,
  scrubPii,
  errorMessage,
  type ClientRecord,
} from '../../services/chatbotOps'
import type { Pool } from 'pg'
import { LOCKED_STATUSES } from '../../api/quotations'
import { asHttpError, httpError } from '../../utils/httpError'
import { logger } from '../../utils/logger'
import {
  actualizarBorrador,
  borradorActivo,
  crearBorrador,
  obtenerBorrador,
} from '../../cubicador/borradores'
import { aplicarAjustes, leerAjustes } from '../../cubicador/ajustes'
import { evaluarCompuerta } from '../../cubicador/compuerta'
import { copiarPrecio, ejecutarCubicacion, estadoCubicador } from '../../cubicador/ejecutar'
import { aLineas, describirListado } from '../../cubicador/ingreso'
import { cubicar } from '../../cubicador/motor'
import { cargarParametros } from '../../cubicador/params'
import { resolverPreciosCatalogo } from '../../cubicador/precios'
import { PERFILES } from '../../cubicador/perfiles'
import type {
  Borrador,
  Ficha,
  ItemListado,
  PerfilId,
  ResultadoCubicacion,
} from '../../cubicador/types'

const ROLES = ['admin', 'commercial', 'engineer']

type Objeto = Record<string, unknown>

function esObjeto(v: unknown): v is Objeto {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// A-21: cada texto que el modelo escribe en la ficha pasa por scrubPii.
function limpiarPii(valor: unknown): unknown {
  if (typeof valor === 'string') return scrubPii(valor)
  if (Array.isArray(valor)) return valor.map(limpiarPii)
  if (esObjeto(valor)) {
    const salida: Objeto = {}
    for (const [k, v] of Object.entries(valor)) salida[k] = limpiarPii(v)
    return salida
  }
  return valor
}

const CLAVE_VALIDA = /^[a-z0-9_]{1,60}$/
// Clave reservada: solo quitar_items / cambios_item de ajustar_listado la escriben.
const CLAVE_RESERVADA = 'ajustes_listado'

// Datos que escribe el modelo: solo claves identificador (sin la reservada) y textos sin PII.
// Claves del prototipo: CLAVE_VALIDA las deja pasar (solo letras y guiones bajos),
// así que se bloquean aquí en todos los niveles (F10).
const CLAVES_PROTOTIPO = new Set(['__proto__', 'constructor', 'prototype'])

function limpiarDatos(valor: unknown, raiz = true): unknown {
  if (Array.isArray(valor)) return valor.map(v => limpiarDatos(v, false))
  if (esObjeto(valor)) {
    const salida: Objeto = {}
    for (const [k, v] of Object.entries(valor)) {
      if (!CLAVE_VALIDA.test(k) || CLAVES_PROTOTIPO.has(k) || (raiz && k === CLAVE_RESERVADA))
        continue
      salida[k] = limpiarDatos(v, false)
    }
    return salida
  }
  return limpiarPii(valor)
}

// F4: el modelo a veces nombra distinto una clave conocida. Se promueve al nombre canónico
// (lineas.liquido -> linea_liquido, lineas.gas -> linea_gas, estado -> estado_texto).
function normalizarAliasDatos(datos: Objeto): Objeto {
  const salida: Objeto = { ...datos }
  if (esObjeto(salida.lineas)) {
    const l = salida.lineas as Objeto
    if (l.liquido !== undefined && salida.linea_liquido === undefined)
      salida.linea_liquido = l.liquido
    if (l.gas !== undefined && salida.linea_gas === undefined) salida.linea_gas = l.gas
    delete salida.lineas
  }
  if (salida.estado !== undefined && salida.estado_texto === undefined) {
    salida.estado_texto = salida.estado
    delete salida.estado
  }
  return salida
}

// Fusión recursiva de objetos; listas y valores simples reemplazan al anterior.
function fusionar(base: Objeto, nuevo: Objeto): Objeto {
  const salida: Objeto = { ...base }
  for (const [k, v] of Object.entries(nuevo)) {
    if (CLAVES_PROTOTIPO.has(k)) continue
    const previo = salida[k]
    salida[k] = esObjeto(v) && esObjeto(previo) ? fusionar(previo, v) : v
  }
  return salida
}

// F9: la cotización abierta debe existir y, si está en estado final, solo un admin la toca.
async function verificarCotizacionEditable(
  pool: Pool,
  quotationId: string,
  role: string | undefined
): Promise<void> {
  const r = await pool.query('SELECT status FROM quotations WHERE id = $1 AND deleted_at IS NULL', [
    quotationId,
  ])
  if (r.rows.length === 0) {
    throw httpError(
      'La cotización abierta ya no existe. Indica el cliente para crear una nueva.',
      404
    )
  }
  if (role !== 'admin' && LOCKED_STATUSES.includes(r.rows[0].status)) {
    throw httpError(
      `Esta cotización está ${r.rows[0].status} y no puede ser modificada. Indica el cliente para crear una nueva.`,
      403
    )
  }
}

function exigirUsuario(ctx: AgentContext): string {
  if (!ctx.userId) throw httpError('Se requiere una sesión de usuario.', 401)
  return ctx.userId
}

async function resolverBorrador(args: Objeto, ctx: AgentContext): Promise<Borrador> {
  const userId = exigirUsuario(ctx)
  const id = typeof args.borrador_id === 'string' ? args.borrador_id : null
  const borrador = id
    ? await obtenerBorrador(ctx.pool, id, userId)
    : await borradorActivo(ctx.pool, userId)
  if (!borrador) throw httpError('Borrador no encontrado', 404)
  return borrador
}

function resumirItems(items: ItemListado[]) {
  return items.map(i => ({
    id: i.id,
    categoria: i.categoria,
    descripcion: i.descripcion,
    unidad: i.unidad,
    cantidad: i.cantidad,
    precio_unitario: i.precio_unitario,
    estado_precio: i.estado_precio,
  }))
}

const BORRADOR_ID_PARAM = {
  type: 'string',
  description: 'ID del borrador (si se omite, se usa el borrador activo del usuario).',
}

// ── entrevistar_obra ────────────────────────────────────────────────

export const entrevistarObraTool: AgentTool = {
  name: 'entrevistar_obra',
  description:
    'Registra en la ficha del borrador lo que el usuario acaba de decir sobre la obra (crea el borrador si no existe) y devuelve el estado de la compuerta y las siguientes preguntas. Llámala en cada turno con los datos nuevos. No calcula cantidades.',
  parameters: {
    type: 'object',
    properties: {
      perfil: {
        type: 'string',
        enum: ['hvac', 'cierre_metalico'],
        description: 'Tipo de obra. Obligatorio al crear el borrador.',
      },
      descripcion: {
        type: 'string',
        description: 'Resumen breve del trabajo, en palabras del usuario.',
      },
      datos: {
        type: 'object',
        description:
          'Datos nuevos de la obra (clave: valor), solo lo que el usuario dijo en este mensaje. Se fusionan con lo anterior. ' +
          'Claves hvac: tipo_trabajo, sistema, actividad, refrigerante, carga_placa_kg, linea_liquido {diametro, largo_m}, ' +
          'linea_gas {diametro, largo_m}, estado_texto, uniones, jornadas_fijadas, tecnicos, ayudantes, comuna. ' +
          'Claves cierre_metalico: medidas {largo_m, alto_m}, tipo_cierre, anclaje, cerradura, comuna, chapa_electrica. ' +
          'Alias aceptados: lineas.liquido -> linea_liquido, lineas.gas -> linea_gas, estado -> estado_texto.',
      },
      no_sabe: {
        type: 'array',
        items: { type: 'string' },
        description: 'Claves de preguntas que el usuario dijo no saber.',
      },
    },
  },
  kind: 'read',
  roles: ROLES,
  execute: async (args, ctx): Promise<AgentToolResult> => {
    const userId = exigirUsuario(ctx)
    const perfilArg = typeof args.perfil === 'string' ? args.perfil : null
    if (perfilArg && !(perfilArg in PERFILES)) {
      throw httpError(`Perfil desconocido: ${perfilArg}.`, 422)
    }
    const datos = esObjeto(args.datos)
      ? normalizarAliasDatos(limpiarDatos(args.datos) as Objeto)
      : {}
    const descripcion = typeof args.descripcion === 'string' ? scrubPii(args.descripcion) : ''
    const pedidos = Array.isArray(args.no_sabe)
      ? args.no_sabe.filter((x): x is string => typeof x === 'string')
      : []

    const activo = await borradorActivo(ctx.pool, userId)
    // Solo cuentan las claves de preguntas reales del perfil; el resto se informa y se ignora.
    const perfilDestino = (
      activo && (!perfilArg || perfilArg === activo.perfil) ? activo.perfil : perfilArg
    ) as PerfilId | null
    const claves = new Set(perfilDestino ? PERFILES[perfilDestino].preguntas.map(q => q.clave) : [])
    const noSabe = pedidos.filter(k => claves.has(k))
    const ignorados = pedidos.filter(k => !claves.has(k)).map(k => scrubPii(k).slice(0, 60))
    let borrador: Borrador
    if (activo && (!perfilArg || perfilArg === activo.perfil)) {
      const datosFusionados = fusionar(activo.ficha.datos, datos)
      // F5: cambiar medidas invalida las cantidades a mano de las medidas anteriores.
      if (Object.keys(datos).length > 0 && esObjeto(datosFusionados.ajustes_listado)) {
        datosFusionados.ajustes_listado = { ...datosFusionados.ajustes_listado, cantidades: {} }
      }
      const ficha: Ficha = {
        ...activo.ficha,
        descripcion: descripcion || activo.ficha.descripcion,
        datos: datosFusionados,
        no_sabe: Array.from(new Set([...activo.ficha.no_sabe, ...noSabe])),
      }
      const cambio = Object.keys(datos).length > 0 || noSabe.length > 0
      // Si cambian los datos, el listado calculado deja de ser válido.
      const invalida = cambio && activo.estado === 'cubicado'
      borrador = await actualizarBorrador(
        ctx.pool,
        activo.id,
        userId,
        invalida ? { ficha, resultado: null, estado: 'entrevista' } : { ficha },
        activo.version
      )
    } else {
      if (!perfilArg) {
        throw httpError(
          'Indica el perfil de la obra (hvac o cierre_metalico) para abrir el borrador.',
          422
        )
      }
      borrador = await crearBorrador(ctx.pool, {
        userId,
        tenantId: ctx.tenantId ?? null,
        quotationId: ctx.quotationId ?? null,
        perfil: perfilArg as PerfilId,
        ficha: { descripcion, datos, no_sabe: noSabe, supuestos: [] },
      })
    }

    const estado = estadoCubicador(borrador)
    return {
      output: {
        borrador_id: borrador.id,
        perfil: borrador.perfil,
        compuerta: estado.compuerta,
        siguientes: estado.compuerta.siguientes,
        segundo_nivel: PERFILES[borrador.perfil].segundoNivel(borrador.ficha.datos),
        datos_completos: estado.datos_completos,
        datos_totales: estado.datos_totales,
        ...(ignorados.length ? { ignorados } : {}),
      },
      summary: `Ficha actualizada: ${estado.datos_completos} de ${estado.datos_totales} datos (compuerta ${
        estado.compuerta.habilitado ? 'abierta' : 'cerrada'
      })`,
      cubicador: estado,
    }
  },
}

// ── cubicar_borrador ────────────────────────────────────────────────

export const cubicarBorradorTool: AgentTool = {
  name: 'cubicar_borrador',
  description:
    'Calcula el listado de materiales, mano de obra y logística del borrador. Solo cuando el usuario escribe «procede» o «cubica». Si faltan datos, el servidor lo bloquea y devuelve lo que falta.',
  parameters: { type: 'object', properties: { borrador_id: BORRADOR_ID_PARAM } },
  kind: 'read',
  roles: ROLES,
  execute: async (args, ctx): Promise<AgentToolResult> => {
    const borrador = await resolverBorrador(args, ctx)
    try {
      const estado = await ejecutarCubicacion(ctx.pool, borrador.id, exigirUsuario(ctx))
      const r = estado.resultado as ResultadoCubicacion
      return {
        output: {
          borrador_id: estado.borrador_id,
          items: resumirItems(r.items),
          supuestos: r.supuestos,
          advertencias: r.advertencias,
          dotacion: r.dotacion,
          precios_pendientes: estado.precios_pendientes,
        },
        summary: `Cubicación lista: ${r.items.length} ítems, ${estado.precios_pendientes} sin precio aún`,
        cubicador: estado,
      }
    } catch (err) {
      const payload = asHttpError(err).payload
      if (asHttpError(err).status === 422) {
        const estado = estadoCubicador(borrador)
        const faltantes = Array.isArray(payload?.faltantes)
          ? payload.faltantes
          : estado.compuerta.faltantes
        return {
          output: {
            bloqueado: true,
            motivo: scrubPii(errorMessage(err)),
            faltantes,
            siguientes: payload?.siguientes ?? estado.compuerta.siguientes,
          },
          summary: 'Cubicación bloqueada: faltan datos',
          cubicador: estado,
        }
      }
      throw err
    }
  },
}

// ── ajustar_listado ─────────────────────────────────────────────────

export const ajustarListadoTool: AgentTool = {
  name: 'ajustar_listado',
  description:
    'Ajusta un listado ya cubicado sin volver a preguntar: cambia datos de la ficha, quita ítems o corrige la cantidad o el precio de un ítem, y recalcula con el código. Conserva los precios ya resueltos de los ítems que no cambian.',
  parameters: {
    type: 'object',
    properties: {
      borrador_id: BORRADOR_ID_PARAM,
      datos: { type: 'object', description: 'Datos de la ficha a corregir (se fusionan).' },
      quitar_items: {
        type: 'array',
        items: { type: 'string' },
        description: 'IDs de los ítems del listado que se quitan.',
      },
      cambios_item: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            cantidad: { type: 'number' },
            precio_unitario: { type: 'number' },
            tienda: { type: 'string' },
          },
          required: ['id'],
        },
        description:
          'Correcciones puntuales por ítem (cantidad o precio indicados por el usuario).',
      },
    },
  },
  kind: 'read',
  roles: ROLES,
  execute: async (args, ctx): Promise<AgentToolResult> => {
    const userId = exigirUsuario(ctx)
    const borrador = await resolverBorrador(args, ctx)
    if (borrador.estado !== 'cubicado' || !borrador.resultado) {
      throw httpError('Aún no hay un listado cubicado; usa cubicar_borrador primero.', 422)
    }
    const previo = borrador.resultado

    const datosNuevos = esObjeto(args.datos)
      ? normalizarAliasDatos(limpiarDatos(args.datos) as Objeto)
      : {}
    const ajustes = leerAjustes(borrador.ficha.datos.ajustes_listado)
    // Si cambian las medidas, las cantidades a mano de las medidas anteriores ya no
    // valen y pisarían el cálculo nuevo: se descartan; quitar y precios se conservan (F5).
    if (Object.keys(datosNuevos).length > 0) ajustes.cantidades = {}
    const quitar = Array.isArray(args.quitar_items)
      ? args.quitar_items.filter((x): x is string => typeof x === 'string')
      : []
    const cambios = Array.isArray(args.cambios_item) ? args.cambios_item.filter(esObjeto) : []

    const datos = fusionar(borrador.ficha.datos, datosNuevos)
    const ficha: Ficha = { ...borrador.ficha, datos }
    const compuerta = evaluarCompuerta(PERFILES[borrador.perfil], ficha)
    if (!compuerta.habilitado) {
      return {
        output: {
          bloqueado: true,
          faltantes: compuerta.faltantes,
          siguientes: compuerta.siguientes,
        },
        summary: 'Ajuste bloqueado: faltan datos',
        cubicador: estadoCubicador(borrador),
      }
    }

    const params = await cargarParametros(ctx.pool)
    // El motor recalcula las cantidades; los ajustes manuales se reaplican encima.
    const recalculo = cubicar(borrador.perfil, ficha, params)
    const idsValidos = new Set(recalculo.items.map(i => i.id))
    const desconocidos: string[] = []
    for (const id of quitar) {
      if (idsValidos.has(id)) {
        if (!ajustes.quitar.includes(id)) ajustes.quitar.push(id)
      } else desconocidos.push(id)
    }
    for (const c of cambios) {
      const id = typeof c.id === 'string' ? c.id : ''
      if (!idsValidos.has(id)) {
        desconocidos.push(id)
        continue
      }
      if (typeof c.cantidad === 'number' && Number.isFinite(c.cantidad) && c.cantidad > 0) {
        ajustes.cantidades[id] = c.cantidad
      }
      if (typeof c.precio_unitario === 'number' && c.precio_unitario >= 0) {
        ajustes.precios[id] = {
          precio_unitario: c.precio_unitario,
          ...(typeof c.tienda === 'string' ? { tienda: scrubPii(c.tienda) } : {}),
        }
      }
    }

    // Quitar, cantidades y precios manuales se aplican con el helper compartido; luego se
    // conservan los precios resueltos de los ítems que no cambiaron (o con cantidad fijada).
    const anteriores = new Map(previo.items.map(i => [i.id, i]))
    const items: ItemListado[] = aplicarAjustes(recalculo, ajustes).items.map(item => {
      const anterior = anteriores.get(item.id)
      const conservar =
        anterior &&
        !ajustes.precios[item.id] &&
        (ajustes.cantidades[item.id] !== undefined || anterior.cantidad === item.cantidad)
      if (!conservar) return item
      const copia = { ...item }
      copiarPrecio(copia, anterior)
      return copia
    })

    // Igual que cubicar: catálogo y caché al recalcular, para que un ingreso encadenado no falle (F3).
    const resultado: ResultadoCubicacion = await resolverPreciosCatalogo(ctx.pool, {
      ...recalculo,
      items,
    })
    const fichaFinal: Ficha = {
      ...ficha,
      datos: { ...datos, ajustes_listado: ajustes },
    }
    const actualizado = await actualizarBorrador(
      ctx.pool,
      borrador.id,
      userId,
      { ficha: fichaFinal, resultado, estado: 'cubicado' },
      borrador.version
    )
    const estado = estadoCubicador(actualizado)
    return {
      output: {
        borrador_id: actualizado.id,
        items: resumirItems(items),
        supuestos: resultado.supuestos,
        advertencias: resultado.advertencias,
        precios_pendientes: estado.precios_pendientes,
        ...(desconocidos.length ? { ids_desconocidos: desconocidos } : {}),
      },
      summary: `Listado ajustado: ${items.length} ítems, ${estado.precios_pendientes} sin precio aún`,
      cubicador: estado,
    }
  },
}

// ── ingresar_listado_a_cotizacion ───────────────────────────────────

interface ArgsIngreso extends Objeto {
  borrador_id: string
  version: number
  snapshot: ResultadoCubicacion
  quotation_id?: string
  cliente?: ClientRecord
  dias: number | null
  dotacion: number | null
  comuna: string | null
  descripcion_trabajo: string | null
}

export const ingresarListadoTool: AgentTool = {
  name: 'ingresar_listado_a_cotizacion',
  description:
    'Propone ingresar el listado cubicado a la cotización abierta (o a una nueva para el cliente indicado). Queda pendiente hasta que el usuario confirme lo que se le muestra.',
  parameters: {
    type: 'object',
    properties: {
      borrador_id: BORRADOR_ID_PARAM,
      cliente_nombre: {
        type: 'string',
        description:
          'Cliente para crear una cotización nueva. Omítelo si hay una cotización abierta.',
      },
    },
  },
  kind: 'write',
  roles: ROLES,
  describe: args => {
    const a = args as Partial<ArgsIngreso>
    if (!a.snapshot) return 'Ingresar el listado cubicado a una cotización'
    const destino = a.quotation_id
      ? 'a la cotización abierta'
      : `en una cotización nueva para ${a.cliente?.name ?? 'el cliente indicado'}`
    return describirListado(a.snapshot, destino)
  },
  // Foto del listado y de la versión del borrador, y destino resuelto: lo que
  // se muestra es exactamente lo que se ingresa al confirmar.
  prepare: async (args, ctx) => {
    const borrador = await resolverBorrador(args, ctx)
    if (borrador.estado === 'ingresado') throw httpError('El borrador ya fue ingresado.', 409)
    if (borrador.estado !== 'cubicado' || !borrador.resultado) {
      throw httpError('Primero hay que cubicar el borrador.', 422)
    }
    const snapshot = borrador.resultado
    const comuna = borrador.ficha.datos.comuna
    const salida: ArgsIngreso = {
      borrador_id: borrador.id,
      version: borrador.version,
      snapshot,
      dias: snapshot.dotacion?.dias ?? null,
      dotacion: snapshot.dotacion?.personas ?? null,
      comuna: typeof comuna === 'string' && comuna.trim() ? comuna.trim() : null,
      descripcion_trabajo: borrador.ficha.descripcion
        ? scrubPii(borrador.ficha.descripcion).slice(0, 200)
        : null,
    }
    // F3: no se ingresa mientras haya precios por consultar.
    const pendientes = snapshot.items.filter(i => i.estado_precio === 'pendiente').length
    if (pendientes > 0) {
      throw httpError(
        'Faltan precios por consultar: espera a que termine la consulta de precios.',
        422
      )
    }
    // F9: un cliente indicado explícitamente crea una cotización nueva aunque haya una abierta.
    const nombre = typeof args.cliente_nombre === 'string' ? args.cliente_nombre.trim() : ''
    if (ctx.quotationId && !nombre) {
      await verificarCotizacionEditable(ctx.pool, ctx.quotationId, ctx.userRole)
      salida.quotation_id = ctx.quotationId
    } else if (nombre) {
      salida.cliente = await resolveClientByName(ctx.pool, nombre)
    } else {
      throw httpError(
        'No hay una cotización abierta. Indica la cotización o el cliente para crear una nueva.',
        422
      )
    }
    return salida
  },
  // Trabaja solo con los argumentos guardados: al confirmar no hay cotización abierta.
  execute: async (args, ctx): Promise<AgentToolResult> => {
    const userId = exigirUsuario(ctx)
    const a = args as ArgsIngreso
    const borrador = await obtenerBorrador(ctx.pool, a.borrador_id, userId)
    if (!borrador) throw httpError('Borrador no encontrado', 404)
    if (borrador.estado === 'ingresado') {
      throw httpError('Este listado ya fue ingresado a una cotización.', 409)
    }
    if (borrador.estado !== 'cubicado' || borrador.version !== a.version) {
      throw httpError(
        'El borrador cambió después de proponer el ingreso; vuelve a proponerlo.',
        409
      )
    }

    // Se reclama el borrador antes de escribir: una segunda confirmación ya no pasa.
    await actualizarBorrador(
      ctx.pool,
      borrador.id,
      userId,
      { estado: 'ingresado' },
      borrador.version
    )

    const manualLineas = aLineas(a.snapshot)
    const input = {
      dias: a.dias,
      dotacion: a.dotacion,
      comuna: a.comuna,
      manualLineas,
      materiales: manualLineas.map(l => l.descripcion),
    }
    const opCtx = { instruction: ctx.instruction, userId: ctx.userId, llmProvider: ctx.model }
    let quotationId: string
    let correlativo: string
    let agregados: number
    let mutada: unknown
    try {
      if (a.quotation_id) {
        const op = await addLinesToQuotationOp(ctx.pool, a.quotation_id, input, {
          ...opCtx,
          role: ctx.userRole,
        })
        quotationId = a.quotation_id
        correlativo = op.existing.correlative
        agregados = op.addedCount
        mutada = op.updated
      } else if (a.cliente) {
        const op = await createQuotationOp(
          ctx.pool,
          { ...input, client: a.cliente, descripcionTrabajo: a.descripcion_trabajo },
          opCtx
        )
        quotationId = op.result.quotation.id
        correlativo = op.result.quotation.correlative
        agregados = op.lineas.length
        mutada = op.result.quotation
      } else {
        throw httpError('La acción no tiene cotización ni cliente de destino.', 422)
      }
    } catch (err) {
      // Si no se escribió nada, el borrador vuelve a estar disponible para reintentar.
      await obtenerBorrador(ctx.pool, borrador.id, userId)
        .then(b =>
          b ? actualizarBorrador(ctx.pool, b.id, userId, { estado: 'cubicado' }, b.version) : null
        )
        .catch(e => logger.error('Cubicador: no se pudo reabrir el borrador', { error: String(e) }))
      throw err
    }

    const final = await obtenerBorrador(ctx.pool, borrador.id, userId)
    let estado
    if (final) {
      try {
        const vinculado = await actualizarBorrador(
          ctx.pool,
          final.id,
          userId,
          { quotation_id: quotationId },
          final.version
        )
        estado = estadoCubicador(vinculado)
      } catch (e) {
        logger.warn('Cubicador: no se pudo vincular el borrador a la cotización', {
          error: String(e),
        })
        estado = estadoCubicador(final)
      }
    }

    return {
      output: {
        ingresado: true,
        quotation_id: quotationId,
        correlativo,
        items_agregados: agregados,
        advertencia: manualItemsWarning(manualLineas),
      },
      summary: `Ingresó el listado cubicado (${agregados} líneas) en la cotización ${correlativo}`,
      mutatedQuotation: mutada,
      ...(estado ? { cubicador: estado } : {}),
    }
  },
}

export const CUBICADOR_TOOLS: AgentTool[] = [
  entrevistarObraTool,
  cubicarBorradorTool,
  ajustarListadoTool,
  ingresarListadoTool,
]
