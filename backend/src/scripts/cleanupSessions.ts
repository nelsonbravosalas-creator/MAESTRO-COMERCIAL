import { Pool } from 'pg'
import dotenv from 'dotenv'
import { logger } from '../utils/logger'

dotenv.config()

// A-02, AC-2.10: borra sesiones expiradas hace más de 30 días. No toca sesiones
// vigentes ni revocadas recientemente (esas se conservan para poder investigar
// un incidente de seguridad — ver A-18).
//
// Poda además auth_throttle (migración 0019). La ventana más larga de ese
// contador es de 60 minutos, así que una fila de hace más de un día ya no
// influye en ninguna decisión: solo ocupa espacio. El margen es deliberado —
// borrar una fila cuya ventana sigue viva le regalaría al atacante un
// contador en cero.
async function cleanupSessions() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: true },
  })
  try {
    const result = await pool.query(
      `DELETE FROM sessions WHERE expires_at < NOW() - INTERVAL '30 days'`
    )
    logger.info('Session cleanup completed', { deleted: result.rowCount })
    console.log(`Sesiones eliminadas: ${result.rowCount}`)

    const throttle = await pool.query(
      `DELETE FROM auth_throttle WHERE window_start < NOW() - INTERVAL '1 day'`
    )
    logger.info('Auth throttle cleanup completed', { deleted: throttle.rowCount })
    console.log(`Contadores de intentos eliminados: ${throttle.rowCount}`)
  } catch (error) {
    logger.error('Session cleanup failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

cleanupSessions()
