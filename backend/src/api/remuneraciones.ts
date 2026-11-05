import { Router } from 'express'
import { Pool } from 'pg'
import { authMiddleware, roleMiddleware, type AuthRequest } from '../middleware/auth'
import { logger } from '../utils/logger'
import { validate } from '../middleware/validate'
import { uuidParams } from '../schemas/common'
import {
  calcularRemuneracionSchema,
  perfilInputsSchema,
  remuneracionParametrosSchema,
  type RemuneracionParametros,
} from '../schemas/remuneraciones'
import {
  DEFAULT_PARAMETROS,
  calcularPerfil,
  topesDerivados,
  type PerfilInputs,
} from '../services/remuneraciones'

// Calculadora de remuneraciones para los perfiles de Mano de Obra: sueldo
// líquido → costo empresa por día trabajado, que vuelve al precio unitario.
// El cálculo vive solo aquí (services/remuneraciones.ts); el cliente nunca
// manda el resultado, lo recalcula el servidor con los parámetros vigentes.
const mensaje = (error: unknown) => (error instanceof Error ? error.message : String(error))

export const createRemuneracionesRouter = (pool: Pool) => {
  const router = Router()
  router.use(authMiddleware)

  // Parámetros vigentes (fila sin superseded_at). Si no hay ninguna, se usan
  // los valores por defecto del motor.
  const cargarVigente = async (): Promise<{
    id: string | null
    params: RemuneracionParametros
  }> => {
    const result = await pool.query(
      `SELECT id, params FROM remuneraciones_parametros WHERE superseded_at IS NULL`
    )
    const row = result.rows[0]
    if (!row) return { id: null, params: DEFAULT_PARAMETROS }
    return { id: row.id, params: row.params as RemuneracionParametros }
  }

  router.get('/parametros', async (_req, res) => {
    try {
      const { id, params } = await cargarVigente()
      return res.json({ parametrosId: id, params, topes: topesDerivados(params) })
    } catch (error) {
      logger.error('Get remuneraciones parametros error', { error: mensaje(error) })
      return res.status(500).json({ error: 'Failed to fetch remuneraciones parametros' })
    }
  })

  // Cada guardado inserta una versión nueva y marca la anterior como reemplazada.
  // Es un par de sentencias en transacción: un UPDATE y un INSERT en un mismo
  // statement chocan con el índice único parcial (el UPDATE aún no es visible).
  router.put(
    '/parametros',
    roleMiddleware('admin'),
    validate({ body: remuneracionParametrosSchema }),
    async (req: AuthRequest, res) => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query(
          `UPDATE remuneraciones_parametros SET superseded_at = NOW() WHERE superseded_at IS NULL`
        )
        const result = await client.query(
          `INSERT INTO remuneraciones_parametros (params, created_by)
           VALUES ($1, $2)
           RETURNING id, params`,
          [JSON.stringify(req.body), req.user?.id ?? null]
        )
        await client.query('COMMIT')
        const row = result.rows[0]
        return res.json({
          parametrosId: row.id,
          params: row.params,
          topes: topesDerivados(row.params),
        })
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined)
        logger.error('Update remuneraciones parametros error', { error: mensaje(error) })
        return res.status(500).json({ error: 'Failed to update remuneraciones parametros' })
      } finally {
        client.release()
      }
    }
  )

  // Vista previa: calcula sin guardar. Si viene `params`, se usan esos en vez
  // de los vigentes (así la ventana de parámetros muestra el efecto antes de guardar).
  router.post(
    '/calcular',
    roleMiddleware('admin', 'manager'),
    validate({ body: calcularRemuneracionSchema }),
    async (req, res) => {
      try {
        const { inputs, params } = req.body
        const parametros = params ?? (await cargarVigente()).params
        return res.json(calcularPerfil(inputs, parametros))
      } catch (error) {
        logger.error('Calcular remuneracion error', { error: mensaje(error) })
        return res.status(500).json({ error: 'Failed to calculate remuneracion' })
      }
    }
  )

  router.get('/perfiles', async (_req, res) => {
    try {
      const result = await pool.query(
        `SELECT catalog_item_id, inputs, resultado, costo_diario, updated_at
           FROM remuneraciones_perfiles`
      )
      return res.json(result.rows)
    } catch (error) {
      logger.error('Get remuneraciones perfiles error', { error: mensaje(error) })
      return res.status(500).json({ error: 'Failed to fetch remuneraciones perfiles' })
    }
  })

  // Calcula con los parámetros vigentes, guarda el perfil y actualiza el
  // precio unitario del ítem en una sola sentencia (atómica).
  router.put(
    '/perfiles/:catalogItemId',
    roleMiddleware('admin', 'manager'),
    validate({ params: uuidParams('catalogItemId'), body: perfilInputsSchema }),
    async (req: AuthRequest, res) => {
      try {
        const catalogItemId = req.params.catalogItemId
        const inputs: PerfilInputs = req.body

        const item = await pool.query(
          `SELECT id FROM catalog_items WHERE id = $1 AND category_id = 'mo' AND is_active = true`,
          [catalogItemId]
        )
        if (item.rows.length === 0)
          return res.status(404).json({ error: 'Perfil de Mano de Obra no encontrado' })

        const { id: parametrosId, params } = await cargarVigente()
        const resultado = calcularPerfil(inputs, params)

        const result = await pool.query(
          `WITH perfil AS (
             INSERT INTO remuneraciones_perfiles
               (catalog_item_id, inputs, resultado, costo_diario, parametros_id, updated_by)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (catalog_item_id) DO UPDATE
               SET inputs = EXCLUDED.inputs,
                   resultado = EXCLUDED.resultado,
                   costo_diario = EXCLUDED.costo_diario,
                   parametros_id = EXCLUDED.parametros_id,
                   updated_by = EXCLUDED.updated_by,
                   updated_at = NOW()
             RETURNING catalog_item_id, inputs, resultado, costo_diario, updated_at
           ), precio AS (
             UPDATE catalog_items SET unit_price = $4 WHERE id = $1 RETURNING id
           )
           SELECT * FROM perfil`,
          [
            catalogItemId,
            JSON.stringify(inputs),
            JSON.stringify(resultado),
            resultado.costoDiarioTrabajado,
            parametrosId,
            req.user?.id ?? null,
          ]
        )
        return res.json(result.rows[0])
      } catch (error) {
        logger.error('Save remuneracion perfil error', {
          error: mensaje(error),
          id: req.params.catalogItemId,
        })
        return res.status(500).json({ error: 'Failed to save remuneracion perfil' })
      }
    }
  )

  // Recalcula todos los perfiles guardados con los parámetros vigentes y
  // actualiza sus precios unitarios. Devuelve el precio antes y después.
  router.post('/recalcular', roleMiddleware('admin'), async (_req, res) => {
    try {
      const { id: parametrosId, params } = await cargarVigente()
      const perfiles = await pool.query(
        `SELECT p.catalog_item_id, p.inputs, c.unit_price
           FROM remuneraciones_perfiles p
           JOIN catalog_items c ON c.id = p.catalog_item_id
          WHERE c.is_active = true`
      )
      if (perfiles.rows.length === 0) return res.json({ actualizados: [] })

      const actualizados = perfiles.rows.map(row => {
        const inputs = perfilInputsSchema.parse(row.inputs)
        const resultado = calcularPerfil(inputs, params)
        return {
          catalogItemId: row.catalog_item_id as string,
          precioAnterior: Number(row.unit_price),
          precioNuevo: resultado.costoDiarioTrabajado,
          resultado,
        }
      })

      await pool.query(
        `WITH datos AS (
           SELECT * FROM unnest($1::uuid[], $2::numeric[], $3::text[])
             AS d(id, costo, resultado)
         ), perfiles AS (
           UPDATE remuneraciones_perfiles p
              SET resultado = d.resultado::jsonb,
                  costo_diario = d.costo,
                  parametros_id = $4,
                  updated_at = NOW()
             FROM datos d
            WHERE p.catalog_item_id = d.id
         )
         UPDATE catalog_items c SET unit_price = d.costo FROM datos d WHERE c.id = d.id`,
        [
          actualizados.map(a => a.catalogItemId),
          actualizados.map(a => a.precioNuevo),
          actualizados.map(a => JSON.stringify(a.resultado)),
          parametrosId,
        ]
      )

      return res.json({
        actualizados: actualizados.map(({ catalogItemId, precioAnterior, precioNuevo }) => ({
          catalogItemId,
          precioAnterior,
          precioNuevo,
        })),
      })
    } catch (error) {
      logger.error('Recalcular remuneraciones error', { error: mensaje(error) })
      return res.status(500).json({ error: 'Failed to recalculate remuneraciones' })
    }
  })

  return router
}
