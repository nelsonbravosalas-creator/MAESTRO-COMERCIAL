import { Router } from 'express'
import { Pool } from 'pg'
import { logger } from '../utils/logger'
import { authMiddleware, AuthRequest } from '../middleware/auth'

const withContacts = async (pool: Pool, clients: any[]) => {
  if (clients.length === 0) return []
  const ids = clients.map(c => c.id)
  const contacts = await pool.query(
    `SELECT *
       FROM client_contacts
      WHERE client_id = ANY($1::uuid[])
      ORDER BY is_primary DESC, created_at ASC`,
    [ids]
  )

  const byClient = new Map<string, any[]>()
  for (const contact of contacts.rows) {
    byClient.set(contact.client_id, [...(byClient.get(contact.client_id) ?? []), contact])
  }

  return clients.map(client => ({ ...client, contacts: byClient.get(client.id) ?? [] }))
}

export const createClientsRouter = (pool: Pool) => {
  const router = Router()
  router.use(authMiddleware)

  router.get('/', async (_req: AuthRequest, res) => {
    try {
      const result = await pool.query(
        `SELECT *
           FROM clients
          WHERE deleted_at IS NULL
          ORDER BY lower(name)`
      )
      return res.json(await withContacts(pool, result.rows))
    } catch (error: any) {
      logger.error('Get clients error', { error: error.message })
      return res.status(500).json({ error: 'Failed to fetch clients' })
    }
  })

  router.get('/:id/contacts', async (req: AuthRequest, res) => {
    try {
      const result = await pool.query(
        `SELECT *
           FROM client_contacts
          WHERE client_id = $1
          ORDER BY is_primary DESC, created_at ASC`,
        [req.params.id]
      )
      return res.json(result.rows)
    } catch (error: any) {
      logger.error('Get contacts error', { error: error.message, clientId: req.params.id })
      return res.status(500).json({ error: 'Failed to fetch contacts' })
    }
  })

  router.post('/:id/contacts', async (req: AuthRequest, res) => {
    try {
      const { name, cargo, email, phone, is_primary } = req.body
      if (!name) return res.status(400).json({ error: 'name is required' })

      if (is_primary) {
        await pool.query('UPDATE client_contacts SET is_primary = false WHERE client_id = $1', [req.params.id])
      }

      const result = await pool.query(
        `INSERT INTO client_contacts (client_id, name, cargo, email, phone, is_primary)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [req.params.id, name, cargo || null, email || null, phone || null, Boolean(is_primary)]
      )

      return res.status(201).json(result.rows[0])
    } catch (error: any) {
      logger.error('Create contact error', { error: error.message, clientId: req.params.id })
      return res.status(500).json({ error: 'Failed to create contact' })
    }
  })

  router.put('/:id/contacts/:contactId', async (req: AuthRequest, res) => {
    try {
      const { name, cargo, email, phone, is_primary } = req.body
      if (!name) return res.status(400).json({ error: 'name is required' })

      if (is_primary) {
        await pool.query('UPDATE client_contacts SET is_primary = false WHERE client_id = $1', [req.params.id])
      }

      const result = await pool.query(
        `UPDATE client_contacts
            SET name = $1,
                cargo = $2,
                email = $3,
                phone = $4,
                is_primary = COALESCE($5, is_primary),
                updated_at = NOW()
          WHERE id = $6
            AND client_id = $7
          RETURNING *`,
        [name, cargo || null, email || null, phone || null, is_primary, req.params.contactId, req.params.id]
      )

      if (result.rows.length === 0) return res.status(404).json({ error: 'Contact not found' })
      return res.json(result.rows[0])
    } catch (error: any) {
      logger.error('Update contact error', { error: error.message, contactId: req.params.contactId })
      return res.status(500).json({ error: 'Failed to update contact' })
    }
  })

  router.get('/:id', async (req: AuthRequest, res) => {
    try {
      const result = await pool.query(
        `SELECT *
           FROM clients
          WHERE id = $1
            AND deleted_at IS NULL`,
        [req.params.id]
      )

      if (result.rows.length === 0) return res.status(404).json({ error: 'Client not found' })
      const [client] = await withContacts(pool, result.rows)
      return res.json(client)
    } catch (error: any) {
      logger.error('Get client error', { error: error.message, clientId: req.params.id })
      return res.status(500).json({ error: 'Failed to fetch client' })
    }
  })

  router.post('/', async (req: AuthRequest, res) => {
    const client = await pool.connect()
    try {
      const { name, rut, activity, address, city, contacts } = req.body
      if (!name) return res.status(400).json({ error: 'name is required' })

      await client.query('BEGIN')
      const result = await client.query(
        `INSERT INTO clients (name, rut, activity, address, city, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [name, rut || null, activity || null, address || null, city || null, req.user?.id ?? null]
      )

      const clientRow = result.rows[0]
      if (Array.isArray(contacts)) {
        for (let i = 0; i < contacts.length; i++) {
          const contact = contacts[i]
          if (!contact?.name) continue
          await client.query(
            `INSERT INTO client_contacts (client_id, name, cargo, email, phone, is_primary)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              clientRow.id,
              contact.name,
              contact.cargo || null,
              contact.email || null,
              contact.phone || null,
              contact.is_primary ?? i === 0,
            ]
          )
        }
      }

      await client.query('COMMIT')
      const [created] = await withContacts(pool, [clientRow])
      return res.status(201).json(created)
    } catch (error: any) {
      await client.query('ROLLBACK')
      logger.error('Create client error', { error: error.message, userId: req.user?.id })
      if (error.code === '23505') return res.status(409).json({ error: 'Client RUT already exists' })
      return res.status(500).json({ error: 'Failed to create client' })
    } finally {
      client.release()
    }
  })

  router.put('/:id', async (req: AuthRequest, res) => {
    try {
      const { name, rut, activity, address, city } = req.body
      if (!name) return res.status(400).json({ error: 'name is required' })

      const result = await pool.query(
        `UPDATE clients
            SET name = $1,
                rut = $2,
                activity = $3,
                address = $4,
                city = $5,
                updated_at = NOW()
          WHERE id = $6
            AND deleted_at IS NULL
          RETURNING *`,
        [name, rut || null, activity || null, address || null, city || null, req.params.id]
      )

      if (result.rows.length === 0) return res.status(404).json({ error: 'Client not found' })
      const [updated] = await withContacts(pool, result.rows)
      return res.json(updated)
    } catch (error: any) {
      logger.error('Update client error', { error: error.message, clientId: req.params.id })
      if (error.code === '23505') return res.status(409).json({ error: 'Client RUT already exists' })
      return res.status(500).json({ error: 'Failed to update client' })
    }
  })

  router.delete('/:id', async (req: AuthRequest, res) => {
    try {
      const result = await pool.query(
        `UPDATE clients
            SET deleted_at = NOW()
          WHERE id = $1
            AND deleted_at IS NULL
          RETURNING id`,
        [req.params.id]
      )

      if (result.rows.length === 0) return res.status(404).json({ error: 'Client not found' })
      return res.json({ message: 'Client deleted successfully' })
    } catch (error: any) {
      logger.error('Delete client error', { error: error.message, clientId: req.params.id })
      return res.status(500).json({ error: 'Failed to delete client' })
    }
  })

  return router
}
