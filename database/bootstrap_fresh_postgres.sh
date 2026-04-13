#!/usr/bin/env bash
# Inicializa una base PostgreSQL vacía (esquema + migraciones), sin tocar otras BDs.
#
# En A2/cPanel, abra Terminal SSH o "Terminal" y, desde la RAÍZ del repo clonado:
#
#   export PGHOST=localhost
#   export PGUSER=springv1_cMoran
#   export PGPASSWORD='su_clave_postgres'
#   export PGDATABASE=springv1_wms_dbv2
#   bash database/bootstrap_fresh_postgres.sh
#
# Nota: en PostgreSQL los nombres sin comillas pasan a minúsculas; si creó la BD como
# springv1_wms_dbV2 en cPanel, pruebe PGDATABASE=springv1_wms_dbv2 o springv1_wms_dbv2
# según lo que muestre: psql -h localhost -U ... -l
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DBDIR="$ROOT/database"

if [[ -z "${PGDATABASE:-}" || -z "${PGUSER:-}" ]]; then
  echo "Defina PGDATABASE y PGUSER (y PGPASSWORD)." >&2
  exit 1
fi

run_sql() {
  local f="$1"
  echo ">>> $(basename "$f")"
  psql -h "${PGHOST:-localhost}" -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 -f "$f"
}

run_sql "$DBDIR/schema.sql"

# 001–006 (no están al inicio de run-migrations.bat)
run_sql "$DBDIR/001_modulos_erp_wms.sql"
run_sql "$DBDIR/002_ingresos_materia_prima.sql"
run_sql "$DBDIR/003_vehiculos_cliente_origen_wincha_guia.sql"
run_sql "$DBDIR/004_validacion_descargas.sql"
run_sql "$DBDIR/005_embarcaciones.sql"
run_sql "$DBDIR/006_especie_tipo_descarga_clasificacion.sql"

# Mismo orden que database/run-migrations.bat (add_* y luego 007–027)
run_sql "$DBDIR/add_posicion_bloqueada.sql"
run_sql "$DBDIR/add_despachos_movimiento_id.sql"
run_sql "$DBDIR/add_peso_adicional_despacho_detalles.sql"
run_sql "$DBDIR/add_peso_adicional_movimiento_detalles.sql"
run_sql "$DBDIR/allow_zero_bultos_despacho_detalles.sql"
run_sql "$DBDIR/allow_zero_bultos_stock_posiciones.sql"
run_sql "$DBDIR/add_tipo_linea_movimiento_detalles.sql"
run_sql "$DBDIR/add_config_fuentes.sql"
run_sql "$DBDIR/add_numero_guia_movimientos.sql"
run_sql "$DBDIR/add_cliente_origen_despachos.sql"
run_sql "$DBDIR/despacho_detalles_allow_null_stock_posicion.sql"
run_sql "$DBDIR/add_lote_republicano_anos_config.sql"
run_sql "$DBDIR/007_cantidad_bultos_decimal.sql"
run_sql "$DBDIR/008_insumos_modulo.sql"
run_sql "$DBDIR/009_producto_insumo_por_bulto.sql"
run_sql "$DBDIR/010_especificaciones_empaque_por_especie.sql"
run_sql "$DBDIR/011_empaque_por_plantilla_proceso.sql"
run_sql "$DBDIR/012_plantilla_insumos_operativos.sql"
run_sql "$DBDIR/013_lote_bunker_galones.sql"
run_sql "$DBDIR/014_empaque_insumos_operativos_snapshot.sql"
run_sql "$DBDIR/015_plantilla_producto_orden.sql"
run_sql "$DBDIR/016_plantilla_snapshot_procesos.sql"
run_sql "$DBDIR/017_ordenes_contenedores.sql"
run_sql "$DBDIR/018_contenedor_referencia_exportacion.sql"
run_sql "$DBDIR/019_distribucion_por_linea_sin_lote.sql"
run_sql "$DBDIR/020_distribucion_solo_linea_sin_lotes.sql"
run_sql "$DBDIR/021_contenedor_bultos_stock_distribucion.sql"
run_sql "$DBDIR/022_asignacion_op_lote_produccion.sql"
run_sql "$DBDIR/023_contenedor_exportado_at.sql"
run_sql "$DBDIR/024_fecha_probable_embarque_op.sql"
run_sql "$DBDIR/025_registro_actividad_app.sql"
run_sql "$DBDIR/026_notificaciones_sse.sql"
run_sql "$DBDIR/027_rbac_roles_permisos.sql"

echo "Listo: esquema y migraciones aplicados en ${PGDATABASE}."
