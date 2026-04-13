@echo off
setlocal EnableDelayedExpansion
set ORIGEN=%~dp0
set DESTINO=%~dp0..\wms-system-desarrollo
if "%ORIGEN:~-1%"=="\" set ORIGEN=%ORIGEN:~0,-1%
if "%DESTINO:~-1%"=="\" set DESTINO=%DESTINO:~0,-1%

echo.
echo Clonando proyecto WMS para entorno de desarrollo
echo   Origen:  %ORIGEN%
echo   Destino: %DESTINO%
echo.

if exist "%DESTINO%" (
    echo [AVISO] La carpeta destino ya existe.
    set /p CONFIRMAR="Sobrescribir? (S/N): "
    if /i not "!CONFIRMAR!"=="S" (
        echo Cancelado.
        exit /b 0
    )
)

echo Copiando... se excluyen node_modules
robocopy "%ORIGEN%" "%DESTINO%" /E /XD node_modules /NFL /NDL /NJH /NJS /NC /NS /NP
if %ERRORLEVEL% GEQ 8 (
    echo Error al copiar. Codigo: %ERRORLEVEL%
    exit /b 1
)

echo.
echo Clonado creado en: %DESTINO%
echo.
echo Siguiente: abre wms-system-desarrollo en Cursor y ejecuta npm install donde haga falta.
echo.
pause
