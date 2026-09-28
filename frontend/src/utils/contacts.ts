import { MasterClient, MasterContact } from '../types'

// Contacto primario (o el primero) de un cliente, si tiene alguno.
export function primaryContact(client: MasterClient | undefined | null): MasterContact | undefined {
  const contacts = client?.contacts ?? []
  return contacts.find(c => c.is_primary) ?? contacts[0]
}

// Datos del contacto que se imprimen en la cotización (nombre, cargo, correo).
//
// Se resuelve por `contact_id` contra los contactos del cliente: el backend
// solo guarda ese id y reconstruye el nombre con un JOIN, así que el cargo y el
// correo tienen que salir del mismo contacto, no del contacto principal del
// cliente. Cotizaciones antiguas sin `contact_id` conservan el nombre en texto
// libre (`q.contact`) y, solo si coincide con el principal, heredan su cargo y
// correo.
export function quotationContact(
  q: { contact_id: string | null; contact: string },
  client: MasterClient | undefined | null
): { name: string; cargo: string; email: string } {
  const byId = q.contact_id ? client?.contacts?.find(c => c.id === q.contact_id) : undefined
  if (byId) return { name: byId.name, cargo: byId.cargo, email: byId.email }

  const name = q.contact || ''
  const legacyMatch = client && name && client.contact === name
  return {
    name,
    cargo: legacyMatch ? client.cargo : '',
    email: legacyMatch ? client.email : '',
  }
}
