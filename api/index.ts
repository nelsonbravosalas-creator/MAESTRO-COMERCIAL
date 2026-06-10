import type { Request, Response } from 'express'
import express from 'express'
import cors from 'cors'
import bodyParser from 'body-parser'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-maestro'
const HAS_DB = Boolean(process.env.DATABASE_URL)

// Usuarios de prueba hardcodeados (mismos hashes bcrypt del seed / db.json)
const TEST_USERS = [
  {
    id: 'a0000000-0000-0000-0000-000000000001',
    email: 'nbravo.nbyb@gmail.com',
    password_hash: '$2b$10$sMpV3Pa3KW7mOgm3JHh6U.sdS16onwr5D7kIxdiEozLslWcveKGeG',
    name: 'Nelson Bravo',
    role: 'admin',
    is_active: true,
  },
  {
    id: 'a0000000-0000-0000-0000-000000000002',
    email: 'hmeza.nbyb@gmail.com',
    password_hash: '$2b$10$P701tfm7c/.QJ30gJHVkm.MF7Vo1knDbuFSrqJShjgUI.E0mx7FfC',
    name: 'H. Meza',
    role: 'manager',
    is_active: true,
  },
]

let fallbackApp: express.Express | null = null

function buildFallbackApp(): express.Express {
  const app = express()
  app.use(cors({ origin: (_o, cb) => cb(null, true), credentials: true }))
  app.use(bodyParser.json())

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', mode: 'fallback-no-db', timestamp: new Date().toISOString() })
  })

  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body ?? {}
      const allowNoPIN = process.env.ALLOW_NO_PIN === 'true'

      if (!email) {
        return res.status(400).json({ error: 'Bad request', message: 'Email es requerido' })
      }
      if (!password && !allowNoPIN) {
        return res.status(400).json({ error: 'Bad request', message: 'PIN es requerido' })
      }

      const user = TEST_USERS.find(
        u => u.email.toLowerCase() === String(email).trim().toLowerCase()
      )

      if (!user || !user.is_active) {
        return res.status(401).json({ error: 'Unauthorized', message: 'Correo o PIN inválido' })
      }

      let valid = false
      if (password) {
        valid = await bcrypt.compare(String(password), user.password_hash)
      } else if (allowNoPIN) {
        valid = true
      }

      if (!valid) {
        return res.status(401).json({ error: 'Unauthorized', message: 'Correo o PIN inválido' })
      }

      const payload = { id: user.id, email: user.email, name: user.name, role: user.role }
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' } as jwt.SignOptions)
      const refresh_token = jwt.sign(
        { ...payload, kind: 'refresh' },
        JWT_SECRET,
        { expiresIn: '30d' } as jwt.SignOptions
      )

      return res.json({
        token,
        refresh_token,
        expires_in: 28800,
        expiresIn: 28800,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          is_active: user.is_active,
          last_login_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          sync_status: 'fallback',
        },
      })
    } catch (e: any) {
      return res.status(500).json({ error: 'Internal server error', message: e.message })
    }
  })

  app.post('/api/auth/refresh', (req: Request, res: Response) => {
    const { refresh_token } = req.body ?? {}
    if (!refresh_token) {
      return res.status(400).json({ error: 'Bad request', message: 'refresh_token requerido' })
    }
    try {
      const decoded = jwt.verify(refresh_token, JWT_SECRET) as any
      if (decoded.kind !== 'refresh') {
        return res.status(401).json({ error: 'Unauthorized', message: 'Token inválido' })
      }
      const { id, email, name, role } = decoded
      const token = jwt.sign({ id, email, name, role }, JWT_SECRET, { expiresIn: '8h' } as jwt.SignOptions)
      return res.json({ token, expires_in: 28800, expiresIn: 28800 })
    } catch {
      return res.status(401).json({ error: 'Unauthorized', message: 'Refresh token expirado o inválido' })
    }
  })

  // Resto de endpoints no disponibles en modo fallback
  app.use((_req: Request, res: Response) => {
    res.status(503).json({
      error: 'Service unavailable',
      message: 'DATABASE_URL no configurado. Solo /api/auth/login y /api/auth/refresh están disponibles.',
    })
  })

  return app
}

// Vercel requiere un export default que sea un request handler
export default async function handler(req: Request, res: Response) {
  if (HAS_DB) {
    // Lazy load del app PostgreSQL para evitar que pg.Pool falle cuando no hay DATABASE_URL
    const { default: pgApp } = await import('../backend/src/app')
    return pgApp(req, res)
  }

  if (!fallbackApp) {
    fallbackApp = buildFallbackApp()
  }
  return fallbackApp(req, res)
}
