import express, { Express, Request, Response, NextFunction } from 'express'
import cors from 'cors'
import bodyParser from 'body-parser'
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'

dotenv.config()

const app: Express = express()
const port = process.env.PORT || 3000
const dbPath = path.join(__dirname, '../db.json')

// Tipo para DB JSON
interface DB {
  users: any[]
  clients: any[]
  quotations: any[]
  quotation_items: any[]
  projects: any[]
  execution_costs: any[]
  invoices: any[]
  invoice_items: any[]
  audit_logs: any[]
  sync_queue: any[]
}

// Cargar/guardar DB JSON
const loadDB = (): DB => {
  try {
    const data = fs.readFileSync(dbPath, 'utf-8')
    return JSON.parse(data)
  } catch (error) {
    console.error('Error cargando DB:', error)
    return {
      users: [],
      clients: [],
      quotations: [],
      quotation_items: [],
      projects: [],
      execution_costs: [],
      invoices: [],
      invoice_items: [],
      audit_logs: [],
      sync_queue: [],
    }
  }
}

const saveDB = (db: DB) => {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf-8')
  } catch (error) {
    console.error('Error guardando DB:', error)
  }
}

let db = loadDB()

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}))
app.use(bodyParser.json({ limit: '10mb' }))
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }))

// Logger middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`)
  next()
})

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: 'json-dev',
    mode: 'DEVELOPMENT (JSON Mode)',
  })
})

// AUTH ENDPOINTS
app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Email y password son requeridos',
      })
    }

    // Buscar usuario
    const user = db.users.find((u: any) => u.email === email)

    if (!user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Email o password inválidos',
      })
    }

    // Para desarrollo: permitir login con PIN directamente
    if (password !== '3571' && password !== '4321' && password !== user.password) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Email o password inválidos',
      })
    }

    // Generar JWT
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      process.env.JWT_SECRET || 'dev-secret',
      { expiresIn: '7d' }
    )

    console.log(`✓ Login exitoso: ${email}`)

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        is_active: user.is_active,
        created_at: user.created_at,
        updated_at: user.updated_at,
        sync_status: 'synced',
      },
      expiresIn: 7 * 24 * 60 * 60,
    })
  } catch (error: any) {
    console.error('Login error:', error.message)
    return res.status(500).json({ error: 'Server error' })
  }
})

app.get('/api/auth/me', (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader) {
      return res.status(401).json({ error: 'No token' })
    }

    const token = authHeader.replace('Bearer ', '')
    const decoded: any = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret')
    const user = db.users.find((u: any) => u.id === decoded.id)

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    return res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      is_active: user.is_active,
      created_at: user.created_at,
      updated_at: user.updated_at,
      sync_status: 'synced',
    })
  } catch (error: any) {
    return res.status(401).json({ error: 'Invalid token' })
  }
})

// CLIENTS ENDPOINTS
app.get('/api/clients', (req: Request, res: Response) => {
  const clients = db.clients.filter((c: any) => !c.deleted_at)
  return res.json(clients)
})

app.post('/api/clients', (req: Request, res: Response) => {
  try {
    const { name, email, phone, address, ruc } = req.body
    if (!name) {
      return res.status(400).json({ error: 'Name es requerido' })
    }

    const newClient = {
      id: `client-${Date.now()}`,
      name,
      email,
      phone,
      address,
      ruc,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      sync_status: 'synced',
    }

    db.clients.push(newClient)
    saveDB(db)

    console.log(`✓ Cliente creado: ${name}`)
    return res.status(201).json(newClient)
  } catch (error: any) {
    console.error('Create client error:', error.message)
    return res.status(500).json({ error: 'Server error' })
  }
})

// DASHBOARD ENDPOINTS
app.get('/api/dashboard/kpis', (req: Request, res: Response) => {
  try {
    const currentMonth = new Date()
    currentMonth.setDate(1)

    // Calcular KPIs
    const totalInvoiced = db.invoices
      .filter((i: any) => !i.deleted_at && i.status !== 'cancelled')
      .reduce((sum: number, i: any) => sum + (i.total || 0), 0)

    const totalCosts = db.execution_costs.reduce((sum: number, c: any) => sum + (c.cost || 0), 0)

    const margin = totalInvoiced - totalCosts
    const marginPercentage = totalInvoiced > 0 ? (margin / totalInvoiced) * 100 : 0

    const projectsInProgress = db.projects.filter(
      (p: any) => p.status === 'in_progress' && !p.deleted_at
    ).length

    const pendingQuotations = db.quotations.filter(
      (q: any) => ['draft', 'sent'].includes(q.status) && !q.deleted_at
    ).length

    return res.json({
      kpis: {
        total_invoiced: parseFloat(totalInvoiced.toFixed(2)),
        total_costs: parseFloat(totalCosts.toFixed(2)),
        margin: parseFloat(margin.toFixed(2)),
        margin_percentage: parseFloat(marginPercentage.toFixed(2)),
        projects_in_progress: projectsInProgress,
        pending_quotations: pendingQuotations,
      },
      timestamp: new Date(),
    })
  } catch (error: any) {
    console.error('Dashboard KPIs error:', error.message)
    return res.status(500).json({ error: 'Server error' })
  }
})

// QUOTATIONS ENDPOINTS
app.get('/api/quotations', (req: Request, res: Response) => {
  const quotations = db.quotations
    .filter((q: any) => !q.deleted_at)
    .map((q: any) => ({
      ...q,
      client_name: db.clients.find((c: any) => c.id === q.client_id)?.name || 'N/A',
    }))
  return res.json(quotations)
})

