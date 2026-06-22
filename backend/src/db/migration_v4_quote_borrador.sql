-- Agrega estado 'Borrador' al enum quote_status (cotizaciones nuevas en borrador)
ALTER TYPE quote_status ADD VALUE IF NOT EXISTS 'Borrador';

ALTER TABLE quotations ALTER COLUMN status SET DEFAULT 'Borrador';
