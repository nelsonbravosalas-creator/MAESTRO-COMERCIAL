import { Router } from 'express'
import { Pool, PoolClient } from 'pg'
import { logger } from '../utils/logger'
import { authMiddleware, AuthRequest, roleMiddleware } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { uuidParams, paginationQuerySchema } from '../schemas/common'
import {
  quotationCreateSchema,
  quotationUpdateSchema,
  quotationStatusSchema,
  quotationDuplicateSchema,
  quotationBillingSplitSchema,
  quotationLossSchema,
  quotationFollowUpSchema,
  quotationMilestoneSchema,
  quotationActivitySchema,
  quotationVersionReasonSchema,
  quotationApprovalSchema,
} from '../schemas/quotations'
import { decodeCursor, buildPage } from '../utils/pagination'

const VALID_STATUSES = ['Borrador', 'Emitida', 'En revisión', 'Enviada', 'Perdida', 'Adjudicada', 'Anulada', 'Cerrada']
const VALID_OPER_STATES = ['Pendiente de ejecución', 'En ejecución', 'Terminada']
const CATEGORY_IDS = ['mo', 'log', 'mat', 'rep', 'ins']
const TERM_TYPES = ['scope', 'exclusion', 'commercial']
const CATEGORY_LABELS: Record<string, string> = {
  mo: 'Mano de Obra Especializada',
  log: 'Logistica y Operacion',
  mat: 'Provision de Materiales',
  rep: 'Suministro Equipos o Repuestos',
  ins: 'Insumos Industriales y Gases',
}
const CATEGORY_COLORS: Record<string, string> = {
  mo: '#1e293b',
  log: '#475569',
  mat: '#1e3a8a',
  rep: '#312e81',
  ins: '#164e63',
}

const VALID_KINDS = ['project', 'maintenance']
const VALID_FREQUENCIES = ['mensual', 'trimestral', 'semestral', 'anual']

const normalizeStatus = (status: string | undefined) =>
  VALID_STATUSES.includes(status ?? '') ? status : 'Borrador'

const normalizeOperState = (state: string | undefined | null) =>
  state && VALID_OPER_STATES.includes(state) ? state : null

const normalizeKind = (kind: string | undefined | null) =>
  VALID_KINDS.includes(kind ?? '') ? (kind as string) : 'project'

const normalizeFrequency = (frequency: string | undefined | null) =>
  frequency && VALID_FREQUENCIES.includes(frequency) ? frequency : null

const paramString = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : (value ?? '')

const quotationSelect = `
  SELECT q.*, c.name AS client_name, cc.name AS contact_name
    FROM quotations q
    LEFT JOIN clients c ON c.id = q.client_id
    LEFT JOIN client_contacts cc ON cc.id = q.contact_id
`

const totalsFor = async (db: Pool | PoolClient, quotationId: string, ivaPctOverride?: number) => {
  const [totalsResult, ivaPctResult] = await Promise.all([
    db.query('SELECT * FROM v_quotation_totals WHERE quotation_id = $1', [quotationId]),
    ivaPctOverride !== undefined
      ? Promise.resolve(null)
      : db.query('SELECT iva_pct FROM quotations WHERE id = $1', [quotationId]),
  ])

  const totals = totalsResult.rows[0] ?? {
    quotation_id: quotationId,
    costo_neto: 0,
    venta_neta: 0,
    beneficio_bruto: 0,
  }

  const venta = Number(totals.venta_neta) || 0
  const ivaPct = ivaPctOverride ?? (Number(ivaPctResult?.rows[0]?.iva_pct) || 19)
  return {
    ...totals,
    iva_monto: venta * (ivaPct / 100),
    total_con_iva: venta * (1 + ivaPct / 100),
  }
}

const fullQuotation = async (db: Pool | PoolClient, quotationId: string) => {
  const quotation = await db.query(
    `${quotationSelect}
      WHERE q.id = $1
        AND q.deleted_at IS NULL`,
    [quotationId]
  )

  if (quotation.rows.length === 0) return null

  const [categories, lineItems, terms, totals] = await Promise.all([
    db.query('SELECT * FROM quotation_categories WHERE quotation_id = $1 ORDER BY sort_order', [
      quotationId,
    ]),
    db.query(
      'SELECT * FROM quotation_line_items WHERE quotation_id = $1 ORDER BY sort_order, created_at',
      [quotationId]
    ),
    db.query('SELECT * FROM quotation_terms WHERE quotation_id = $1 ORDER BY sort_order', [
      quotationId,
    ]),
    totalsFor(db, quotationId, Number(quotation.rows[0].iva_pct) || 19),
  ])

  return {
    ...quotation.rows[0],
    categories: categories.rows,
    line_items: lineItems.rows,
    terms: terms.rows,
    totals,
  }
}

