-- La distribución por contenedor es solo por línea de producto (bultos totales), sin lotes.
-- Elimina filas históricas vinculadas a asignaciones de lote para no interferir con otros módulos.

DELETE FROM ordenes_exportacion_contenedor_contenido WHERE asignacion_id IS NOT NULL;
