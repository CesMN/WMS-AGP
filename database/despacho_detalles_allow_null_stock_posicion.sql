-- Permitir reestructurar almacén aunque haya despachos que referencien stock de ese almacén.
-- Al borrar stock_posiciones, las filas de despacho_detalles quedan con stock_posicion_id = NULL
-- (se pierde el vínculo al stock concreto, pero el despacho y sus cantidades se conservan).

ALTER TABLE despacho_detalles
  ALTER COLUMN stock_posicion_id DROP NOT NULL;

-- Reemplazar FK RESTRICT por SET NULL (nombre por defecto en PostgreSQL)
ALTER TABLE despacho_detalles
  DROP CONSTRAINT IF EXISTS despacho_detalles_stock_posicion_id_fkey;

ALTER TABLE despacho_detalles
  ADD CONSTRAINT despacho_detalles_stock_posicion_id_fkey
  FOREIGN KEY (stock_posicion_id) REFERENCES stock_posiciones(id) ON DELETE SET NULL;
