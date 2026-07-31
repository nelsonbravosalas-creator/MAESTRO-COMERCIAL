const fs = require('fs')
const path = require('path')

// Tabla project_tasks: existía como archivo suelto (migration_v3_project_tasks.sql)
// aplicado manualmente y nunca incorporado a schema.sql — por eso una base de
// datos nueva armada solo con schema.sql (p. ej. docker-compose) no la tenía.
const sqlPath = path.join(__dirname, '..', 'migration_v3_project_tasks.sql')

exports.shorthands = undefined

exports.up = (pgm) => {
  pgm.sql(fs.readFileSync(sqlPath, 'utf-8'))
}

exports.down = (pgm) => {
  pgm.sql('DROP TABLE IF EXISTS project_tasks;')
}
