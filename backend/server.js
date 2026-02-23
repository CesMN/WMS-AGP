import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';
import { pool } from './config/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import authRoutes from './routes/auth.routes.js';
import usuariosRoutes from './routes/usuarios.routes.js';
import almacenesRoutes from './routes/almacenes.routes.js';
import productosRoutes from './routes/productos.routes.js';
import referenciasRoutes from './routes/referencias.routes.js';
import especiesRoutes from './routes/especies.routes.js';
import clientesRoutes from './routes/clientes.routes.js';
import stockRoutes from './routes/stock.routes.js';
import movimientosRoutes from './routes/movimientos.routes.js';
import despachosRoutes from './routes/despachos.routes.js';
import configuracionRoutes from './routes/configuracion.routes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares (límite ampliado para permitir logo en base64 en configuración)
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rutas
app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/almacenes', almacenesRoutes);
app.use('/api/productos', productosRoutes);
app.use('/api/referencias', referenciasRoutes);
app.use('/api/especies', especiesRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/movimientos', movimientosRoutes);
app.use('/api/despachos', despachosRoutes);
app.use('/api/configuracion', configuracionRoutes);

// Ruta de prueba
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ 
      status: 'OK', 
      message: 'Servidor funcionando correctamente',
      database: 'Conectado',
      timestamp: result.rows[0].now
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'ERROR', 
      message: 'Error de conexión a la base de datos',
      error: error.message 
    });
  }
});

// 404 para rutas API no definidas
app.use('/api/*', (req, res) => {
  res.status(404).json({ message: 'Ruta no encontrada' });
});

// En producción o con SERVE_FRONTEND=1: servir frontend compilado (para pruebas en otro equipo)
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
const serveFrontend = process.env.NODE_ENV === 'production' || process.env.SERVE_FRONTEND === '1';
if (serveFrontend && fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
  console.log('📁 Sirviendo frontend desde', frontendDist);
}

// Manejo de errores
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    message: 'Error interno del servidor',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Error desconocido'
  });
});

// Crear tabla configuracion_usuario y claves de tamaños de fuente si no existen
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

// Iniciar servidor
app.listen(PORT, async () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  await initConfig();
});
