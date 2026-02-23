-- Añadir opciones de tamaño de fuente: títulos, texto general, tablas, modales
INSERT INTO configuracion (clave, valor, tipo, descripcion)
SELECT 'tamaño_titulos', '20', 'number', 'Tamaño de fuente de títulos (px)'
WHERE NOT EXISTS (SELECT 1 FROM configuracion WHERE clave = 'tamaño_titulos');

INSERT INTO configuracion (clave, valor, tipo, descripcion)
SELECT 'tamaño_texto', '14', 'number', 'Tamaño de texto general (px)'
WHERE NOT EXISTS (SELECT 1 FROM configuracion WHERE clave = 'tamaño_texto');

INSERT INTO configuracion (clave, valor, tipo, descripcion)
SELECT 'tamaño_tablas', '13', 'number', 'Tamaño de fuente en tablas (px)'
WHERE NOT EXISTS (SELECT 1 FROM configuracion WHERE clave = 'tamaño_tablas');

INSERT INTO configuracion (clave, valor, tipo, descripcion)
SELECT 'tamaño_modales', '14', 'number', 'Tamaño de fuente en ventanas modales (px)'
WHERE NOT EXISTS (SELECT 1 FROM configuracion WHERE clave = 'tamaño_modales');