const replaceChildren = async (db: PoolClient, quotationId: string, body: any) => {
  await db.query('DELETE FROM quotation_terms WHERE quotation_id = $1', [quotationId])
  await db.query('DELETE FROM quotation_line_items WHERE quotation_id = $1', [quotationId])
  await db.query('DELETE FROM quotation_categories WHERE quotation_id = $1', [quotationId])

  if (Array.isArray(body.categories)) {
    for (const [idx, category] of body.categories.entries()) {
      if (!CATEGORY_IDS.includes(category.category_id)) continue
      await db.query(
        `INSERT INTO quotation_categories
          (quotation_id, category_id, label, margin_pct, color, note, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          quotationId,
          category.category_id,
          category.label || category.category_id,
          Number(category.margin_pct) || 0,
          category.color || null,
          category.note || null,
          Number(category.sort_order ?? idx),
        ]
      )
    }
  }

  if (Array.isArray(body.line_items)) {
    for (const [idx, item] of body.line_items.entries()) {
      if (!CATEGORY_IDS.includes(item.category_id) || !item.description) continue
      await db.query(
        `INSERT INTO quotation_line_items
          (quotation_id, category_id, catalog_item_id, description, unit_name,
           quantity, days, unit_price, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          quotationId,
          item.category_id,
          item.catalog_item_id || null,
          item.description,
          item.unit_name || 'Und',
          Number(item.quantity) || 0,
          Math.max(1, Number(item.days) || 1),
          Number(item.unit_price) || 0,
          Number(item.sort_order ?? idx),
        ]
      )
    }
  }

  if (Array.isArray(body.terms)) {
    for (const [idx, term] of body.terms.entries()) {
      if (!['scope', 'exclusion', 'commercial'].includes(term.term_type) || !term.content) continue
      await db.query(
        `INSERT INTO quotation_terms (quotation_id, term_type, content, sort_order)
         VALUES ($1, $2, $3, $4)`,
        [quotationId, term.term_type, term.content, Number(term.sort_order ?? idx)]
      )
    }
  }
}

const normalizeText = (value: string) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/["']/g, '')
    .replace(/\s+/g, ' ')
    .trim()

const normalizeRutDigits = (value: string) =>
  String(value ?? '')
    .replace(/[^0-9kK]/g, '')
    .toUpperCase()

const normalizeRut = (value: string) => {
  const raw = normalizeRutDigits(value)
  if (raw.length < 2) return null
  return `${raw.slice(0, -1)}-${raw.slice(-1)}`
}

const isValidRut = (value: string) => {
  const raw = normalizeRutDigits(value)
  if (!/^\d{1,8}[0-9K]$/.test(raw)) return false
  const body = raw.slice(0, -1)
  const dv = raw.slice(-1)
  let sum = 0
  let multiplier = 2
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * multiplier
    multiplier = multiplier === 7 ? 2 : multiplier + 1
  }
  const expectedValue = 11 - (sum % 11)
  const expected = expectedValue === 11 ? '0' : expectedValue === 10 ? 'K' : String(expectedValue)
  return dv === expected
}

const parseNumber = (value: any) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : NaN
}

const validateImportPayload = (body: any) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { status: 400, payload: { error: 'Payload malformado' } }
  }
  if (body.esquema_version !== '1.0') {
    return { status: 422, payload: { error: 'esquema_version debe ser 1.0' } }
  }
  if (!body.correlative || !/^SYM-\d{3}-\d{2}-\d{4}$/.test(String(body.correlative))) {
    return {
      status: 422,
      payload: {
        error: 'Correlativo invalido',
        message:
          'El correlativo debe cumplir el formato SYM-000-MM-YYYY. Ejemplo: SYM-006-07-2026.',
      },
    }
  }
  if (!body.cliente?.nombre || !body.cliente?.rut) {
    return { status: 422, payload: { error: 'cliente.nombre y cliente.rut son requeridos' } }
  }
  if (!isValidRut(body.cliente.rut)) {
    return {
      status: 422,
      payload: {
        error: 'RUT invalido',
        message: 'El RUT del cliente no tiene digito verificador valido.',
      },
    }
  }
  if (!Array.isArray(body.lineas) || body.lineas.length === 0) {
    return { status: 422, payload: { error: 'Debe incluir al menos una linea' } }
  }
  if (body.lineas.length > 500) {
    return { status: 400, payload: { error: 'Maximo 500 lineas por importacion' } }
  }
  for (const [idx, line] of body.lineas.entries()) {
    const categoryId = line?.category_id
    const cantidad = parseNumber(line?.cantidad)
    const dias = parseNumber(line?.dias ?? 1)
    const precio = parseNumber(line?.precio_unitario)
    if (!CATEGORY_IDS.includes(categoryId)) {
      return { status: 422, payload: { error: `lineas[${idx}].category_id invalido` } }
    }
    if (!Number.isFinite(cantidad) || cantidad < 0) {
      return { status: 422, payload: { error: `lineas[${idx}].cantidad debe ser >= 0` } }
    }
    if (!Number.isFinite(dias) || dias < 1) {
      return { status: 422, payload: { error: `lineas[${idx}].dias debe ser >= 1` } }
    }
    if (!Number.isFinite(precio) || precio < 0) {
      return { status: 422, payload: { error: `lineas[${idx}].precio_unitario debe ser >= 0` } }
    }
  }
  for (const category of body.categorias ?? []) {
    if (!CATEGORY_IDS.includes(category?.category_id)) {
      return {
        status: 422,
        payload: { error: `categorias.category_id invalido: ${category?.category_id}` },
      }
    }
  }
  for (const termType of Object.keys(body.terminos ?? {})) {
    if (!TERM_TYPES.includes(termType)) {
      return { status: 422, payload: { error: `term_type invalido: ${termType}` } }
    }
    if (!Array.isArray(body.terminos[termType])) {
      return { status: 422, payload: { error: `terminos.${termType} debe ser un arreglo` } }
    }
  }
  return null
}

const suggestNextCorrelative = async (db: Pool | PoolClient, correlative: string) => {
  const match = correlative.match(/^SYM-\d{3}-(\d{2})-(\d{4})$/)
  if (!match) return null
  const [, month, year] = match
  const result = await db.query('SELECT correlative FROM quotations WHERE correlative LIKE $1', [
    `SYM-%-${month}-${year}`,
  ])
  const used = new Set(
    result.rows
      .map((row: any) => String(row.correlative).match(/^SYM-(\d{3})-\d{2}-\d{4}$/)?.[1])
      .filter((n: string | undefined): n is string => Boolean(n))
      .map((n: string) => Number(n))
  )
  let next = 1
  while (used.has(next)) next++
  return `SYM-${String(next).padStart(3, '0')}-${month}-${year}`
}

