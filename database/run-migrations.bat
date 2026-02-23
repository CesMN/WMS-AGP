@echo off
REM Ejecuta todas las migraciones sobre wms_db.
REM Ajusta USUARIO y BASE si usas otros valores.
set USUARIO=postgres
set BASE=wms_db
echo Aplicando migraciones a %BASE%...
psql -U %USUARIO% -d %BASE% -f "%~dp0add_posicion_bloqueada.sql"
psql -U %USUARIO% -d %BASE% -f "%~dp0add_despachos_movimiento_id.sql"
psql -U %USUARIO% -d %BASE% -f "%~dp0add_peso_adicional_despacho_detalles.sql"
psql -U %USUARIO% -d %BASE% -f "%~dp0add_peso_adicional_movimiento_detalles.sql"
psql -U %USUARIO% -d %BASE% -f "%~dp0allow_zero_bultos_despacho_detalles.sql"
psql -U %USUARIO% -d %BASE% -f "%~dp0allow_zero_bultos_stock_posiciones.sql"
psql -U %USUARIO% -d %BASE% -f "%~dp0add_tipo_linea_movimiento_detalles.sql"
psql -U %USUARIO% -d %BASE% -f "%~dp0add_config_fuentes.sql"
psql -U %USUARIO% -d %BASE% -f "%~dp0add_numero_guia_movimientos.sql"
psql -U %USUARIO% -d %BASE% -f "%~dp0add_cliente_origen_despachos.sql"
psql -U %USUARIO% -d %BASE% -f "%~dp0despacho_detalles_allow_null_stock_posicion.sql"
echo Migraciones finalizadas.
pause
