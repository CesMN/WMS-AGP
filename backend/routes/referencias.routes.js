import express from 'express';
import { pool } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router = express.Router();
router.use(authenticateToken);

// Listar tipos de referencia por tipo
router.get('/', async (req, res) => {
  try {
    const { tipo } = req.query;
    let query = 'SELECT id, nombre, tipo FROM tipos_referencia';
    const params = [];

    if (tipo) {
      query += ' WHERE tipo = $1';
      params.push(tipo);
    }

    query += ' ORDER BY nombre';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error listando tipos de referencia:', error);
    res.status(500).json({ message: 'Error al listar tipos de referencia' });
  }
});

export default router;
