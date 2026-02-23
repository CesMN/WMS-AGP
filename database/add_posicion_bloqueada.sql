-- Añadir columna bloqueada a posiciones (posición bloqueada = no agregar ni mover productos)
-- Ejecutar: psql -U postgres -d wms_db -f database/add_posicion_bloqueada.sql

ALTER TABLE posiciones
ADD COLUMN IF NOT EXISTS bloqueada BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN posiciones.bloqueada IS 'Si es true, no se puede agregar stock ni mover productos desde/hacia esta posición';
