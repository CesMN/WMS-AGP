@echo off
REM Compila el frontend para producción (genera frontend/dist).
echo Compilando frontend...
cd /d "%~dp0frontend"
call npm run build
if errorlevel 1 (
  echo Error al compilar el frontend.
  pause
  exit /b 1
)
echo Frontend compilado en frontend\dist
cd /d "%~dp0"
pause
