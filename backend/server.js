import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createApp } from './app.js';
import { pool, ensureCantidadBultosNumeric } from './config/database.js';
import { ensureRbacTables, ensureUsuariosRolConstraint } from './utils/rbac.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = createApp();
const PORT = process.env.PORT || 5000;

async function initConfig() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS configuracion_usuario (
        user_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        clave VARCHAR(255) NOT NULL,
        valor TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, clave)
      )
    `);
    const fontKeys = [
      ['tamaño_fuente', '14', 'Tamaño de fuente base (px)'],
      ['tamaño_titulos', '20', 'Tamaño de fuente de títulos (px)'],
      ['tamaño_texto', '14', 'Tamaño de texto general (px)'],
      ['tamaño_tablas', '13', 'Tamaño de fuente en tablas (px)'],
      ['tamaño_modales', '14', 'Tamaño de fuente en ventanas modales (px)'],
      ['tamaño_logo', '48', 'Altura del logo en el menú (px)'],
    ];
    for (const [clave, valor, descripcion] of fontKeys) {
      await pool.query(
        `INSERT INTO configuracion (clave, valor, tipo, descripcion)
         SELECT $1, $2, 'number', $3
         WHERE NOT EXISTS (SELECT 1 FROM configuracion WHERE clave = $1)`,
        [clave, valor, descripcion]
      );
    }
  } catch (e) {
    console.warn('Init config (configuracion_usuario / fuentes):', e.message);
  }
}

const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
const serveFrontend = process.env.NODE_ENV === 'production' || process.env.SERVE_FRONTEND === '1';
if (serveFrontend && fs.existsSync(frontendDist)) {
  console.log('Sirviendo frontend desde', frontendDist);
}

app.listen(PORT, async () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  await ensureCantidadBultosNumeric();
  await initConfig();
  try {
    await ensureUsuariosRolConstraint();
  } catch (e) {
    console.warn('RBAC (usuarios.rol):', e.message);
  }
  await ensureRbacTables();
});
