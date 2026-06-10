-- ============================================================
-- MAESTRO COMERCIAL - Seed inicial para Neon/Vercel Postgres
-- Importar DESPUES de ejecutar schema.sql
-- ============================================================

-- Usuarios iniciales
-- Passwords generados con bcrypt rounds=10:
--   admin   → 3571
--   manager → 4321
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
ON CONFLICT (email) DO NOTHING;

-- Clientes demo
INSERT INTO clients (name, email, phone, address, ruc)
VALUES
  (
    'Constructora Andina SAC',
    'contacto@andina.com.pe',
    '01-234-5678',
    'Av. La Marina 2345, San Miguel, Lima',
    '20123456789'
  ),
  (
    'Minera Norte Peru SRL',
    'proyectos@mineranorte.pe',
    '044-456-789',
    'Jr. Independencia 890, Trujillo, La Libertad',
    '20456789012'
  ),
  (
    'Inversiones Pacifico SA',
    'licitaciones@pacifico.pe',
    '01-890-1234',
    'Calle Los Álamos 567, Miraflores, Lima',
    '20789012345'
  )
ON CONFLICT (ruc) DO NOTHING;
