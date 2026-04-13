# Clonar proyecto WMS — Dos entornos

Este documento describe cómo mantener **dos copias** del proyecto:

| Entorno | Carpeta sugerida | Uso |
|--------|-------------------|-----|
| **Original (pruebas/producción)** | `wms-system` | Sigue en pruebas. Correcciones y cambios seguros. |
| **Clon (desarrollo local)** | `wms-system-desarrollo` | Implementaciones nuevas. Trabajo local. |

---

## Opción 1: Clonar con script (recomendado en PowerShell)

1. Cierra Cursor/IDE y cualquier proceso que use la carpeta actual (backend, frontend).
2. Abre **PowerShell** en la carpeta del proyecto original:
   ```powershell
   cd c:\Users\Admin\wms-system
   ```
3. Ejecuta el script de PowerShell (evita errores de codificación del .bat):
   ```powershell
   .\clonar-entorno.ps1
   ```
   Si aparece error de permisos de ejecución, ejecuta una vez:
   ```powershell
   Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
   ```
   y vuelve a ejecutar `.\clonar-entorno.ps1`.

   **Alternativa con el .bat:** abre **Símbolo del sistema (cmd)** en la misma carpeta y ejecuta:
   ```cmd
   clonar-entorno.bat
   ```
4. Se creará la carpeta `c:\Users\Admin\wms-system-desarrollo` con una copia completa.
5. Abre el **clon** en Cursor como carpeta de trabajo cuando quieras desarrollar:
   - Archivo → Abrir carpeta → `c:\Users\Admin\wms-system-desarrollo`

---

## Opción 2: Clonar manualmente

1. Cierra Cursor y los servidores (backend/frontend).
2. En el Explorador de archivos, copia toda la carpeta:
   - **Origen:** `c:\Users\Admin\wms-system`
   - **Destino:** `c:\Users\Admin\wms-system-desarrollo` (o el nombre que prefieras).
3. No copies dentro de la misma carpeta; usa una carpeta hermana (mismo nivel).
4. Abre la **copia nueva** en Cursor para trabajar en desarrollo.

---

## Después de clonar (entorno desarrollo)

1. **Backend `.env`**  
   En el clon, revisa o crea `backend\.env`:
   - Puedes usar el **mismo** `DB_*` si quieres compartir base de datos con pruebas.
   - O una base distinta para no afectar el original (ej. `DB_NAME=wms_db_desarrollo`).
   - Si vas a tener ambos proyectos corriendo a la vez, cambia el puerto en el clon, por ejemplo:
     ```env
     PORT=5001
     ```

2. **Frontend**  
   Si backend del clon usa otro puerto (ej. 5001), en el clon ajusta la URL del API en el frontend (por ejemplo en `frontend/.env` o en la config de Vite) para que apunte a ese puerto.

3. **Base de datos (opcional)**  
   Si quieres una BD separada para desarrollo:
   - Crea una base nueva en PostgreSQL (ej. `wms_db_desarrollo`).
   - En el clon, en `backend\.env`, pon `DB_NAME=wms_db_desarrollo`.
   - Ejecuta las migraciones en esa base desde la carpeta del clon:
     ```cmd
     cd c:\Users\Admin\wms-system-desarrollo\database
     run-migrations.bat
     ```
     (Ajustando en el script la conexión si hace falta.)

---

## Resumen de flujo

- **wms-system** → Entorno de pruebas/producción. Solo cambios seguros y correcciones.
- **wms-system-desarrollo** → Entorno local. Aquí haces las implementaciones nuevas; cuando estén estables, puedes llevar los cambios al original (copiando archivos o usando Git).

Si usas **Git**: puedes tener un repositorio en cada carpeta, o un solo repo con dos ramas (ej. `main` = original, `desarrollo` = clon) y fusionar cuando quieras llevar cambios al original.
