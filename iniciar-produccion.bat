@echo off
REM Inicia el servidor en modo producción: sirve API + frontend desde http://localhost:5000
REM Requiere: 1) PostgreSQL con wms_db creado y migraciones aplicadas
REM           2) backend\.env configurado (copia desde .env.example)
REM           3) Ejecutar build-frontend.bat al menos una vez
set NODE_ENV=production
set SERVE_FRONTEND=1
cd /d "%~dp0backend"
echo Iniciando WMS en http://localhost:5000
node server.js
pause
