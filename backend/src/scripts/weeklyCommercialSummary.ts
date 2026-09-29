import { Pool } from 'pg'
import dotenv from 'dotenv'
import { logger } from '../utils/logger'

dotenv.config()

interface ActivitySummary {
  activity_type: string
  total: number
}

interface QuotationSummary {
  status: string
  count: number
  total_uf: number
}

interface UserActivity {
  user_name: string
  activities_count: number
  quotations_created: number
}

/**
 * Genera el resumen semanal de actividades comerciales de BravoCRM / Maestro Comercial.
 * Este script puede ser ejecutado directamente o mediante un cron job programado (ej. Railway Cron o GitHub Actions).
 */
export async function generateWeeklySummary() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL no está configurada en las variables de entorno.')
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  })

  try {
    console.log('====================================================')
    console.log('📊 GENERANDO RESUMEN SEMANAL DE ACTIVIDAD COMERCIAL')
    console.log(`📅 Período: Últimos 7 días (${new Date().toLocaleDateString('es-CL')})`)
    console.log('====================================================\n')

    // 1. Resumen de Actividades Comerciales (Llamadas, Reuniones, Correos, etc.)
    const activitiesRes = await pool.query<ActivitySummary>(`
      SELECT 
        qa.activity_type, 
        COUNT(*)::int AS total
      FROM quotation_activities qa
      WHERE qa.created_at >= NOW() - INTERVAL '7 days'
      GROUP BY qa.activity_type
      ORDER BY total DESC;
    `)

    console.log('🔹 [1] ACTIVIDADES REGISTRADAS EN LA SEMANA:')
    if (activitiesRes.rows.length === 0) {
      console.log('   Sin actividades registradas en los últimos 7 días.')
    } else {
      let totalActs = 0
      activitiesRes.rows.forEach(row => {
        console.log(`   • ${row.activity_type.toUpperCase()}: ${row.total}`)
        totalActs += row.total
      })
      console.log(`   👉 Total actividades: ${totalActs}\n`)
    }

    // 2. Estado de Cotizaciones en la última semana
    const quotationsRes = await pool.query<QuotationSummary>(`
      SELECT 
        q.status, 
        COUNT(*)::int AS count,
        COALESCE(SUM(q.uf_value), 0)::numeric(12,2) AS total_uf
      FROM quotations q
      WHERE q.created_at >= NOW() - INTERVAL '7 days' 
         OR q.updated_at >= NOW() - INTERVAL '7 days'
      GROUP BY q.status
      ORDER BY count DESC;
    `)

    console.log('🔹 [2] COTIZACIONES GESTIONADAS / CREADAS:')
    if (quotationsRes.rows.length === 0) {
      console.log('   No se registraron cambios en cotizaciones en los últimos 7 días.')
    } else {
      quotationsRes.rows.forEach(row => {
        console.log(
          `   • Estado: ${row.status.padEnd(12)} | Cantidad: ${String(row.count).padStart(3)} | Total UF: ${Number(row.total_uf).toLocaleString('es-CL')}`
        )
      })
      console.log('')
    }

    // 3. Actividad por Ejecutivo / Usuario
    const userRes = await pool.query<UserActivity>(`
      SELECT 
        u.name AS user_name,
        COALESCE(acts.cnt, 0)::int AS activities_count,
        COALESCE(quotes.cnt, 0)::int AS quotations_created
      FROM users u
      LEFT JOIN (
        SELECT created_by, COUNT(*) as cnt 
        FROM quotation_activities 
        WHERE created_at >= NOW() - INTERVAL '7 days'
        GROUP BY created_by
      ) acts ON acts.created_by = u.id
      LEFT JOIN (
        SELECT created_by, COUNT(*) as cnt 
        FROM quotations 
        WHERE created_at >= NOW() - INTERVAL '7 days'
        GROUP BY created_by
      ) quotes ON quotes.created_by = u.id
      WHERE u.is_active = true AND (COALESCE(acts.cnt, 0) > 0 OR COALESCE(quotes.cnt, 0) > 0)
      ORDER BY (COALESCE(acts.cnt, 0) + COALESCE(quotes.cnt, 0)) DESC;
    `)

    console.log('🔹 [3] RENDIMIENTO POR EJECUTIVO COMERCIAL:')
    if (userRes.rows.length === 0) {
      console.log('   Sin movimientos asignados a ejecutivos en el período.')
    } else {
      userRes.rows.forEach(row => {
        console.log(
          `   👤 ${row.user_name}: ${row.quotations_created} cotizaciones creadas, ${row.activities_count} actividades registradas`
        )
      })
      console.log('')
    }

    console.log('====================================================')
    console.log('✅ Resumen completado con éxito.')
    console.log('====================================================')

    logger.info('Weekly commercial summary generated successfully')
  } catch (error) {
    logger.error('Error generando resumen semanal', { error })
    console.error('❌ Error al generar el resumen semanal:', error)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  generateWeeklySummary()
}
