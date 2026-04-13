import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { pool } from './config/database.js';
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
import recepcionRoutes from './routes/recepcion.routes.js';
import insumosRoutes from './routes/insumos.routes.js';
import produccionRoutes from './routes/produccion.routes.js';
import salidasRoutes from './routes/salidas.routes.js';
import ordenesExportacionRoutes from './routes/ordenes-exportacion.routes.js';
import clientesExportacionRoutes from './routes/clientes-exportacion.routes.js';
import ingresosMpRoutes from './routes/ingresos-mp.routes.js';
import plantillasProcesoRoutes from './routes/plantillas-proceso.routes.js';
import envasadoRoutes from './routes/envasado.routes.js';
import congeladoRoutes from './routes/congelado.routes.js';
import empaqueRoutes from './routes/empaque.routes.js';
import controlProduccionRoutes from './routes/control-produccion.routes.js';
import parihuelasRoutes from './routes/parihuelas.routes.js';
import reportesProduccionRoutes from './routes/reportes-produccion.routes.js';
import empaqueEspecificacionesRoutes from './routes/empaque-especificaciones.routes.js';
import adminActividadRoutes from './routes/admin-actividad.routes.js';
import notificacionesRoutes from './routes/notificaciones.routes.js';
import { setupSecurity } from './middleware/security.middleware.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Aplicacion Express (sin listen). Para tests con supertest. */
export function createApp() {
  const app = express();

  const { authLimiter } = setupSecurity(app);

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  app.use('/api/auth', authLimiter, authRoutes);
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
  app.use('/api/recepcion', recepcionRoutes);
  app.use('/api/insumos', insumosRoutes);
  app.use('/api/produccion', produccionRoutes);
  app.use('/api/salidas', salidasRoutes);
  app.use('/api/ordenes-exportacion', ordenesExportacionRoutes);
  app.use('/api/clientes-exportacion', clientesExportacionRoutes);
  app.use('/api/ingresos-mp', ingresosMpRoutes);
  app.use('/api/plantillas-proceso', plantillasProcesoRoutes);
  app.use('/api/envasado', envasadoRoutes);
  app.use('/api/congelado', congeladoRoutes);
  app.use('/api/empaque', empaqueRoutes);
  app.use('/api/control-produccion', controlProduccionRoutes);
  app.use('/api/parihuelas', parihuelasRoutes);
  app.use('/api/reportes-produccion', reportesProduccionRoutes);
  app.use('/api/empaque-especificaciones', empaqueEspecificacionesRoutes);
  app.use('/api/admin/actividad', adminActividadRoutes);
  app.use('/api/notificaciones', notificacionesRoutes);

  app.get('/api/health', async (req, res) => {
    try {
      const result = await pool.query('SELECT NOW()');
      res.json({
        status: 'OK',
        message: 'Servidor funcionando correctamente',
        database: 'Conectado',
        timestamp: result.rows[0].now,
      });
    } catch (error) {
      res.status(500).json({
        status: 'ERROR',
        message: 'Error de conexión a la base de datos',
        error: error.message,
      });
    }
  });

  app.use('/api/*', (req, res) => {
    res.status(404).json({ message: 'Ruta no encontrada' });
  });

  const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
  const serveFrontend = process.env.NODE_ENV === 'production' || process.env.SERVE_FRONTEND === '1';
  if (serveFrontend && fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get('*', (req, res) => {
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
  }

  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? err.message : 'Error desconocido',
    });
  });

  return app;
}
