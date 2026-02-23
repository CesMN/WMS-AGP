-- Permitir cantidad_bultos = 0 en despacho_detalles (salida solo de peso adicional)
ALTER TABLE despacho_detalles DROP CONSTRAINT IF EXISTS despacho_detalles_cantidad_bultos_check;
ALTER TABLE despacho_detalles ADD CONSTRAINT despacho_detalles_cantidad_bultos_check CHECK (cantidad_bultos >= 0);
