@echo off
echo Iniciando servidor frontend...
cd frontend
if not exist node_modules (
    echo Instalando dependencias...
    call npm install
)
call npm run dev
pause
