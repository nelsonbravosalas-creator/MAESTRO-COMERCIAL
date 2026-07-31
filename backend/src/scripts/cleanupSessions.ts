import { Pool } from 'pg'
import dotenv from 'dotenv'
import { logger } from '../utils/logger'

dotenv.config()

// A-02, AC-2.10: borra sesiones expiradas hace más de 30 días. No toca sesiones
// vigentes ni revocadas recientemente (esas se conservan para poder investigar
// un incidente de seguridad — ver A-18).
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
  } catch (error: any) {
    logger.error('Session cleanup failed', { error: error.message })
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

cleanupSessions()
