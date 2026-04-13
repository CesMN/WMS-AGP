-- Etapa final tras despacho físico: documentación / exportación formal
ALTER TABLE ordenes_exportacion_contenedores
  ADD COLUMN IF NOT EXISTS exportado_at TIMESTAMP;

COMMENT ON COLUMN ordenes_exportacion_contenedores.exportado_at IS 'Registro de documentación cerrada; distinto de despachado_at (salida física).';
