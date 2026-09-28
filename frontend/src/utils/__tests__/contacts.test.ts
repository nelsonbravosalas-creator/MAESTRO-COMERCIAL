import { describe, it, expect } from 'vitest'
import type { MasterClient, MasterContact } from '../../types'
import { primaryContact, quotationContact } from '../contacts'

const contact = (over: Partial<MasterContact>): MasterContact => ({
  id: '',
  name: '',
  cargo: '',
  email: '',
  phone: '',
  is_primary: false,
  ...over,
})

const client: MasterClient = {
  id: 'cli-1',
  name: 'Minera Ejemplo',
  rut: '76.000.000-0',
  activity: '',
  address: '',
  city: '',
  contact: 'Ana Pérez',
  cargo: 'Jefa de Mantención',
  email: 'ana@minera.cl',
  phone: '',
  contacts: [
    contact({
      id: 'ct-1',
      name: 'Ana Pérez',
      cargo: 'Jefa de Mantención',
      email: 'ana@minera.cl',
      is_primary: true,
    }),
    contact({
      id: 'ct-2',
      name: 'Luis Soto',
      cargo: 'Administrador de Contrato',
      email: 'luis@minera.cl',
    }),
  ],
  created_at: '',
  updated_at: '',
}

describe('primaryContact', () => {
  it('devuelve el marcado como principal', () => {
    expect(primaryContact(client)?.id).toBe('ct-1')
  })

  it('sin principal marcado, devuelve el primero', () => {
    const c = { ...client, contacts: client.contacts!.map(ct => ({ ...ct, is_primary: false })) }
    expect(primaryContact(c)?.id).toBe('ct-1')
  })

  it('cliente sin contactos (o persistido antes de existir la lista) → undefined', () => {
    expect(primaryContact({ ...client, contacts: undefined })).toBeUndefined()
    expect(primaryContact(undefined)).toBeUndefined()
  })
})

describe('quotationContact', () => {
  it('toma nombre, cargo y correo del contacto elegido, no del principal', () => {
    expect(quotationContact({ contact_id: 'ct-2', contact: 'Luis Soto' }, client)).toEqual({
      name: 'Luis Soto',
      cargo: 'Administrador de Contrato',
      email: 'luis@minera.cl',
    })
  })

  it('cotización antigua sin contact_id: conserva el nombre y hereda datos solo si es el principal', () => {
    expect(quotationContact({ contact_id: null, contact: 'Ana Pérez' }, client)).toEqual({
      name: 'Ana Pérez',
      cargo: 'Jefa de Mantención',
      email: 'ana@minera.cl',
    })
    expect(quotationContact({ contact_id: null, contact: 'Otra Persona' }, client)).toEqual({
      name: 'Otra Persona',
      cargo: '',
      email: '',
    })
  })

  it('sin contacto → campos vacíos', () => {
    expect(quotationContact({ contact_id: null, contact: '' }, client)).toEqual({
      name: '',
      cargo: '',
      email: '',
    })
  })
})
