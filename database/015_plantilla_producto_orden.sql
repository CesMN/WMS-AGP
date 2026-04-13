-- Orden explícito de productos en plantillas de proceso (arrastrable en UI).
ALTER TABLE plantillas_proceso_productos ADD COLUMN IF NOT EXISTS orden INTEGER NOT NULL DEFAULT 0;

UPDATE plantillas_proceso_productos ppp
SET orden = x.ord
FROM (
  SELECT ppp_inner.plantilla_id,
         ppp_inner.producto_id,
         (ROW_NUMBER() OVER (
           PARTITION BY ppp_inner.plantilla_id
           ORDER BY COALESCE(pr.codigo, '')
         ) - 1)::integer AS ord
  FROM plantillas_proceso_productos ppp_inner
  JOIN productos pr ON pr.id = ppp_inner.producto_id
) x
WHERE ppp.plantilla_id = x.plantilla_id AND ppp.producto_id = x.producto_id;

CREATE INDEX IF NOT EXISTS idx_plantillas_proceso_productos_orden ON plantillas_proceso_productos (plantilla_id, orden);

COMMENT ON COLUMN plantillas_proceso_productos.orden IS 'Posición en la plantilla (0 = primero). Usado en empaque, envasado, congelado y reportes.';
