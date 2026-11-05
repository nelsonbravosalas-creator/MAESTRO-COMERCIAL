// Calculadora de remuneraciones para los perfiles de Mano de Obra.
//
// remuneraciones_parametros: parámetros legales y de dotación (tasas, topes,
// UF/UTM/IMM, IUSC, aguinaldos, colación, movilización). Insert-only con
// "supersede", igual que chatbot_rules (migración 0021): cambiar un parámetro
// inserta una versión nueva y marca la anterior, así queda registro de qué
// valores se usaron en cada cálculo.
//
// remuneraciones_perfiles: último cálculo guardado por perfil de Mano de Obra
// (catalog_items con category_id = 'mo'). Guarda las entradas (sueldo líquido,
// contrato, jornada…) y el resultado, para poder recalcular cuando cambian los
// parámetros sin volver a pedir los datos a mano.
exports.shorthands = undefined

exports.up = pgm => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS remuneraciones_parametros (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      params         JSONB NOT NULL,
      created_by     UUID REFERENCES users(id),
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      superseded_at  TIMESTAMPTZ
    );
    CREATE UNIQUE INDEX IF NOT EXISTS ix_remuneraciones_parametros_vigente
      ON remuneraciones_parametros ((superseded_at IS NULL)) WHERE superseded_at IS NULL;

    CREATE TABLE IF NOT EXISTS remuneraciones_perfiles (
      catalog_item_id  UUID PRIMARY KEY REFERENCES catalog_items(id) ON DELETE CASCADE,
      inputs           JSONB NOT NULL,
      resultado        JSONB NOT NULL,
      costo_diario     NUMERIC(14,2) NOT NULL,
      parametros_id    UUID REFERENCES remuneraciones_parametros(id),
      updated_by       UUID REFERENCES users(id),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)
}

exports.down = pgm => {
  pgm.sql(`
    DROP TABLE IF EXISTS remuneraciones_perfiles;
    DROP TABLE IF EXISTS remuneraciones_parametros;
  `)
}
