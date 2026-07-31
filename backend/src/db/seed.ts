import { Pool } from 'pg'
import bcrypt from 'bcryptjs'
import dotenv from 'dotenv'
import { logger } from '../utils/logger'

dotenv.config()
dotenv.config({ path: '../.env.development.local', override: true })

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
})

interface SeedUser {
  email: string
  password: string
  name: string
  role: 'admin' | 'manager'
}

// Nunca hardcodear credenciales reales aquí: se leen del entorno para que este
// script nunca sea la fuente de un secreto versionado en git.
function readSeedUsers(): SeedUser[] {
  const users: SeedUser[] = []

  const adminEmail = process.env.SEED_ADMIN_EMAIL
  const adminPassword = process.env.SEED_ADMIN_PASSWORD
  if (adminEmail && adminPassword) {
    if (adminPassword.length < 8) {
      throw new Error('SEED_ADMIN_PASSWORD debe tener al menos 8 caracteres')
    }
    users.push({
      email: adminEmail,
      password: adminPassword,
      name: process.env.SEED_ADMIN_NAME || 'Admin',
      role: 'admin',
    })
  }

  const managerEmail = process.env.SEED_MANAGER_EMAIL
  const managerPassword = process.env.SEED_MANAGER_PASSWORD
  if (managerEmail && managerPassword) {
    if (managerPassword.length < 8) {
      throw new Error('SEED_MANAGER_PASSWORD debe tener al menos 8 caracteres')
    }
    users.push({
      email: managerEmail,
      password: managerPassword,
      name: process.env.SEED_MANAGER_NAME || 'Manager',
      role: 'manager',
    })
  }

  return users
}

async function seedUsers() {
  try {
    const users = readSeedUsers()

    if (users.length === 0) {
      logger.warn(
        'No hay usuarios para sembrar: defina SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD ' +
          '(y opcionalmente SEED_MANAGER_EMAIL/SEED_MANAGER_PASSWORD) en el entorno. ' +
          'Alternativa: POST /api/admin/setup con ADMIN_SETUP_SECRET.'
      )
      await pool.end()
      process.exit(0)
    }

    logger.info('Starting seed data insertion...')

    for (const user of users) {
      const result = await pool.query('SELECT id FROM users WHERE lower(email) = lower($1)', [
        user.email,
      ])

      const passwordHash = await bcrypt.hash(user.password, 10)

      if (result.rows.length > 0) {
        await pool.query(
          `UPDATE users
              SET password_hash = $1,
                  name = $2,
                  role = $3,
                  is_active = true,
                  failed_login_attempts = 0,
                  locked_until = NULL,
                  updated_at = NOW()
            WHERE lower(email) = lower($4)
              AND deleted_at IS NULL`,
          [passwordHash, user.name, user.role, user.email]
        )
        logger.info(`User ${user.email} already exists, password refreshed.`)
        continue
      }

      const insertResult = await pool.query(
        `INSERT INTO users (email, password_hash, name, role, is_active)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, email, name, role`,
        [user.email, passwordHash, user.name, user.role, true]
      )

      logger.info('User created successfully', {
        userId: insertResult.rows[0].id,
        email: user.email,
        role: user.role,
      })
    }

    logger.info('Seed data insertion completed successfully')
    await pool.end()
    process.exit(0)
  } catch (error: any) {
    logger.error('Seed data insertion failed', {
      error: error.message,
      stack: error.stack,
    })
    await pool.end()
    process.exit(1)
  }
}

seedUsers()