app.post('/api/quotations', (req: Request, res: Response) => {
  try {
    const { client_id, items } = req.body

    if (!client_id) {
      return res.status(400).json({ error: 'Client ID es requerido' })
    }

    // Calcular totales
    let subtotal = 0
    if (items && Array.isArray(items)) {
      items.forEach((item: any) => {
        subtotal += (item.quantity || 0) * (item.unit_price || 0)
      })
    }

    const tax = subtotal * 0.18
    const total = subtotal + tax

    const quotationNumber = `Q-${String(db.quotations.length + 1).padStart(4, '0')}`

    const newQuotation = {
      id: `quotation-${Date.now()}`,
      client_id,
      number: quotationNumber,
      status: 'draft',
      items: items || [],
      subtotal,
      tax,
      total,
      notes: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      deleted_at: null,
      sync_status: 'synced',
    }

    db.quotations.push(newQuotation)
    saveDB(db)

    console.log(`✓ Cotización creada: ${quotationNumber}`)
    return res.status(201).json(newQuotation)
  } catch (error: any) {
    console.error('Create quotation error:', error.message)
    return res.status(500).json({ error: 'Server error' })
  }
})

// PROJECTS ENDPOINTS
app.get('/api/projects', (req: Request, res: Response) => {
  const projects = db.projects
    .filter((p: any) => !p.deleted_at)
    .map((p: any) => ({
      ...p,
      client_name: db.clients.find((c: any) => c.id === p.client_id)?.name || 'N/A',
    }))
  return res.json(projects)
})

app.post('/api/projects', (req: Request, res: Response) => {
  try {
    const { quotation_id, client_id, name, start_date } = req.body

    if (!client_id) {
      return res.status(400).json({ error: 'Client ID es requerido' })
    }

    const newProject = {
      id: `project-${Date.now()}`,
      quotation_id: quotation_id || null,
      client_id,
      name: name || 'Proyecto sin nombre',
      status: 'planning',
      start_date: start_date || new Date().toISOString(),
      end_date: null,
      budget: 0,
      spent: 0,
      progress: 0,
      assigned_to: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      sync_status: 'synced',
    }

    db.projects.push(newProject)
    saveDB(db)

    console.log(`✓ Proyecto creado: ${name}`)
    return res.status(201).json(newProject)
  } catch (error: any) {
    console.error('Create project error:', error.message)
    return res.status(500).json({ error: 'Server error' })
  }
})

// INVOICES ENDPOINTS
app.get('/api/invoices', (req: Request, res: Response) => {
  const invoices = db.invoices
    .filter((i: any) => !i.deleted_at)
    .map((i: any) => ({
      ...i,
      client_name: db.clients.find((c: any) => c.id === i.client_id)?.name || 'N/A',
    }))
  return res.json(invoices)
})

app.post('/api/invoices', (req: Request, res: Response) => {
  try {
    const { client_id, project_id, items, payment_condition, due_date } = req.body

    if (!client_id) {
      return res.status(400).json({ error: 'Client ID es requerido' })
    }

    // Calcular totales
    let subtotal = 0
    if (items && Array.isArray(items)) {
      items.forEach((item: any) => {
        subtotal += (item.quantity || 0) * (item.unit_price || 0)
      })
    }

    const tax = subtotal * 0.18
    const total = subtotal + tax
    const invoiceNumber = `F-${String(db.invoices.length + 1).padStart(6, '0')}`

    const newInvoice = {
      id: `invoice-${Date.now()}`,
      project_id: project_id || null,
      client_id,
      number: invoiceNumber,
      date: new Date().toISOString(),
      payment_condition: payment_condition || 'cash',
      due_date: due_date || null,
      items: items || [],
      subtotal,
      tax,
      total,
      is_factored: false,
      status: 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      sync_status: 'synced',
    }

    db.invoices.push(newInvoice)
    saveDB(db)

    console.log(`✓ Factura creada: ${invoiceNumber}`)
    return res.status(201).json(newInvoice)
  } catch (error: any) {
    console.error('Create invoice error:', error.message)
    return res.status(500).json({ error: 'Server error' })
  }
})

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
    message: 'Endpoint no existe. Modo: JSON Development',
  })
})

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('❌ Error:', err.message)
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  })
})

// Iniciar servidor
app.listen(port, () => {
  console.log('')
  console.log('╔════════════════════════════════════════╗')
  console.log('║     BravoCRM Backend - DEV MODE        ║')
  console.log('╠════════════════════════════════════════╣')
  console.log(`║ 🚀 Puerto: ${port}`)
  console.log(`║ 📊 Database: JSON (db.json)`)
  console.log(`║ 🔒 JWT Secret: ${process.env.JWT_SECRET || 'dev-secret'}`)
  console.log('╠════════════════════════════════════════╣')
  console.log('║ 🌐 Frontend: http://localhost:5173')
  console.log('║ 🔌 API Health: http://localhost:3000/api/health')
  console.log('╠════════════════════════════════════════╣')
  console.log('║ 👤 Usuarios Prueba:')
  console.log('║ - nbravo.nbyb@gmail.com / 3571 (admin)')
  console.log('║ - hmeza.nbyb@gmail.com / 4321 (manager)')
  console.log('╚════════════════════════════════════════╝')
  console.log('')
})

export default app
