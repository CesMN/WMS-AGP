-- Configuración para traducción de lotes republicanos: mapa letra → año (ej. H → 2025).
-- El administrador asigna en Configuración > Lotes republicanos — Letras de año.
INSERT INTO configuracion (clave, valor, tipo, descripcion)
SELECT 'lote_republicano_anos', '{}', 'json', 'Mapa letra→año para lotes republicanos (ej. {"H":"2025"}). Solo administradores.'
WHERE NOT EXISTS (SELECT 1 FROM configuracion WHERE clave = 'lote_republicano_anos');
