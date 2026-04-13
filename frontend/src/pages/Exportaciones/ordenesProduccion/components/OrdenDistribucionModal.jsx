import { Loader2, X } from 'lucide-react'
import Modal from '../../../../components/Modal'
import {
  productoLabelLinea,
  getAsignadoStockBultos,
  esOrigenProduccion,
  puedeDesvincularAsignacionOp,
  opEmbarqueBloqueaDesvinculacionStock,
  maxBultosEnCeldaDistrib,
  maxBultosStockEnCeldaDistrib,
  lineasOpcionSelectContenedor,
  totalReqPorContenedor,
  totalStockPorContenedor,
  contenedorRequisitoCoincideStockReal,
  normalizarBultosMedio,
} from '../helpers'

export default function OrdenDistribucionModal({
  isOpen,
  onClose,
  loadingDetalleLinea,
  detalleOrdenFull,
  soloLectura,
  isAdmin,
  distribContenedorRows,
  setDistribContenedorRows,
  distribDraft,
  setDistribDraft,
  distribStockDraft,
  setDistribStockDraft,
  guardandoDistribId,
  revirtiendoExportId,
  completandoExportId,
  desvinculandoAsignacionId,
  handleDesvincularLoteModal,
  revertirExportacionContenedor,
  completarExportarContenedor,
  agregarFilaContenedor,
  quitarFilaContenedor,
  guardarTodaDistribucion,
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Distribución por contenedores" size="2xl">
      {loadingDetalleLinea ? (
        <div className="py-8 flex items-center justify-center gap-2 text-gray-500 dark:text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          Cargando…
        </div>
      ) : !detalleOrdenFull ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Sin datos.</p>
      ) : (
        <div className="space-y-3 text-sm">
          <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
            Arme cada contenedor con <strong>+ Agregar producto</strong>: elija un producto de la OP y los bultos para ese contenedor. La suma por producto en todos los contenedores debe coincidir con lo solicitado en la OP.{' '}
            <strong>Flujo:</strong> al guardar la distribución, el contenedor queda <strong>listo para despacho</strong> y aparece en la vista «Listos para despacho» para que almacén use <strong>Crear despacho</strong> con el producto en cámara. Con <strong>Registrar referencia</strong> se guarda el código de embarque; el estado mostrado sigue siendo <strong>listo para despacho</strong>. En <strong>cada fila</strong>, requisito y stock real deben coincidir para registrar la referencia.{' '}
            {detalleOrdenFull.distribucion_balance_ok ? (
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">Balance de OP completo.</span>
            ) : (
              <span className="text-amber-600 dark:text-amber-400">Aún falta repartir o sobra cantidad respecto a lo solicitado.</span>
            )}
          </p>

          {(detalleOrdenFull.lineas || []).length > 0 && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/20 px-3 py-2">
              <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 mb-2">Stock Asignado a la OP (almacén)</p>
              <div className="wms-table-scroll">
                <table className="min-w-[36rem] w-full text-[11px]">
                  <thead>
                    <tr className="text-gray-600 dark:text-gray-400 border-b border-amber-200 dark:border-amber-800/40">
                      <th className="text-left py-1 pr-2">Producto</th>
                      <th className="text-right py-1 px-1">Solicitado</th>
                      <th className="text-right py-1 px-1">Asignado desde stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detalleOrdenFull.lineas || []).map((lin) => (
                      <tr key={lin.id} className="border-b border-amber-100/80 dark:border-amber-900/30">
                        <td className="py-1 pr-2 text-gray-900 dark:text-white">{productoLabelLinea(lin)}</td>
                        <td className="py-1 px-1 text-right tabular-nums">{Number(lin.cantidad_solicitada || 0).toFixed(2)}</td>
                        <td className="py-1 px-1 text-right tabular-nums font-medium text-amber-900 dark:text-amber-200">
                          {getAsignadoStockBultos(lin).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(detalleOrdenFull.asignaciones_orden || []).length > 0 && (
                <div className="mt-2 pt-2 border-t border-amber-200 dark:border-amber-800/40">
                  <p className="text-[10px] text-gray-600 dark:text-gray-400 mb-1.5">
                    Detalle por origen: lo imputado manualmente desde almacén se puede desvincular aquí; lo cargado desde producción solo lo revierte un administrador y solo si el lote de producción sigue abierto (no
                    terminado). No se puede desvincular si un contenedor ya está en «listos para despacho», tiene referencia registrada o el embarque ya consta como despachado.
                  </p>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {['produccion', 'stock'].map((bucket) => {
                      const items = (detalleOrdenFull.asignaciones_orden || []).filter((a) =>
                        bucket === 'produccion' ? esOrigenProduccion(a.origen) : !esOrigenProduccion(a.origen)
                      )
                      if (items.length === 0) return null
                      const titulo = bucket === 'produccion' ? 'Desde producción' : 'Stock acumulado (almacén)'
                      return (
                        <div key={bucket}>
                          <p className="text-[10px] font-semibold text-amber-900 dark:text-amber-200/95 mb-1">{titulo}</p>
                          <div className="space-y-1">
                            {items.map((a) => {
                              const lin = (detalleOrdenFull.lineas || []).find((l) => l.id === a.linea_id)
                              return (
                                <div
                                  key={a.asignacion_id}
                                  className="flex flex-wrap items-center justify-between gap-2 text-[10px] bg-white/80 dark:bg-gray-900/40 rounded px-2 py-1"
                                >
                                  <span className="text-gray-800 dark:text-gray-200 truncate min-w-0 flex-1">
                                    {lin ? productoLabelLinea(lin) : a.producto_codigo}
                                  </span>
                                  <span className="tabular-nums shrink-0">{Number(a.cantidad_total).toFixed(2)} bultos</span>
                                  {!soloLectura && puedeDesvincularAsignacionOp(a, isAdmin, detalleOrdenFull) && (
                                    <button
                                      type="button"
                                      onClick={() => handleDesvincularLoteModal(a.linea_id, a.asignacion_id)}
                                      disabled={desvinculandoAsignacionId === a.asignacion_id}
                                      className="px-1.5 py-0.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-[10px] disabled:opacity-50 shrink-0"
                                    >
                                      {desvinculandoAsignacionId === a.asignacion_id ? '…' : 'Desvincular'}
                                    </button>
                                  )}
                                  {!soloLectura && !puedeDesvincularAsignacionOp(a, isAdmin, detalleOrdenFull) && opEmbarqueBloqueaDesvinculacionStock(detalleOrdenFull) && (
                                    <span
                                      className="text-[9px] text-gray-500 dark:text-gray-400 text-right leading-tight max-w-[11rem] shrink-0"
                                      title="Mientras un contenedor esté en listos para despacho, tenga referencia registrada o el embarque figure como despachado, no se puede desvincular stock aquí."
                                    >
                                      Listos / referencia / despacho: no desvincular.
                                    </span>
                                  )}
                                  {!soloLectura &&
                                    esOrigenProduccion(a.origen) &&
                                    !puedeDesvincularAsignacionOp(a, isAdmin, detalleOrdenFull) &&
                                    !opEmbarqueBloqueaDesvinculacionStock(detalleOrdenFull) && (
                                    <span
                                      className="text-[9px] text-gray-500 dark:text-gray-400 text-right leading-tight max-w-[9rem] shrink-0"
                                      title={
                                        !isAdmin()
                                          ? 'Solo un administrador puede desvincular carga desde producción.'
                                          : String(a.lote_produccion_estado || '').trim() === 'Terminado'
                                            ? 'El lote de producción está terminado (cerrado).'
                                            : 'Sin vínculo a lote de producción.'
                                      }
                                    >
                                      {!isAdmin()
                                        ? 'Producción: solo admin.'
                                        : String(a.lote_produccion_estado || '').trim() === 'Terminado'
                                          ? 'Lote cerrado.'
                                          : 'Sin lote.'}
                                    </span>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {(detalleOrdenFull.contenedores || []).map((cont) => (
            <div
              key={cont.id}
              className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800/50 overflow-hidden"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center px-3 py-2.5 bg-slate-100/90 dark:bg-slate-800/80 border-b border-gray-200 dark:border-gray-600">
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  {cont.indice}. Contenedor {cont.letra}
                </span>
                <span className="text-[10px] text-gray-500 dark:text-gray-400 sm:ml-auto flex flex-wrap items-center gap-2">
                  {cont.despachado_at ? (
                    <>
                      <span
                        className="px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-900/40 text-sky-900 dark:text-sky-100"
                        title="Referencia de embarque registrada — listo para despacho"
                      >
                        Listo para despacho
                      </span>
                      {cont.codigo_exportacion && (
                        <span className="font-mono text-indigo-700 dark:text-indigo-300">{cont.codigo_exportacion}</span>
                      )}
                    </>
                  ) : cont.listo_para_exportar ? (
                    <span
                      className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200"
                      title="Contenedor enviado a la lista «Listos para despacho»; siguiente paso: Crear despacho en almacén"
                    >
                      Listo para despacho
                    </span>
                  ) : (
                    <span className="text-gray-500">Pendiente de distribución</span>
                  )}
                </span>
                {cont.despachado_at && isAdmin() && (
                  <button
                    type="button"
                    disabled={revirtiendoExportId === cont.id || !!cont.embarque_despacho_cerrado}
                    onClick={() => revertirExportacionContenedor(detalleOrdenFull, cont)}
                    className="shrink-0 w-full sm:w-auto min-h-[40px] sm:min-h-0 px-3 py-2 sm:py-1 text-xs font-medium bg-orange-600 hover:bg-orange-700 text-white rounded-md disabled:opacity-40"
                    title={
                      cont.embarque_despacho_cerrado
                        ? 'El embarque ya está despachado. Revise o reabra el despacho en el módulo Despachos antes de revertir la referencia aquí.'
                        : 'Quita la referencia registrada para poder editar (solo administrador)'
                    }
                  >
                    {revirtiendoExportId === cont.id ? '…' : 'Revertir referencia'}
                  </button>
                )}
                {!cont.despachado_at && !soloLectura && (
                  <button
                    type="button"
                    disabled={
                      completandoExportId === cont.id ||
                      !detalleOrdenFull.distribucion_balance_ok ||
                      !contenedorRequisitoCoincideStockReal(cont.id, distribContenedorRows, distribDraft, distribStockDraft)
                    }
                    title={
                      !detalleOrdenFull.distribucion_balance_ok
                        ? 'Guarde primero la distribución completa (abajo)'
                        : !contenedorRequisitoCoincideStockReal(cont.id, distribContenedorRows, distribDraft, distribStockDraft)
                          ? 'En cada fila, requisito y desde stock (real) deben coincidir'
                          : 'Registra la referencia de embarque (sigue listo para despacho)'
                    }
                    onClick={() => completarExportarContenedor(detalleOrdenFull, cont)}
                    className="shrink-0 w-full sm:w-auto min-h-[40px] sm:min-h-0 px-3 py-2 sm:py-1 text-xs font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-md disabled:opacity-40"
                  >
                    {completandoExportId === cont.id ? '…' : 'Registrar referencia'}
                  </button>
                )}
              </div>
              <div className="wms-table-scroll">
                <table className="min-w-[36rem] w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-900/40 text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-600">
                      <th className="text-left font-medium px-3 py-1.5">Producto</th>
                      <th className="text-right font-medium px-3 py-1.5 w-[7.5rem]">Bultos (requisito)</th>
                      <th className="text-right font-medium px-3 py-1.5 w-[7.5rem]">Desde stock (real)</th>
                      {!soloLectura && !cont.despachado_at && !cont.listo_para_exportar && <th className="w-10" />}
                    </tr>
                  </thead>
                  <tbody>
                    {(distribContenedorRows[cont.id] || []).length === 0 ? (
                      <tr>
                        <td colSpan={soloLectura || cont.despachado_at || cont.listo_para_exportar ? 3 : 4} className="px-3 py-3 text-center text-gray-500 text-[11px]">
                          Sin productos. Use «Agregar producto».
                        </td>
                      </tr>
                    ) : (
                      (distribContenedorRows[cont.id] || []).map((fila) => {
                        const lin = fila.lineaId ? (detalleOrdenFull.lineas || []).find((l) => l.id === fila.lineaId) : null
                        const maxAqui =
                          lin && fila.lineaId
                            ? maxBultosEnCeldaDistrib(detalleOrdenFull, distribDraft, distribContenedorRows, fila.lineaId, cont.id, fila.rowKey)
                            : 0
                        const maxStock =
                          lin && fila.lineaId
                            ? maxBultosStockEnCeldaDistrib(
                                detalleOrdenFull,
                                distribStockDraft,
                                distribDraft,
                                distribContenedorRows,
                                fila.lineaId,
                                cont.id,
                                fila.rowKey
                              )
                            : 0
                        const val = distribDraft[cont.id]?.[fila.rowKey] ?? ''
                        const valStock = distribStockDraft[cont.id]?.[fila.rowKey] ?? ''
                        const asignadoPorAsignacionesModal = lin
                          ? (detalleOrdenFull.asignaciones_orden || [])
                              .filter((a) => String(a.linea_id) === String(lin.id))
                              .reduce((s, a) => s + (Number(a.cantidad_total) || 0), 0)
                          : 0
                        const cargadaLin = lin ? Math.max(getAsignadoStockBultos(lin), asignadoPorAsignacionesModal) : 0
                        const stockBloqueado = !!cont.despachado_at || soloLectura || !fila.lineaId || cargadaLin <= 0
                        const opciones = lineasOpcionSelectContenedor(cont.id, fila.rowKey, distribContenedorRows, detalleOrdenFull?.lineas)
                        return (
                          <tr key={fila.rowKey} className="border-b border-gray-100 dark:border-gray-700/80">
                            <td className="px-3 py-1.5 align-middle">
                              <select
                                disabled={!!cont.despachado_at || soloLectura}
                                value={fila.lineaId || ''}
                                onChange={(e) => {
                                  const v = e.target.value || null
                                  setDistribContenedorRows((prev) => ({
                                    ...prev,
                                    [cont.id]: (prev[cont.id] || []).map((r) => (r.rowKey === fila.rowKey ? { ...r, lineaId: v } : r)),
                                  }))
                                  setDistribStockDraft((prev) => ({
                                    ...prev,
                                    [cont.id]: { ...(prev[cont.id] || {}), [fila.rowKey]: '' },
                                  }))
                                }}
                                className="w-full max-w-[min(100%,22rem)] text-xs border border-gray-300 dark:border-gray-600 rounded px-1.5 py-1 bg-white dark:bg-gray-900 dark:text-white disabled:opacity-60"
                              >
                                <option value="">— Elegir producto —</option>
                                {opciones.map((l) => (
                                  <option key={l.id} value={l.id}>
                                    {productoLabelLinea(l)}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              <input
                                type="number"
                                min={0}
                                step="0.5"
                                disabled={!!cont.despachado_at || soloLectura || !fila.lineaId}
                                value={val}
                                onChange={(e) => {
                                  const raw = e.target.value
                                  if (raw === '') {
                                    setDistribDraft((prev) => ({
                                      ...prev,
                                      [cont.id]: { ...prev[cont.id], [fila.rowKey]: '' },
                                    }))
                                    return
                                  }
                                  const parsed = Number(String(raw).replace(',', '.'))
                                  const valueHalf = Number.isFinite(parsed) ? normalizarBultosMedio(Math.max(0, parsed)) : 0
                                  setDistribDraft((prev) => ({
                                    ...prev,
                                    [cont.id]: { ...prev[cont.id], [fila.rowKey]: valueHalf > 0 ? String(valueHalf) : '' },
                                  }))
                                }}
                                className="w-full max-w-[7rem] ml-auto px-1.5 py-0.5 border border-gray-300 dark:border-gray-600 rounded text-right text-xs dark:bg-gray-900 dark:text-white disabled:opacity-50"
                                title={lin ? `Máx. requisito aquí: ${maxAqui.toFixed(2)} bultos` : 'Elija producto'}
                              />
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              <input
                                type="number"
                                min={0}
                                step="0.5"
                                disabled={stockBloqueado}
                                value={valStock}
                                onChange={(e) => {
                                  const raw = e.target.value
                                  if (raw === '') {
                                    setDistribStockDraft((prev) => ({
                                      ...prev,
                                      [cont.id]: { ...prev[cont.id], [fila.rowKey]: '' },
                                    }))
                                    return
                                  }
                                  const parsed = Number(String(raw).replace(',', '.'))
                                  const valueHalf = Number.isFinite(parsed) ? normalizarBultosMedio(Math.max(0, parsed)) : 0
                                  setDistribStockDraft((prev) => ({
                                    ...prev,
                                    [cont.id]: { ...prev[cont.id], [fila.rowKey]: valueHalf > 0 ? String(valueHalf) : '' },
                                  }))
                                }}
                                onBlur={() => {
                                  setDistribStockDraft((sPrev) => {
                                    const stockN = Number(sPrev[cont.id]?.[fila.rowKey]) || 0
                                    const maxS = maxBultosStockEnCeldaDistrib(
                                      detalleOrdenFull,
                                      sPrev,
                                      distribDraft,
                                      distribContenedorRows,
                                      fila.lineaId,
                                      cont.id,
                                      fila.rowKey
                                    )
                                    const clamped = normalizarBultosMedio(Math.min(stockN, maxS))
                                    if (clamped === stockN) return sPrev
                                    return {
                                      ...sPrev,
                                      [cont.id]: {
                                        ...sPrev[cont.id],
                                        [fila.rowKey]: clamped === 0 ? '' : String(clamped),
                                      },
                                    }
                                  })
                                }}
                                className="w-full max-w-[7rem] ml-auto px-1.5 py-0.5 border border-amber-300/80 dark:border-amber-700 rounded text-right text-xs dark:bg-gray-900 dark:text-amber-100/90 disabled:opacity-50"
                                title={
                                  cargadaLin <= 0
                                    ? 'Sin bultos imputados desde stock en esta línea'
                                    : `Máx. ${maxStock.toFixed(2)} (reparto entre contenedores; no más que el requisito en esta celda)`
                                }
                              />
                            </td>
                            {!soloLectura && !cont.despachado_at && !cont.listo_para_exportar && (
                              <td className="px-1 py-1 text-center">
                                <button
                                  type="button"
                                  onClick={() => quitarFilaContenedor(cont.id, fila.rowKey)}
                                  className="p-1 rounded text-gray-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                                  title="Quitar fila"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            )}
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <div className="px-3 py-2 border-t border-gray-100 dark:border-gray-700 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div className="text-[11px] text-gray-600 dark:text-gray-400">
                  <span className="mr-4">
                    Total requisito (OP):{' '}
                    <strong className="tabular-nums text-gray-900 dark:text-gray-100">
                      {totalReqPorContenedor(cont.id, distribContenedorRows, distribDraft).toFixed(2)}
                    </strong>
                  </span>
                  <span>
                    Total desde stock (real):{' '}
                    <strong className="tabular-nums text-amber-800 dark:text-amber-200">
                      {totalStockPorContenedor(cont.id, distribContenedorRows, distribStockDraft).toFixed(2)}
                    </strong>
                  </span>
                </div>
                {!cont.despachado_at && !cont.listo_para_exportar && !soloLectura && (
                  <button
                    type="button"
                    onClick={() => agregarFilaContenedor(cont.id)}
                    className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline shrink-0 min-h-[44px] sm:min-h-0 inline-flex items-center"
                  >
                    + Agregar producto
                  </button>
                )}
              </div>
            </div>
          ))}

          {(detalleOrdenFull.contenedores || []).length > 0 && (detalleOrdenFull.lineas || []).length > 0 && !soloLectura && (
            <div className="pt-1 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                disabled={guardandoDistribId === 'ALL' || !detalleOrdenFull.id}
                onClick={() => guardarTodaDistribucion(detalleOrdenFull)}
                className="w-full py-2 text-sm font-medium bg-primary-600 hover:bg-primary-700 text-white rounded-lg disabled:opacity-50"
              >
                {guardandoDistribId === 'ALL' ? 'Guardando…' : 'Guardar distribución (toda la OP)'}
              </button>
              <p className="text-[10px] text-center text-gray-500 dark:text-gray-400 mt-1">
                Guarde la distribución para enviar contenedores a «Listos para despacho»; desde allí almacén usa «Crear despacho»; aquí puede registrar la referencia de embarque cuando corresponda.
              </p>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
