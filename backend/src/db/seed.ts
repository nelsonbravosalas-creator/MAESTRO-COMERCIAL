import { Pool } from 'pg'
import bcrypt from 'bcrypt'
import dotenv from 'dotenv'
import { logger } from '../utils/logger'

dotenv.config()
dotenv.config({ path: '../.env.development.local', override: true })

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
})

async function seedUsers() {
  try {
    logger.info('Starting seed data insertion...')

    // Users to seed
    const users = [
      {
        email: 'nbravo.nbyb@gmail.com',
        password: '3571',
        name: 'Nelson Bravo',
        role: 'admin',
      },
      {
        email: 'hmeza.nbyb@gmail.com',
        password: '4321',
        name: 'H. Meza',
        role: 'manager',
      },
    ]

    // Check if users already exist
    for (const user of users) {
      const result = await pool.query(
        'SELECT id FROM users WHERE email = $1',
        [user.email]
      )

      // Hash password
      const passwordHash = await bcrypt.hash(user.password, 10)

      if (result.rows.length > 0) {
        await pool.query(
          `UPDATE users
              SET password_hash = $1,
                  name = $2,
                  role = $3,
                  is_active = true,
                  updated_at = NOW()
            WHERE lower(email) = lower($4)
              AND deleted_at IS NULL`,
          [passwordHash, user.name, user.role, user.email]
        )
        logger.info(`User ${user.email} already exists, password refreshed.`)
        continue
      }

      // Insert user
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
