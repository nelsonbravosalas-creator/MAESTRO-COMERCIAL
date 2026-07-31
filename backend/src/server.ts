import app, { pool } from './app'
import { env } from './config/env'
import { logger } from './utils/logger'

pool.connect().then(() => {
  logger.info('Connected to PostgreSQL database')
  app.listen(env.PORT, () => {
    logger.info(`BravoCRM API server running on port ${env.PORT}`)
  })
}).catch((err) => {
  logger.error('Failed to connect to database:', err)
  process.exit(1)
})

process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing HTTP server')
  await pool.end()
  process.exit(0)
})
