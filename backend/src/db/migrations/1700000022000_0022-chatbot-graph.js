// Grafo de conocimiento del chatbot: hechos deterministas que el propio
// backend ya conoce al momento en que ocurren (cliente, comuna, material,
// regla, cotizacion) — no hay "descubrimiento" vía LLM/clustering en
// caliente, eso es demasiado lento para una función serverless de Vercel.
// Dos tablas: nodos (entidades) y aristas (relaciones con peso, para que
// una relación repetida muchas veces pese más que una mencionada una sola
// vez).
//
// FRONTERA DE PRIVACIDAD (ver A-21 en docs/RIESGOS_ACEPTADOS.md): los nodos
// type='cliente' SI pueden llevar datos identificatorios en `label`/
// `properties` (igual que ya ocurre en la tabla `clients`) — la barrera no
// está en el esquema, está en código: backend/src/services/chatbotGraph.ts
// expone `buildLlmGraphContext()` (filtrada, por diseño, a tipos no
// personales) y `applyClientPatterns()` (lee clientes, pero nunca construye
// texto de prompt) como funciones completamente separadas. No agregar un
// parámetro a `buildLlmGraphContext()` que permita ampliar esa lista de
// tipos sin releer A-21 primero.
exports.shorthands = undefined

exports.up = pgm => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS chatbot_graph_nodes (
      id          TEXT PRIMARY KEY,
      type        TEXT NOT NULL,
      label       TEXT NOT NULL,
      properties  JSONB NOT NULL DEFAULT '{}',
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS ix_chatbot_graph_nodes_type ON chatbot_graph_nodes (type);

    CREATE TABLE IF NOT EXISTS chatbot_graph_edges (
      source_id   TEXT NOT NULL REFERENCES chatbot_graph_nodes(id) ON DELETE CASCADE,
      target_id   TEXT NOT NULL REFERENCES chatbot_graph_nodes(id) ON DELETE CASCADE,
      relation    TEXT NOT NULL,
      weight      REAL NOT NULL DEFAULT 1.0,
      metadata    JSONB DEFAULT '{}',
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (source_id, target_id, relation)
    );
    CREATE INDEX IF NOT EXISTS ix_chatbot_graph_edges_source ON chatbot_graph_edges (source_id);
    CREATE INDEX IF NOT EXISTS ix_chatbot_graph_edges_target ON chatbot_graph_edges (target_id);
    -- Soporta "ORDER BY weight DESC, updated_at DESC LIMIT N" sin escanear
    -- toda la tabla al expandir un nodo con muchas aristas (ej. una comuna o
    -- material muy popular — el problema de "supernodos").
    CREATE INDEX IF NOT EXISTS ix_chatbot_graph_edges_source_weight
      ON chatbot_graph_edges (source_id, weight DESC, updated_at DESC);
  `)
}

exports.down = pgm => {
  pgm.sql(`
    DROP TABLE IF EXISTS chatbot_graph_edges;
    DROP TABLE IF EXISTS chatbot_graph_nodes;
  `)
}