const fetchUfValue = async () => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    const res = await fetch('https://mindicador.cl/api/uf', { signal: controller.signal })
    if (!res.ok) throw new Error(`mindicador ${res.status}`)
    const data: any = await res.json()
    const value = Number(data?.serie?.[0]?.valor)
    if (!Number.isFinite(value) || value <= 0) throw new Error('UF response without valid value')
    return value
  } finally {
    clearTimeout(timer)
  }
}

const resolveUf = async (body: any) => {
  const manual = Number(body.uf_manual)
  if (Number.isFinite(manual) && manual > 0) {
    return { valor: manual, fuente: 'manual' as const }
  }
  const value = await fetchUfValue()
  return { valor: value, fuente: 'mindicador' as const }
}

const findCatalogMatch = async (db: PoolClient, categoryId: string, description: string) => {
  const normalized = normalizeText(description)
  const result = await db.query(
    `SELECT id, description
       FROM catalog_items
      WHERE category_id = $1
        AND is_active = true`,
    [categoryId]
  )
  const candidates = result.rows.map((row: any) => ({
    id: row.id,
    description: row.description,
    normalized: normalizeText(row.description),
  }))

  const exact = candidates.filter(c => c.normalized === normalized)
  if (exact.length === 1) return { catalogItemId: exact[0].id, motivo: null as string | null }
  if (exact.length > 1) return { catalogItemId: null, motivo: 'ambiguo' }

  const contained = candidates.filter(
    c => c.normalized && (normalized.includes(c.normalized) || c.normalized.includes(normalized))
  )
  if (contained.length === 1)
    return { catalogItemId: contained[0].id, motivo: null as string | null }
  if (contained.length > 1) return { catalogItemId: null, motivo: 'ambiguo' }
  return { catalogItemId: null, motivo: 'sin_match' }
}

const upsertImportClient = async (db: PoolClient, body: any, userId: string | null) => {
  const input = body.cliente
  const normalizedRut = normalizeRut(input.rut)!
  const rutDigits = normalizeRutDigits(normalizedRut)
  const existing = await db.query(
    `SELECT *
       FROM clients
      WHERE regexp_replace(COALESCE(rut, ''), '[^0-9kK]', '', 'g') = $1
        AND deleted_at IS NULL
      LIMIT 1`,
    [rutDigits]
  )

  let action: 'existente' | 'creado' = 'existente'
  let clientRow: any
  if (existing.rows[0]) {
    clientRow = existing.rows[0]
    const updated = await db.query(
      `UPDATE clients
          SET activity = COALESCE(activity, $1),
              address = COALESCE(address, $2),
              city = COALESCE(city, $3),
              updated_at = NOW()
        WHERE id = $4
        RETURNING *`,
      [input.actividad || null, input.direccion || null, input.ciudad || null, clientRow.id]
    )
    clientRow = updated.rows[0]
  } else {
    action = 'creado'
    const inserted = await db.query(
      `INSERT INTO clients (name, rut, activity, address, city, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.nombre,
        normalizedRut,
        input.actividad || null,
        input.direccion || null,
        input.ciudad || null,
        userId,
      ]
    )
    clientRow = inserted.rows[0]
  }

  let contactId: string | null = null
  const contact = input.contacto
  const contactName = String(contact?.nombre ?? '').trim()
  const contactEmail = String(contact?.email ?? '').trim()
  if (contact && (contactName || contactEmail)) {
    const contactResult = contactEmail
      ? await db.query(
          "SELECT * FROM client_contacts WHERE client_id = $1 AND lower(COALESCE(email, '')) = lower($2) LIMIT 1",
          [clientRow.id, contactEmail]
        )
      : await db.query('SELECT * FROM client_contacts WHERE client_id = $1 AND name = $2 LIMIT 1', [
          clientRow.id,
          contactName,
        ])

    if (contactResult.rows[0]) {
      const updated = await db.query(
        `UPDATE client_contacts
            SET name = COALESCE(NULLIF($1, ''), name),
                cargo = COALESCE(cargo, $2),
                email = COALESCE(NULLIF(email, ''), $3),
                phone = COALESCE(phone, $4),
                updated_at = NOW()
          WHERE id = $5
          RETURNING id`,
        [
          contactName,
          contact?.cargo || null,
          contactEmail || null,
          contact?.telefono || null,
          contactResult.rows[0].id,
        ]
      )
      contactId = updated.rows[0].id
    } else {
      const hasPrimary = await db.query(
        'SELECT 1 FROM client_contacts WHERE client_id = $1 AND is_primary = true LIMIT 1',
        [clientRow.id]
      )
      const inserted = await db.query(
        `INSERT INTO client_contacts (client_id, name, cargo, email, phone, is_primary)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          clientRow.id,
          contactName || contactEmail,
          contact?.cargo || null,
          contactEmail || null,
          contact?.telefono || null,
          hasPrimary.rows.length === 0,
        ]
      )
      contactId = inserted.rows[0].id
    }
  }

  return { action, clientId: clientRow.id as string, contactId }
}

