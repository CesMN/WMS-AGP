-- Elimina todos los ingresos (stock en posiciones y movimientos de tipo Ingreso)
-- para poder volver a cargar con los nuevos datos (guía, cliente, especie).
-- ATENCIÓN: También se eliminan las líneas de despachos (despacho_detalles)
-- porque referencian stock_posiciones. Los despachos quedan vacíos.
-- Ejecutar: psql -U postgres -d wms_db -f database/eliminar_todos_ingresos.sql

BEGIN;

-- 1. Quitar líneas de despachos (referencian stock_posiciones con RESTRICT)
DELETE FROM despacho_detalles;

-- 2. Eliminar detalles de movimientos de tipo Ingreso
DELETE FROM movimiento_detalles
WHERE movimiento_id IN (SELECT id FROM movimientos WHERE tipo_movimiento = 'Ingreso');

-- 3. Eliminar movimientos de tipo Ingreso
DELETE FROM movimientos WHERE tipo_movimiento = 'Ingreso';

-- 4. Eliminar todo el stock en posiciones
DELETE FROM stock_posiciones;

COMMIT;

-- Opcional: actualizar estado de posiciones a Disponible si tu esquema lo permite
-- UPDATE posiciones SET estado = 'Disponible' WHERE estado IN ('Ocupado', 'Mix');
