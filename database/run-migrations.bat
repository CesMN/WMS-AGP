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
psql -U %USUARIO% -d %BASE% -f "%~dp0add_lote_republicano_anos_config.sql"
psql -U %USUARIO% -d %BASE% -f "%~dp0007_cantidad_bultos_decimal.sql"
psql -U %USUARIO% -d %BASE% -f "%~dp008_insumos_modulo.sql"
psql -U %USUARIO% -d %BASE% -f "%~dp009_producto_insumo_por_bulto.sql"
psql -U %USUARIO% -d %BASE% -f "%~dp010_especificaciones_empaque_por_especie.sql"
psql -U %USUARIO% -d %BASE% -f "%~dp011_empaque_por_plantilla_proceso.sql"
psql -U %USUARIO% -d %BASE% -f "%~dp012_plantilla_insumos_operativos.sql"
psql -U %USUARIO% -d %BASE% -f "%~dp013_lote_bunker_galones.sql"
psql -U %USUARIO% -d %BASE% -f "%~dp014_empaque_insumos_operativos_snapshot.sql"
psql -U %USUARIO% -d %BASE% -f "%~dp015_plantilla_producto_orden.sql"
psql -U %USUARIO% -d %BASE% -f "%~dp016_plantilla_snapshot_procesos.sql"
psql -U %USUARIO% -d %BASE% -f "%~dp017_ordenes_contenedores.sql"
psql -U %USUARIO% -d %BASE% -f "%~dp018_contenedor_referencia_exportacion.sql"
set "_MIGDIR=%~dp0"
psql -U %USUARIO% -d %BASE% -f "%_MIGDIR%019_distribucion_por_linea_sin_lote.sql"
psql -U %USUARIO% -d %BASE% -f "%_MIGDIR%020_distribucion_solo_linea_sin_lotes.sql"
psql -U %USUARIO% -d %BASE% -f "%_MIGDIR%021_contenedor_bultos_stock_distribucion.sql"
psql -U %USUARIO% -d %BASE% -f "%_MIGDIR%022_asignacion_op_lote_produccion.sql"
psql -U %USUARIO% -d %BASE% -f "%_MIGDIR%023_contenedor_exportado_at.sql"
psql -U %USUARIO% -d %BASE% -f "%_MIGDIR%024_fecha_probable_embarque_op.sql"
psql -U %USUARIO% -d %BASE% -f "%_MIGDIR%025_registro_actividad_app.sql"
psql -U %USUARIO% -d %BASE% -f "%_MIGDIR%026_notificaciones_sse.sql"
psql -U %USUARIO% -d %BASE% -f "%_MIGDIR%027_rbac_roles_permisos.sql"
echo Migraciones finalizadas.
pause
