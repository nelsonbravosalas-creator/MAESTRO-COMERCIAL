const fs = require('fs')
const path = require('path')

// Migración base: envuelve el schema.sql actual (ya es el estado acumulado real,
// incluye lo que antes vivía disperso en migration_v2/v4/v5). Se lee desde el
// archivo en vez de copiar el SQL para no tener dos fuentes de verdad del esquema.
const schemaPath = path.join(__dirname, '..', 'schema.sql')

exports.shorthands = undefined

exports.up = (pgm) => {
  pgm.sql(fs.readFileSync(schemaPath, 'utf-8'))
}

// Irreversible a propósito: no hay un "down" seguro para el esquema completo de
// una aplicación con datos reales. Un rollback de esta migración implica borrar
// todas las tablas — si alguna vez hace falta, se hace a mano y con respaldo.
exports.down = false
