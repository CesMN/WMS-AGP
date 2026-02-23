@echo off
echo Iniciando servidor backend...
cd backend
if not exist node_modules (
    echo Instalando dependencias...
    call npm install
)
call npm run dev
pause
