import { pool } from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

const CAPACIDAD = 50;

async function actualizarCapacidadParihuela() {
  try {
    const cols = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'productos'`
    );
    const names = (cols.rows || []).map((r) => r.column_name);

    if (!names.includes('capacidad_parihuela_bultos')) {
      await pool.query('ALTER TABLE productos ADD COLUMN capacidad_parihuela_bultos NUMERIC(12,2)');
      console.log('Columna capacidad_parihuela_bultos creada.');
    }
    if (!names.includes('capacidad_parihuela_cajas')) {
      await pool.query('ALTER TABLE productos ADD COLUMN capacidad_parihuela_cajas NUMERIC(12,2)');
      console.log('Columna capacidad_parihuela_cajas creada.');
    }
    if (!names.includes('unidad_parihuela')) {
      await pool.query("ALTER TABLE productos ADD COLUMN unidad_parihuela VARCHAR(20) DEFAULT 'BULTOS'");
      console.log('Columna unidad_parihuela creada.');
    }

    const result = await pool.query(
      `UPDATE productos
       SET capacidad_parihuela_bultos = $1, capacidad_parihuela_cajas = $1, unidad_parihuela = 'BULTOS'
       WHERE 1=1`,
      [CAPACIDAD]
    );
    const count = result.rowCount ?? 0;
    console.log(`✅ Actualizados ${count} producto(s): capacidad por parihuela = ${CAPACIDAD} (bultos/cajas), unidad_parihuela = BULTOS.`);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

actualizarCapacidadParihuela();
