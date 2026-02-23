@echo off
REM Prepara el proyecto para copiar a otro equipo (instala deps, compila frontend).
REM Después de ejecutar: copia toda la carpeta wms-system al PC destino (sin node_modules del frontend si quieres ahorrar espacio; en destino ejecuta npm install en frontend y backend).
echo === Empaquetando WMS para pruebas en otro equipo ===
cd /d "%~dp0"

echo.
echo [1/4] Instalando dependencias del backend...
cd backend
call npm install
if errorlevel 1 goto error
cd ..

echo.
echo [2/4] Instalando dependencias del frontend...
cd frontend
call npm install
if errorlevel 1 goto error
cd ..

echo.
echo [3/4] Compilando frontend...
cd frontend
call npm run build
if errorlevel 1 goto error
cd ..

echo.
echo [4/4] Listo.
echo.
echo Para llevar a otro PC:
echo   1. Copia toda la carpeta wms-system (incluyendo backend\node_modules y frontend\node_modules y frontend\dist).
echo   2. En el PC destino: instala Node.js y PostgreSQL, crea la BD wms_db, ejecuta schema + migraciones.
echo   3. Copia backend\.env.example a backend\.env y edita con los datos de PostgreSQL del destino.
echo   4. Ejecuta iniciar-produccion.bat y abre http://localhost:5000
echo.
echo Ver DESPLIEGUE.md para pasos detallados.
pause
exit /b 0
:error
echo Fallo en el proceso.
pause
exit /b 1
