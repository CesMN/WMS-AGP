import bcrypt from 'bcryptjs';
import { pool } from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

async function initAdmin() {
  try {
    const email = 'admin@wms.com';
    const password = 'admin123';
    const nombre = 'Administrador';
    
    // Generar hash de contraseña
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Verificar si ya existe
    const checkResult = await pool.query(
      'SELECT id FROM usuarios WHERE email = $1',
      [email]
    );
    
    if (checkResult.rows.length > 0) {
      console.log('✅ Usuario administrador ya existe');
      return;
    }
    
    // Crear usuario administrador
    const result = await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol) 
       VALUES ($1, $2, $3, 'Admin') 
       RETURNING id, nombre, email, rol`,
      [nombre, email, passwordHash]
    );
    
    console.log('✅ Usuario administrador creado exitosamente:');
    console.log(result.rows[0]);
    console.log(`\n📧 Email: ${email}`);
    console.log(`🔑 Contraseña: ${password}`);
    console.log('\n⚠️  IMPORTANTE: Cambia la contraseña después del primer inicio de sesión');
    
  } catch (error) {
    console.error('❌ Error al crear usuario administrador:', error);
  } finally {
    await pool.end();
  }
}

initAdmin();