export const createQuotationsRouter = (pool: Pool) => {
  const router = Router()
  router.use(authMiddleware)

  // A-11: paginación keyset por (created_at, id) DESC. `GET /api/quotations`
  // ya no trae la tabla completa en cada visita al listado — ver
  // docs/RIESGOS_ACEPTADOS.md para el resto de los listados (clients,
  // projects, invoices), que por ahora solo tienen un tope duro de filas.
  router.get('/', validate({ query: paginationQuerySchema }), async (req: AuthRequest, res) => {
    try {
      const { limit, cursor } = req.query as unknown as { limit: number; cursor?: string }
      const decoded = decodeCursor(cursor)

      const result = await pool.query(
        `SELECT q.*,
                c.name AS client_name,
                cc.name AS contact_name,
                COALESCE(vt.costo_neto, 0) AS costo_neto,
                COALESCE(vt.venta_neta, 0) AS venta_neta,
                COALESCE(vt.beneficio_bruto, 0) AS beneficio_bruto,
                COALESCE(vt.venta_neta, 0) * (1 + COALESCE(q.iva_pct, 19) / 100.0) AS total_con_iva,
                q.invoice_count_max,
                COALESCE(inv.invoice_count, 0)::int AS invoice_count
           FROM quotations q
           LEFT JOIN clients c ON c.id = q.client_id
           LEFT JOIN client_contacts cc ON cc.id = q.contact_id
          LEFT JOIN v_quotation_totals vt ON vt.quotation_id = q.id
          LEFT JOIN (
            SELECT quotation_id, COUNT(*)::int AS invoice_count
              FROM invoices
             WHERE deleted_at IS NULL AND quotation_id IS NOT NULL
               AND status <> 'cancelled'
             GROUP BY quotation_id
          ) inv ON inv.quotation_id = q.id
          WHERE q.deleted_at IS NULL
            AND ($2::timestamptz IS NULL OR (q.created_at, q.id) < ($2::timestamptz, $3::uuid))
          ORDER BY q.created_at DESC, q.id DESC
          LIMIT $1`,
        [limit + 1, decoded?.created_at ?? null, decoded?.id ?? null]
      )
      return res.json(buildPage(result.rows, limit))
    } catch (error: any) {
      logger.error('Get quotations error', { error: error.message })
      return res.status(500).json({ error: 'Failed to fetch quotations' })
    }
  })

  router.post('/import', async (req: AuthRequest, res) => {
    const validationError = validateImportPayload(req.body)
    if (validationError) return res.status(validationError.status).json(validationError.payload)

    const db = await pool.connect()
    try {
      const body = req.body
      const duplicate = await db.query('SELECT id FROM quotations WHERE correlative = $1 LIMIT 1', [
        body.correlative,
      ])
      if (duplicate.rows.length > 0) {
        const suggested = await suggestNextCorrelative(db, body.correlative)
        return res.status(409).json({
          error: 'Correlativo ya existe',
          message: `Correlativo ya existe: ${body.correlative}`,
          correlative: body.correlative,
          sugerido: suggested,
        })
      }

      await db.query('BEGIN')

      const client = await upsertImportClient(db, body, req.user?.id ?? null)
      let uf
      try {
        uf = await resolveUf(body)
      } catch (error: any) {
        const err = new Error(
          'No se pudo obtener UF automatica; reintente o envie uf_manual'
        ) as any
        err.status = 502
        err.cause = error
        throw err
      }

      const inserted = await db.query(
        `INSERT INTO quotations
          (correlative, client_id, contact_id, enduser, ref, date, valid_until,
           status, oper_state, uf_value, iva_pct, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, $6, 'Borrador', NULL, $7, $8, $9, $10)
         RETURNING *`,
        [
          body.correlative,
          client.clientId,
          client.contactId,
          body.enduser || null,
          body.ref || null,
          body.valid_until || null,
          uf.valor,
          Number(body.iva_pct) || 19,
          body.notes || null,
          req.user?.id ?? null,
        ]
      )
      const quotationId = inserted.rows[0].id

      const categoryInput = new Map<string, any>()
      for (const category of body.categorias ?? []) {
        if (CATEGORY_IDS.includes(category?.category_id))
          categoryInput.set(category.category_id, category)
      }
      for (const line of body.lineas) {
        if (!categoryInput.has(line.category_id)) {
          categoryInput.set(line.category_id, {
            category_id: line.category_id,
            label: CATEGORY_LABELS[line.category_id] ?? line.category_id,
            margin_pct: 30,
          })
        }
      }

      for (const categoryId of CATEGORY_IDS) {
        const category = categoryInput.get(categoryId)
        if (!category) continue
        await db.query(
          `INSERT INTO quotation_categories
            (quotation_id, category_id, label, margin_pct, color, note, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            quotationId,
            categoryId,
            category.label || CATEGORY_LABELS[categoryId] || categoryId,
            Number(category.margin_pct) || 30,
            category.color || CATEGORY_COLORS[categoryId] || null,
            category.note || null,
            CATEGORY_IDS.indexOf(categoryId),
          ]
        )
      }

      const unmatched: Array<{ descripcion: string; motivo: string }> = []
      let linkedCount = 0
      for (const [idx, line] of body.lineas.entries()) {
        const match = await findCatalogMatch(db, line.category_id, line.descripcion)
        if (match.catalogItemId) linkedCount++
        else unmatched.push({ descripcion: line.descripcion, motivo: match.motivo ?? 'sin_match' })

        await db.query(
          `INSERT INTO quotation_line_items
            (quotation_id, category_id, catalog_item_id, description, unit_name,
             quantity, days, unit_price, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            quotationId,
            line.category_id,
            match.catalogItemId,
            line.descripcion,
            line.unidad || 'Und',
            Number(line.cantidad) || 0,
            Math.max(1, Number(line.dias) || 1),
            Number(line.precio_unitario) || 0,
            idx,
          ]
        )
      }

      for (const termType of TERM_TYPES) {
        const terms = body.terminos?.[termType] ?? []
        for (const [idx, content] of terms.entries()) {
          if (!content) continue
          await db.query(
            `INSERT INTO quotation_terms (quotation_id, term_type, content, sort_order)
             VALUES ($1, $2, $3, $4)`,
            [quotationId, termType, String(content), idx]
          )
        }
      }

      await db.query('COMMIT')

      const created = await fullQuotation(pool, quotationId)
      return res.status(201).json({
        quotation: created,
        reporte_importacion: {
          cliente: { accion: client.action, client_id: client.clientId },
          uf,
          lineas_total: body.lineas.length,
          lineas_vinculadas_catalogo: linkedCount,
          lineas_sin_match: unmatched,
          advertencias: [],
        },
      })
    } catch (error: any) {
      await db.query('ROLLBACK').catch(() => {})
      logger.error('Import quotation error', { error: error.message, userId: req.user?.id })
      if (error.status === 502) {
        return res.status(502).json({
          error: 'No se pudo obtener UF automatica; reintente o envie uf_manual',
          message: 'No se pudo obtener UF automatica; reintente o envie uf_manual',
        })
      }
      if (error.code === '23505') {
        return res
          .status(409)
          .json({ error: 'Correlativo ya existe', message: 'Correlativo ya existe' })
      }
      return res
        .status(500)
        .json({ error: 'Failed to import quotation', message: 'No se pudo importar la cotizacion' })
    } finally {
      db.release()
    }
  })

  router.get('/:id', validate({ params: uuidParams('id') }), async (req: AuthRequest, res) => {
    const quotationId = paramString(req.params.id)
    try {
      const quotation = await fullQuotation(pool, quotationId)
      if (!quotation) return res.status(404).json({ error: 'Quotation not found' })
      return res.json(quotation)
    } catch (error: any) {
      logger.error('Get quotation error', { error: error.message, quotationId })
      return res.status(500).json({ error: 'Failed to fetch quotation' })
    }
  })

  router.post('/', validate({ body: quotationCreateSchema }), async (req: AuthRequest, res) => {
    const db = await pool.connect()
    try {
      const body = req.body as any

      await db.query('BEGIN')
      const result = await db.query(
        `INSERT INTO quotations
          (correlative, client_id, contact_id, enduser, ref, date, valid_until,
           status, oper_state, uf_value, iva_pct, notes, created_by,
           kind, equipment_count, equipment_description, frequency, visits_per_year,
           contract_start_date, show_uf_equivalent, show_usd_equivalent, usd_value)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                 $14, $15, $16, $17, $18, $19, $20, $21, $22)
         RETURNING *`,
        [
          body.correlative,
          body.client_id,
          body.contact_id || null,
          body.enduser || null,
          body.ref || null,
          body.date || new Date().toISOString().slice(0, 10),
          body.valid_until || null,
          normalizeStatus(body.status),
          normalizeOperState(body.oper_state),
          Number(body.uf_value) || 0,
          Number(body.iva_pct) || 19,
          body.notes || null,
          req.user?.id ?? null,
          normalizeKind(body.kind),
          body.equipment_count ?? null,
          body.equipment_description || null,
          normalizeFrequency(body.frequency),
          body.visits_per_year ?? null,
          body.contract_start_date || null,
          Boolean(body.show_uf_equivalent),
          Boolean(body.show_usd_equivalent),
          body.usd_value ?? null,
        ]
      )

      await replaceChildren(db, result.rows[0].id, body)
      await db.query('COMMIT')

      const created = await fullQuotation(pool, result.rows[0].id)
      return res.status(201).json(created)
    } catch (error: any) {
      await db.query('ROLLBACK')
      logger.error('Create quotation error', { error: error.message, userId: req.user?.id })
      if (error.code === '23505')
        return res.status(409).json({ error: 'Quotation correlative already exists' })
      return res.status(500).json({ error: 'Failed to create quotation' })
    } finally {
      db.release()
    }
  })

  const LOCKED_STATUSES = ['Adjudicada', 'Perdida', 'Anulada', 'Cerrada']

  router.put(
    '/:id',
    validate({ params: uuidParams('id'), body: quotationUpdateSchema }),
    async (req: AuthRequest, res) => {
      const db = await pool.connect()
      const quotationId = paramString(req.params.id)
      try {
        const body = req.body as any

        // Bloquear edición si la cotización está en estado final y el usuario no es admin
        if (req.user?.role !== 'admin') {
          const statusCheck = await pool.query(
            'SELECT status FROM quotations WHERE id = $1 AND deleted_at IS NULL',
            [quotationId]
          )
          if (statusCheck.rows.length === 0) {
            db.release()
            return res.status(404).json({ error: 'Quotation not found' })
          }
          if (LOCKED_STATUSES.includes(statusCheck.rows[0].status)) {
            db.release()
            return res.status(403).json({
              error: 'Forbidden',
              message: `Esta cotización está ${statusCheck.rows[0].status} y no puede ser modificada.`,
            })
          }
        }

        const expectedVersion = Number(body.version) || 1

        await db.query('BEGIN')
        // El WHERE version = $14 es el chequeo de concurrencia optimista: si otro
        // usuario guardó esta cotización entre que la cargamos y la guardamos,
        // el número de filas afectadas es 0 y lo tratamos como conflicto (409),
        // no como "no encontrado".
        const result = await db.query(
          `UPDATE quotations
            SET correlative = $1,
                client_id = $2,
                contact_id = $3,
                enduser = $4,
                ref = $5,
                date = $6,
                valid_until = $7,
                status = $8,
                oper_state = $9,
                uf_value = $10,
                iva_pct = $11,
                notes = $12,
                kind = $13,
                equipment_count = $14,
                equipment_description = $15,
                frequency = $16,
                visits_per_year = $17,
                contract_start_date = $18,
                show_uf_equivalent = $19,
                show_usd_equivalent = $20,
                usd_value = $21,
                version = version + 1,
                updated_at = NOW()
          WHERE id = $22
            AND deleted_at IS NULL
            AND version = $23
          RETURNING *`,
          [
            body.correlative,
            body.client_id,
            body.contact_id || null,
            body.enduser || null,
            body.ref || null,
            body.date || new Date().toISOString().slice(0, 10),
            body.valid_until || null,
            normalizeStatus(body.status),
            normalizeOperState(body.oper_state),
            Number(body.uf_value) || 0,
            Number(body.iva_pct) || 19,
            body.notes || null,
            normalizeKind(body.kind),
            body.equipment_count ?? null,
            body.equipment_description || null,
            normalizeFrequency(body.frequency),
            body.visits_per_year ?? null,
            body.contract_start_date || null,
            Boolean(body.show_uf_equivalent),
            Boolean(body.show_usd_equivalent),
            body.usd_value ?? null,
            quotationId,
            expectedVersion,
          ]
        )

        if (result.rows.length === 0) {
          const existing = await db.query(
            'SELECT version FROM quotations WHERE id = $1 AND deleted_at IS NULL',
            [quotationId]
          )
          await db.query('ROLLBACK')

          if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Quotation not found' })
          }
          return res.status(409).json({
            error: 'Version conflict',
            message:
              'Esta cotización fue modificada por otro usuario. Recarga los datos antes de guardar.',
            current_version: existing.rows[0].version,
          })
        }

        await replaceChildren(db, quotationId, body)
        await db.query('COMMIT')

        return res.json(await fullQuotation(pool, quotationId))
      } catch (error: any) {
        await db.query('ROLLBACK')
        logger.error('Update quotation error', { error: error.message, quotationId })
        if (error.code === '23505')
          return res.status(409).json({ error: 'Quotation correlative already exists' })
        return res.status(500).json({ error: 'Failed to update quotation' })
      } finally {
        db.release()
      }
    }
  )

  const updateStatus = async (req: AuthRequest, res: any) => {
    const quotationId = paramString(req.params.id)
    try {
      const { status, oper_state } = req.body
      const newStatus = normalizeStatus(status)

      const result = await pool.query(
        `UPDATE quotations
            SET status     = $1,
                oper_state = COALESCE($2, oper_state),
                updated_at = NOW()
          WHERE id = $3
            AND deleted_at IS NULL
          RETURNING id, status, oper_state, loss_reason, loss_competitor, loss_notes`,
        [newStatus, normalizeOperState(oper_state), quotationId]
      )

      if (result.rows.length === 0) return res.status(404).json({ error: 'Quotation not found' })

      // Auto-create project when status becomes 'Adjudicada' — no aplica a
      // contratos de mantención (kind='maintenance'): son visitas
      // recurrentes, no una obra puntual con fin.
      if (newStatus === 'Adjudicada') {
        try {
          const qRow = await pool.query(
            `SELECT q.client_id, q.correlative, q.kind, c.name AS client_name FROM quotations q LEFT JOIN clients c ON c.id = q.client_id WHERE q.id = $1`,
            [quotationId]
          )
          if (qRow.rows[0] && qRow.rows[0].kind !== 'maintenance') {
            const { client_id, correlative, client_name } = qRow.rows[0]
            // Check if a project for this quotation already exists
            const existing = await pool.query(
              `SELECT id FROM projects WHERE quotation_id = $1 AND deleted_at IS NULL LIMIT 1`,
              [quotationId]
            )
            if (existing.rows.length === 0) {
              const totals = await totalsFor(pool, quotationId)
              await pool.query(
                `INSERT INTO projects (quotation_id, client_id, name, status, budget, progress_pct, created_by)
                 VALUES ($1, $2, $3, 'planning', $4, 0, $5)`,
                [
                  quotationId,
                  client_id,
                  `Proyecto ${correlative} — ${client_name ?? ''}`,
                  Number(totals.venta_neta) || 0,
                  null,
                ]
              )
            }
          }
        } catch (autoErr) {
          logger.error('Auto-create project on Adjudicada error', autoErr)
          // Non-fatal: don't break the status update response
        }
      }

      return res.json(result.rows[0])
    } catch (error: any) {
      logger.error('Update quotation status error', { error: error.message, quotationId })
      return res.status(500).json({ error: 'Failed to update quotation status' })
    }
  }

  const statusValidation = validate({ params: uuidParams('id'), body: quotationStatusSchema })
  router.patch('/:id/status', roleMiddleware('admin', 'manager'), statusValidation, updateStatus)
  router.put('/:id/status', roleMiddleware('admin', 'manager'), statusValidation, updateStatus)

  // Configuración del número máximo de facturas para una cotización Adjudicada.
  // Solo se puede modificar mientras la cotización siga en estado Adjudicada.
  router.patch(
    '/:id/billing-split',
    roleMiddleware('admin', 'manager'),
    validate({ params: uuidParams('id'), body: quotationBillingSplitSchema }),
    async (req: AuthRequest, res) => {
      const quotationId = paramString(req.params.id)
      try {
        const result = await pool.query(
          `UPDATE quotations
              SET invoice_count_max = $1, updated_at = NOW()
            WHERE id = $2
              AND deleted_at IS NULL
              AND status = 'Adjudicada'
            RETURNING id, invoice_count_max`,
          [req.body.invoice_count_max, quotationId]
        )
        if (result.rows.length === 0)
          return res.status(404).json({ error: 'Quotation not found or not Adjudicada' })
        return res.json(result.rows[0])
      } catch (error: any) {
        logger.error('Update billing split error', { error: error.message, quotationId })
        return res.status(500).json({ error: 'Failed to update billing split' })
      }
    }
  )

  // ── Motivo de pérdida (endpoint separado) ─────────────────────────────────
  // El frontend guarda los datos de pérdida primero y luego cambia el estado.
  router.patch(
    '/:id/loss',
    roleMiddleware('admin', 'manager'),
    validate({ params: uuidParams('id'), body: quotationLossSchema }),
    async (req: AuthRequest, res) => {
      const id = paramString(req.params.id)
      const { loss_reason, loss_competitor, loss_notes } = req.body
      try {
        const result = await pool.query(
          `UPDATE quotations
              SET loss_reason     = $1::loss_reason,
                  loss_competitor = $2,
                  loss_notes      = $3,
                  updated_at      = NOW()
            WHERE id = $4 AND deleted_at IS NULL
            RETURNING id, loss_reason, loss_competitor, loss_notes`,
          [loss_reason, loss_competitor ?? null, loss_notes ?? null, id]
        )
        if (!result.rows.length) return res.status(404).json({ error: 'Quotation not found' })
        return res.json(result.rows[0])
      } catch (error: any) {
        logger.error('Update loss reason error', { error: error.message, id })
        return res.status(500).json({ error: 'Failed to update loss reason' })
      }
    }
  )

  // ── Follow-up date ────────────────────────────────────────────────────────
  router.patch(
    '/:id/follow-up',
    validate({ params: uuidParams('id'), body: quotationFollowUpSchema }),
    async (req: AuthRequest, res) => {
      const id = paramString(req.params.id)
      try {
        const result = await pool.query(
          `UPDATE quotations SET follow_up_date=$1, updated_at=NOW()
           WHERE id=$2 AND deleted_at IS NULL RETURNING id, follow_up_date`,
          [req.body.follow_up_date ?? null, id]
        )
        if (!result.rows.length) return res.status(404).json({ error: 'Not found' })
        return res.json(result.rows[0])
      } catch (error: any) {
        logger.error('Update follow-up date error', { error: error.message, id })
        return res.status(500).json({ error: 'Failed to update follow-up date' })
      }
    }
  )

  // ── Invoice milestones ─────────────────────────────────────────────────────
  router.get(
    '/:id/milestones',
    validate({ params: uuidParams('id') }),
    async (req: AuthRequest, res) => {
      const id = paramString(req.params.id)
      try {
        const result = await pool.query(
          `SELECT * FROM quotation_invoice_milestones WHERE quotation_id=$1 ORDER BY invoice_number`,
          [id]
        )
        return res.json({ milestones: result.rows })
      } catch (error: any) {
        logger.error('List milestones error', { error: error.message, id })
        return res.status(500).json({ error: 'Failed to list milestones' })
      }
    }
  )

  router.put(
    '/:id/milestones/:num',
    validate({ params: uuidParams('id'), body: quotationMilestoneSchema }),
    async (req: AuthRequest, res) => {
      const id = paramString(req.params.id)
      const num = parseInt(paramString(req.params.num), 10)
      if (num < 1 || num > 2) return res.status(400).json({ error: 'invoice_number must be 1 or 2' })
      try {
        const result = await pool.query(
          `INSERT INTO quotation_invoice_milestones (quotation_id, invoice_number, description, pct_of_total)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (quotation_id, invoice_number)
           DO UPDATE SET description=$3, pct_of_total=$4, updated_at=NOW()
           RETURNING *`,
          [id, num, req.body.description, req.body.pct_of_total ?? null]
        )
        return res.json(result.rows[0])
      } catch (error: any) {
        logger.error('Upsert milestone error', { error: error.message, id, num })
        if (error.code === '23503') return res.status(404).json({ error: 'Quotation not found' })
        return res.status(500).json({ error: 'Failed to upsert milestone' })
      }
    }
  )

  router.delete(
    '/:id/milestones/:num',
    validate({ params: uuidParams('id') }),
    async (req: AuthRequest, res) => {
      const id = paramString(req.params.id)
      const num = parseInt(paramString(req.params.num), 10)
      try {
        const result = await pool.query(
          `DELETE FROM quotation_invoice_milestones WHERE quotation_id=$1 AND invoice_number=$2 RETURNING id`,
          [id, num]
        )
        if (!result.rows.length) return res.status(404).json({ error: 'Milestone not found' })
        return res.json({ message: 'Milestone deleted' })
      } catch (error: any) {
        logger.error('Delete milestone error', { error: error.message, id, num })
        return res.status(500).json({ error: 'Failed to delete milestone' })
      }
    }
  )

  // ── Activities log ─────────────────────────────────────────────────────────
  router.get(
    '/:id/activities',
    validate({ params: uuidParams('id') }),
    async (req: AuthRequest, res) => {
      const id = paramString(req.params.id)
      try {
        const result = await pool.query(
          `SELECT a.*, u.name AS created_by_name
           FROM quotation_activities a
           LEFT JOIN users u ON u.id = a.created_by
           WHERE a.quotation_id=$1
           ORDER BY a.created_at DESC`,
          [id]
        )
        return res.json({ activities: result.rows })
      } catch (error: any) {
        logger.error('List activities error', { error: error.message, id })
        return res.status(500).json({ error: 'Failed to list activities' })
      }
    }
  )

  router.post(
    '/:id/activities',
    validate({ params: uuidParams('id'), body: quotationActivitySchema }),
    async (req: AuthRequest, res) => {
      const id = paramString(req.params.id)
      try {
        const result = await pool.query(
          `INSERT INTO quotation_activities (quotation_id, activity_type, content, created_by)
           VALUES ($1, $2, $3, $4) RETURNING *`,
          [id, req.body.activity_type, req.body.content, req.user?.id ?? null]
        )
        return res.status(201).json(result.rows[0])
      } catch (error: any) {
        logger.error('Create activity error', { error: error.message, id })
        if (error.code === '23503') return res.status(404).json({ error: 'Quotation not found' })
        return res.status(500).json({ error: 'Failed to create activity' })
      }
    }
  )

  router.delete(
    '/activities/:activityId',
    validate({ params: uuidParams('activityId') }),
    async (req: AuthRequest, res) => {
      const activityId = paramString(req.params.activityId)
      try {
        const result = await pool.query(
          `DELETE FROM quotation_activities WHERE id=$1 AND created_by=$2 RETURNING id`,
          [activityId, req.user?.id ?? null]
        )
        if (!result.rows.length)
          return res.status(404).json({ error: 'Activity not found or not authorized' })
        return res.json({ message: 'Activity deleted' })
      } catch (error: any) {
        logger.error('Delete activity error', { error: error.message, activityId })
        return res.status(500).json({ error: 'Failed to delete activity' })
      }
    }
  )

  // ── Version diff ───────────────────────────────────────────────────────────
  router.get(
    '/:id/version-diff',
    validate({ params: uuidParams('id') }),
    async (req: AuthRequest, res) => {
      const id = paramString(req.params.id)
      try {
        const result = await pool.query(
          `SELECT
            q.id, q.correlative, q.version, q.version_reason, q.parent_version_id,
            v.venta_neta, v.costo_neto, v.beneficio_bruto,
            v.beneficio_bruto / NULLIF(v.venta_neta,0) * 100 AS margen_pct
           FROM quotations q
           JOIN v_quotation_totals v ON v.quotation_id = q.id
           WHERE q.id = $1 OR q.id = (SELECT parent_version_id FROM quotations WHERE id = $1)`,
          [id]
        )
        return res.json({ versions: result.rows })
      } catch (error: any) {
        logger.error('Version diff error', { error: error.message, id })
        return res.status(500).json({ error: 'Failed to fetch version diff' })
      }
    }
  )

  // ── Internal approval ──────────────────────────────────────────────────────
  router.post(
    '/:id/approve',
    roleMiddleware('admin', 'manager'),
    validate({ params: uuidParams('id'), body: quotationApprovalSchema }),
    async (req: AuthRequest, res) => {
      const id = paramString(req.params.id)
      try {
        const result = await pool.query(
          `UPDATE quotations
             SET approved_by=$1, approved_at=NOW(), approval_notes=$2,
                 status='Emitida', updated_at=NOW()
           WHERE id=$3 AND deleted_at IS NULL AND status='En revisión'
           RETURNING id, status, approved_at`,
          [req.user!.id, req.body.approval_notes ?? null, id]
        )
        if (!result.rows.length)
          return res.status(404).json({ error: 'Not found or not pending approval' })
        return res.json(result.rows[0])
      } catch (error: any) {
        logger.error('Approve quotation error', { error: error.message, id })
        return res.status(500).json({ error: 'Failed to approve quotation' })
      }
    }
  )

  router.post(
    '/:id/duplicate',
    validate({ params: uuidParams('id'), body: quotationVersionReasonSchema }),
    async (req: AuthRequest, res) => {
      const db = await pool.connect()
      const quotationId = paramString(req.params.id)
      try {
        const source = await fullQuotation(pool, quotationId)
        if (!source) return res.status(404).json({ error: 'Quotation not found' })

        await db.query('BEGIN')
        const inserted = await db.query(
          `INSERT INTO quotations
          (correlative, client_id, contact_id, enduser, ref, date, valid_until,
           status, oper_state, uf_value, iva_pct, notes, version, created_by,
           kind, equipment_count, equipment_description, frequency, visits_per_year,
           contract_start_date, show_uf_equivalent, show_usd_equivalent, usd_value,
           version_reason, parent_version_id)
         VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, $6, $7, $8, $9, $10, $11, $12, $13,
                 $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
         RETURNING *`,
          [
            req.body.correlative,
            source.client_id,
            source.contact_id,
            source.enduser,
            source.ref,
            source.valid_until,
            'Borrador',
            source.oper_state,
            source.uf_value,
            source.iva_pct,
            source.notes,
            Number(source.version || 1) + 1,
            req.user?.id ?? null,
            source.kind,
            source.equipment_count,
            source.equipment_description,
            source.frequency,
            source.visits_per_year,
            source.contract_start_date,
            source.show_uf_equivalent,
            source.show_usd_equivalent,
            source.usd_value,
            req.body.version_reason,
            quotationId,
          ]
        )

        await replaceChildren(db, inserted.rows[0].id, source)
        await db.query('COMMIT')

        return res.status(201).json(await fullQuotation(pool, inserted.rows[0].id))
      } catch (error: any) {
        await db.query('ROLLBACK')
        logger.error('Duplicate quotation error', { error: error.message, quotationId })
        if (error.code === '23505')
          return res.status(409).json({ error: 'Quotation correlative already exists' })
        return res.status(500).json({ error: 'Failed to duplicate quotation' })
      } finally {
        db.release()
      }
    }
  )

  router.delete(
    '/:id',
    roleMiddleware('admin'),
    validate({ params: uuidParams('id') }),
    async (req: AuthRequest, res) => {
      try {
        const result = await pool.query(
          `UPDATE quotations
            SET deleted_at = NOW()
          WHERE id = $1
            AND deleted_at IS NULL
          RETURNING id`,
          [req.params.id]
        )

        if (result.rows.length === 0) return res.status(404).json({ error: 'Quotation not found' })
        return res.json({ message: 'Quotation deleted successfully' })
      } catch (error: any) {
        logger.error('Delete quotation error', { error: error.message, quotationId: req.params.id })
        return res.status(500).json({ error: 'Failed to delete quotation' })
      }
    }
  )

  return router
}
