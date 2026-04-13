ALTER TABLE ordenes_exportacion
  ADD COLUMN IF NOT EXISTS fecha_probable_embarque DATE;

COMMENT ON COLUMN ordenes_exportacion.fecha_probable_embarque IS 'Fecha probable de embarque (listos para despacho); requisito para crear despacho desde almacén.';
