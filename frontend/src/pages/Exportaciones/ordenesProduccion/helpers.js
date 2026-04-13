export const LB_A_KG = 2.2046

export const EPS_BULTOS_DIST = 0.01

export function getProductoLabel(p) {
  return [p.codigo, p.descripcion || p.producto, p.presentacion].filter(Boolean).join(' – ')
}

export function getAsignadoStockBultos(line) {
  return Number(line?.bultos_asignados_stock_op ?? line?.cantidad_cargada ?? 0) || 0
}

export function normalizarBultosMedio(n) {
  return Math.round((Number(n) || 0) * 2) / 2
}

export function nuevoRowKey() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? `n_${crypto.randomUUID()}`
    : `n_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

/** Máx. bultos que puede llevar esta celda: solicitado OP − mismo producto en otros contenedores/filas (usa borrador). */
export function maxBultosEnCeldaDistrib(orden, distribDraft, distribRows, lineaId, contId, rowKey) {
  const line = orden?.lineas?.find((l) => l.id === lineaId)
  if (!line) return 0
  const sol = Number(line.cantidad_solicitada) || 0
  let otros = 0
  for (const c of orden.contenedores || []) {
    for (const r of distribRows[c.id] || []) {
      if (r.lineaId !== lineaId) continue
      if (c.id === contId && r.rowKey === rowKey) continue
      otros += Number(distribDraft[c.id]?.[r.rowKey] || 0)
    }
  }
  return Math.max(0, sol - otros)
}

/** Máx. bultos desde stock (imputados) en esta celda: no más que req. en celda ni que lo no repartido en otras celdas. */
export function maxBultosStockEnCeldaDistrib(orden, distribStockDraft, distribDraft, distribRows, lineaId, contId, rowKey) {
  const line = orden?.lineas?.find((l) => l.id === lineaId)
  if (!line) return 0
  const asignadoPorAsignaciones = (orden?.asignaciones_orden || [])
    .filter((a) => String(a.linea_id) === String(lineaId))
    .reduce((s, a) => s + (Number(a.cantidad_total) || 0), 0)
  const cargada = Math.max(getAsignadoStockBultos(line), asignadoPorAsignaciones)
  let otrosStock = 0
  for (const c of orden.contenedores || []) {
    for (const r of distribRows[c.id] || []) {
      if (r.lineaId !== lineaId) continue
      if (c.id === contId && r.rowKey === rowKey) continue
      otrosStock += Number(distribStockDraft[c.id]?.[r.rowKey]) || 0
    }
  }
  const rem = Math.max(0, cargada - otrosStock)
  const reqInCell = Number(distribDraft[contId]?.[rowKey]) || 0
  return Math.min(reqInCell, rem)
}

export function totalReqPorContenedor(contId, distribContenedorRows, distribDraft) {
  let s = 0
  for (const r of distribContenedorRows[contId] || []) {
    const v = Number(distribDraft[contId]?.[r.rowKey])
    if (Number.isFinite(v) && v > 0) s += v
  }
  return s
}

export function totalStockPorContenedor(contId, distribContenedorRows, distribStockDraft) {
  let s = 0
  for (const r of distribContenedorRows[contId] || []) {
    const v = Number(distribStockDraft[contId]?.[r.rowKey])
    if (Number.isFinite(v) && v > 0) s += v
  }
  return s
}

/** Listo para despacho (lista almacén) → referencia en OP: requisito = stock real por fila. */
export function contenedorRequisitoCoincideStockReal(
  contId,
  distribContenedorRows,
  distribDraft,
  distribStockDraft,
  eps = EPS_BULTOS_DIST
) {
  for (const fila of distribContenedorRows[contId] || []) {
    const req = Number(distribDraft[contId]?.[fila.rowKey]) || 0
    const stock = Number(distribStockDraft[contId]?.[fila.rowKey]) || 0
    if (!fila.lineaId) {
      if (req > eps || stock > eps) return false
      continue
    }
    if (Math.abs(req - stock) > eps) return false
  }
  return true
}

export function lineasOpcionSelectContenedor(contId, rowKeyActual, distribContenedorRows, lineas) {
  const usados = new Set(
    (distribContenedorRows[contId] || [])
      .filter((r) => r.rowKey !== rowKeyActual && r.lineaId)
      .map((r) => r.lineaId)
  )
  return (lineas || []).filter((l) => {
    const cur = (distribContenedorRows[contId] || []).find((x) => x.rowKey === rowKeyActual)?.lineaId
    if (cur === l.id) return true
    return !usados.has(l.id)
  })
}

export function productoLabelLinea(lin) {
  return [lin.producto_codigo, lin.producto_descripcion || lin.producto_nombre].filter(Boolean).join(' — ')
}

/** Imputaciones con origen explícito de producción (resto = stock de almacén acumulado). */
export function esOrigenProduccion(origen) {
  const o = String(origen || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  return o === 'produccion' || o === 'produccion_op' || o === 'desde_produccion' || o.startsWith('prod_')
}

/** Contenedor ya en flujo listos / referencia / despacho físico: no desvincular imputaciones. */
export function opEmbarqueBloqueaDesvinculacionStock(detalleOrdenFull) {
  const conts = detalleOrdenFull?.contenedores || []
  return conts.some(
    (c) => !!c.despachado_at || !!c.listo_para_exportar || !!c.embarque_despacho_cerrado
  )
}

/** Desde stock: cualquier usuario puede desvincular. Desde producción: solo Admin y lote no terminado. */
export function puedeDesvincularAsignacionOp(a, isAdminFn, detalleOrdenFull) {
  if (opEmbarqueBloqueaDesvinculacionStock(detalleOrdenFull)) return false
  if (!esOrigenProduccion(a?.origen)) return true
  if (!isAdminFn()) return false
  if (!a?.lote_produccion_id) return false
  if (String(a.lote_produccion_estado || '').trim() === 'Terminado') return false
  return true
}

export function bultosToKg(bultos, formato, unidadMedida) {
  const b = Number(bultos) || 0
  const f = Number(formato) || 0
  const um = (unidadMedida || 'KG').toUpperCase()
  if (f <= 0) return 0
  if (um === 'LB') return (b * f) / LB_A_KG
  return b * f
}

export function filterProductosByQuery(productosCliente, query) {
  if (!query || !query.trim()) return productosCliente
  const q = query.trim().toLowerCase()
  return productosCliente.filter((p) => {
    const label = getProductoLabel(p).toLowerCase()
    const codigo = (p.codigo || '').toLowerCase()
    const desc = (p.descripcion || '').toLowerCase()
    const prod = (p.producto || '').toLowerCase()
    const pres = (p.presentacion || '').toLowerCase()
    return label.includes(q) || codigo.includes(q) || desc.includes(q) || prod.includes(q) || pres.includes(q)
  })
}
