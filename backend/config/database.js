import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;

// Si existe DATABASE_URL (Render, Railway, etc.) se usa; si no, usamos DB_HOST, DB_USER, etc.
const databaseUrl = process.env.DATABASE_URL;
const poolConfig = databaseUrl
  ? { connectionString: databaseUrl, max: 20, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000, ssl: databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false } }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'wms_db',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    };

export const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Error inesperado en el cliente de PostgreSQL', err);
  process.exit(-1);
});

// Función para probar la conexión
export const testConnection = async () => {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Conexión a PostgreSQL exitosa:', result.rows[0].now);
    return true;
  } catch (error) {
    console.error('❌ Error al conectar a PostgreSQL:', error.message);
    return false;
  }
};
