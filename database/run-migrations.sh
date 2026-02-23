#!/bin/bash
# Ejecuta todas las migraciones sobre wms_db.
# Ajusta USUARIO y BASE si usas otros valores.
USUARIO=postgres
BASE=wms_db
DIR="$(cd "$(dirname "$0")" && pwd)"
echo "Aplicando migraciones a $BASE..."
for f in add_posicion_bloqueada add_despachos_movimiento_id add_peso_adicional_despacho_detalles add_peso_adicional_movimiento_detalles allow_zero_bultos_despacho_detalles add_tipo_linea_movimiento_detalles add_config_fuentes despacho_detalles_allow_null_stock_posicion; do
  psql -U "$USUARIO" -d "$BASE" -f "$DIR/${f}.sql" || exit 1
done
echo "Migraciones finalizadas."
