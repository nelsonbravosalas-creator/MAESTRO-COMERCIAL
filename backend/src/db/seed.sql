-- ============================================================
-- MAESTRO COMERCIAL — Seed v2.0
-- Ejecutar DESPUÉS de schema.sql
-- Datos: empresas chilenas, rubros HVAC / industrial
-- ============================================================

-- ── Configuración global ──────────────────────────────────────
INSERT INTO app_config (key, value) VALUES
  ('uf_value',    '39500'),
  ('iva_pct',     '19'),
  ('correlative_prefix', 'SYM'),
  ('company_name', 'NBYB Ingeniería HVAC'),
  ('company_rut',  '77.123.456-7')
ON CONFLICT (key) DO NOTHING;

-- ── Usuarios ──────────────────────────────────────────────────
-- Passwords:  admin → 3571  |  manager → 4321
INSERT INTO users (id, email, password_hash, name, role, is_active)
VALUES
  (
    gen_random_uuid(),
    'nbravo.nbyb@gmail.com',
    '$2b$10$sMpV3Pa3KW7mOgm3JHh6U.sdS16onwr5D7kIxdiEozLslWcveKGeG',
    'Nelson Bravo',
    'admin',
    true
  ),
  (
    gen_random_uuid(),
    'hmeza.nbyb@gmail.com',
    '$2b$10$P701tfm7c/.QJ30gJHVkm.MF7Vo1knDbuFSrqJShjgUI.E0mx7FfC',
    'H. Meza',
    'manager',
    true
  )
ON CONFLICT DO NOTHING;

-- ── Catálogo Maestro de Precios ───────────────────────────────

-- Mano de Obra (mo)
INSERT INTO catalog_items (category_id, description, unit_name, unit_price, sort_order) VALUES
  ('mo', 'Supervisor',                   'Hora', 120000, 10),
  ('mo', 'Técnico Especializado HVAC',   'Hora', 150000, 20),
  ('mo', 'Técnico Electricista',         'Hora', 130000, 30),
  ('mo', 'Ayudante Técnico HVAC',        'Hora',  80000, 40),
  ('mo', 'Prevencionista',               'Hora',  90000, 50)
ON CONFLICT (category_id, lower(description)) DO UPDATE
  SET unit_price = EXCLUDED.unit_price, updated_at = NOW();

-- Logística (log)
INSERT INTO catalog_items (category_id, description, unit_name, unit_price, sort_order) VALUES
  ('log', 'Flete Herramientas STGO-Faena', 'Gl',   250000, 10),
  ('log', 'Viáticos Faena Local',          'Un',    45000, 20),
  ('log', 'Alimentación',                  'Un',    15000, 30),
  ('log', 'Arriendo Vehículo',             'Día',   45000, 40),
  ('log', 'Pasaje Aéreo',                  'Un',   120000, 50)
ON CONFLICT (category_id, lower(description)) DO UPDATE
  SET unit_price = EXCLUDED.unit_price, updated_at = NOW();

-- Materiales (mat)
INSERT INTO catalog_items (category_id, description, unit_name, unit_price, sort_order) VALUES
  ('mat', 'Cañería Cobre Tira K 1"',      'Tir',   49100, 10),
  ('mat', 'Cañería Cobre Tira K 3/4"',    'Tir',   33800, 20),
  ('mat', 'Cañería Cobre Tira K 1/2"',    'Tir',   28500, 30),
  ('mat', 'Cañería Cobre Tira L 3/8"',    'Tir',    7500, 40),
  ('mat', 'Copla Cobre 1"',               'Uni',     700, 50),
  ('mat', 'Copla Cobre 3/4"',             'Uni',     330, 60)
ON CONFLICT (category_id, lower(description)) DO UPDATE
  SET unit_price = EXCLUDED.unit_price, updated_at = NOW();

-- Repuestos y Equipos (rep)
INSERT INTO catalog_items (category_id, description, unit_name, unit_price, sort_order) VALUES
  ('rep', 'Compressor ZR 16 M3 E TWD 561',   'Uni', 1977397, 10),
  ('rep', 'Bomba de Condensado Orange',       'Uni',  159500, 20),
  ('rep', 'Filtro Deshidratador Vertiv',      'Uni',   85400, 30),
  ('rep', 'Contactor Trifásico 180A 220VAC',  'Un',   440000, 40)
ON CONFLICT (category_id, lower(description)) DO UPDATE
  SET unit_price = EXCLUDED.unit_price, updated_at = NOW();

-- Insumos (ins)
INSERT INTO catalog_items (category_id, description, unit_name, unit_price, sort_order) VALUES
  ('ins', 'Soldadura de Plata al 15% (Varilla)', 'Kg',    7500, 10),
  ('ins', 'Nitrógeno N2',                        'Rec',  35000, 20),
  ('ins', 'Refrigerante R-410a',                 'Kg',  120000, 30),
  ('ins', 'Refrigerante R-134a',                 'Kg',  115000, 40),
  ('ins', 'Pintura de Seguridad',                'Gl',   25000, 50),
  ('ins', 'Canalización EMT Galvanizada',        'Tir',  12500, 60),
  ('ins', 'Aislación Térmica Armaflex',          'Tir',   8500, 70)
ON CONFLICT (category_id, lower(description)) DO UPDATE
  SET unit_price = EXCLUDED.unit_price, updated_at = NOW();

-- ── Clientes chilenos ─────────────────────────────────────────
WITH inserted_clients AS (
  INSERT INTO clients (id, name, rut, activity, address, city)
  VALUES
    (
      gen_random_uuid(),
      'Minera Los Andes SpA',
      '76.543.210-8',
      'Extracción de Minerales',
      'Av. Apoquindo 3600, Of. 1201, Las Condes',
      'Santiago'
    ),
    (
      gen_random_uuid(),
      'Constructora Roca Viva Ltda.',
      '77.321.654-2',
      'Construcción Industrial',
      'Av. Libertador Bernardo O''Higgins 1234',
      'Rancagua'
    ),
    (
      gen_random_uuid(),
      'Industrias Frío Sur S.A.',
      '96.874.320-1',
      'Procesamiento de Alimentos',
      'Ruta 5 Sur Km 890, Parque Industrial',
      'Puerto Montt'
    ),
    (
      gen_random_uuid(),
      'Retail Austral S.A.',
      '99.543.210-K',
      'Retail y Supermercados',
      'Av. Independencia 3456',
      'Concepción'
    )
  ON CONFLICT (rut) DO NOTHING
  RETURNING id, name
)
-- Contactos para cada cliente
INSERT INTO client_contacts (client_id, name, cargo, email, phone, is_primary)
SELECT
  c.id,
  v.name,
  v.cargo,
  v.email,
  v.phone,
  true
FROM inserted_clients c
JOIN (VALUES
  ('Minera Los Andes SpA',       'Carlos Fuentes Rojas',  'Jefe de Mantenimiento', 'cfuentes@losandes.cl',   '+56 9 8123 4567'),
  ('Constructora Roca Viva Ltda.','Patricia Soto Ávila',  'Gerente de Proyectos',  'psoto@rocaviva.cl',      '+56 9 7234 5678'),
  ('Industrias Frío Sur S.A.',   'Rodrigo Pino Contreras','Encargado de Planta',   'rpino@friosur.cl',       '+56 9 6345 6789'),
  ('Retail Austral S.A.',        'Valentina Muñoz Vera',  'Coordinadora de Obras', 'vmunoz@retailaustral.cl','+56 9 5456 7890')
) AS v(client_name, name, cargo, email, phone)
  ON c.name = v.client_name;
