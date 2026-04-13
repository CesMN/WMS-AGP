-- Bultos fraccionarios (ej. parihuelas 8.5): stock y movimientos deben usar NUMERIC, no INTEGER.
-- El backend también aplica esto al arrancar (ensureCantidadBultosNumeric) si la columna sigue en integer.
-- Ejecutar manualmente si preferís no depender del arranque del servidor.

ALTER TABLE stock_posiciones
  ALTER COLUMN cantidad_bultos TYPE NUMERIC(12, 2)
  USING cantidad_bultos::numeric;

ALTER TABLE movimiento_detalles
  ALTER COLUMN cantidad_bultos TYPE NUMERIC(12, 2)
  USING cantidad_bultos::numeric;

ALTER TABLE despacho_detalles
  ALTER COLUMN cantidad_bultos TYPE NUMERIC(12, 2)
  USING cantidad_bultos::numeric;
