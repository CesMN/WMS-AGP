import React, { useState, useEffect } from 'react'
import { ClipboardList, Loader2, Save, Plus, XCircle } from 'lucide-react'
import { controlProduccionApi } from '../../api/control-produccion'
import toast from 'react-hot-toast'
import { CheckCircle, Circle, FlaskConical, Snowflake, Package } from 'lucide-react'

const ControlProduccion = () => {
  const [lotesActivos, setLotesActivos] = useState([])
  const [loading, setLoading] = useState(true)
  const [loteSeleccionado, setLoteSeleccionado] = useState(null)
  const [controlData, setControlData] = useState(null)
  const [loadingControl, setLoadingControl] = useState(false)
  const [opcionesOpByProducto, setOpcionesOpByProducto] = useState({})
  const [asignacionEdit, setAsignacionEdit] = useState({})
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [applying, setApplying] = useState(false)

  const handleGridArrowNav = (e, gridId, row, col, maxRow, maxCol) => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return
    e.preventDefault()
    let nextRow = row
    let nextCol = col
    if (e.key === 'ArrowUp') nextRow = Math.max(0, row - 1)
    if (e.key === 'ArrowDown') nextRow = Math.min(maxRow, row + 1)
    if (e.key === 'ArrowLeft') nextCol = Math.max(0, col - 1)
    if (e.key === 'ArrowRight') nextCol = Math.min(maxCol, col + 1)
    const next = document.querySelector(`[data-grid="${gridId}"][data-row="${nextRow}"][data-col="${nextCol}"]`)
    if (next) next.focus()
  }

  const loadLotes = () => {
    setLoading(true)
    controlProduccionApi.lotesActivos()
      .then(({ data }) => setLotesActivos(data?.data ?? data ?? []))
      .catch(() => toast.error('Error al cargar lotes'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadLotes()
  }, [])

  const loadControl = (loteId) => {
    if (!loteId) return
    setLoadingControl(true)
    controlProduccionApi.porLote(loteId)
      .then(({ data }) => {
        setControlData(data)
        const edit = {}
        const productIds = new Set((data?.productos || []).map((p) => p.producto_id))
        data?.productos?.forEach((p) => {
          edit[p.producto_id] = (p.asignacion || [])
            .sort((a, b) => a.prioridad - b.prioridad)
            .map((a) => a.linea_id || null)
        })
        setAsignacionEdit(edit)
        setDirty(false)
        productIds.forEach((pid) => {
          controlProduccionApi.opcionesOp(pid)
            .then(({ data: opts }) => setOpcionesOpByProducto((prev) => ({ ...prev, [pid]: opts?.data ?? opts ?? [] })))
            .catch(() => setOpcionesOpByProducto((prev) => ({ ...prev, [pid]: [] })))
        })
      })
      .catch(() => toast.error('Error al cargar control'))
      .finally(() => setLoadingControl(false))
  }

  const handleClickLote = (lote) => {
    setLoteSeleccionado(lote)
    loadControl(lote.id)
  }

  const productosAgrupados = () => {
    if (!controlData?.productos?.length) return []
    const orderIdx = new Map()
    controlData.productos.forEach((p, i) => {
      if (!orderIdx.has(p.producto_id)) orderIdx.set(p.producto_id, i)
    })
    const byProducto = new Map()
    controlData.productos.forEach((p) => {
      const nombreProducto = (p.producto || '').trim() || 'Sin producto'
      if (!byProducto.has(nombreProducto)) byProducto.set(nombreProducto, [])
      byProducto.get(nombreProducto).push(p)
    })
    const groups = Array.from(byProducto.entries()).map(([nombreProducto, productos]) => ({
      nombreProducto,
      productos: [...productos].sort((a, b) => (orderIdx.get(a.producto_id) ?? 0) - (orderIdx.get(b.producto_id) ?? 0)),
    }))
    return groups.sort((a, b) => {
      const minA = Math.min(...a.productos.map((p) => orderIdx.get(p.producto_id) ?? 999999))
      const minB = Math.min(...b.productos.map((p) => orderIdx.get(p.producto_id) ?? 999999))
      if (minA !== minB) return minA - minB
      return (a.nombreProducto || '').localeCompare(b.nombreProducto || '', 'es')
    })
  }

  const setAsignacionPrioridad = (productoId, index, lineaId) => {
    setAsignacionEdit((prev) => {
      const arr = [...(prev[productoId] || [])]
      while (arr.length <= index) arr.push(null)
      arr[index] = lineaId || null
      return { ...prev, [productoId]: arr }
    })
    setDirty(true)
  }

  const agregarPrioridad = (productoId) => {
    setAsignacionEdit((prev) => {
      const arr = [...(prev[productoId] || []), null]
      return { ...prev, [productoId]: arr }
    })
    setDirty(true)
  }

  const quitarPrioridad = (productoId, index) => {
    setAsignacionEdit((prev) => {
      const arr = (prev[productoId] || []).filter((_, i) => i !== index)
      return { ...prev, [productoId]: arr }
    })
    setDirty(true)
  }

  const handleGuardarAsignacion = () => {
    if (!loteSeleccionado?.id || !controlData?.productos) return
    setSaving(true)
    const asignacion = controlData.productos.map((p) => ({
      producto_id: p.producto_id,
      linea_ids: asignacionEdit[p.producto_id] || [],
    }))
    controlProduccionApi.guardarAsignacion(loteSeleccionado.id, asignacion)
      .then(() => {
        toast.success('Asignación guardada')
        setDirty(false)
        loadControl(loteSeleccionado.id)
      })
      .catch(() => toast.error('Error al guardar'))
      .finally(() => setSaving(false))
  }

  const totalesCoinciden = (p) => {
    const e = Number(p.total_envasado_kg) || 0
    const c = Number(p.total_congelado_kg) || 0
    const em = Number(p.total_empaque_kg) || 0
    const base = Number(e.toFixed(1))
    const vals = [c, em]
    return vals.every((v) => Number(v.toFixed(1)) === base)
  }

  const iconoCoincidencia = (p) => {
    const coincide = totalesCoinciden(p)
    if (!p) return null
    if (coincide) {
      return <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" title="Totales coinciden" />
    }
    return <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" title="Totales no coinciden" />
  }

  const totalesGenerales = () => {
    let envasado = 0
    let congelado = 0
    let empaqueKg = 0
    let bultos = 0
    let enviadoCamara = 0
    if (!controlData?.productos) return { envasado, congelado, empaqueKg, bultos, enviadoCamara }
    controlData.productos.forEach((p) => {
      envasado += Number(p.total_envasado_kg) || 0
      congelado += Number(p.total_congelado_kg) || 0
      empaqueKg += Number(p.total_empaque_kg) || 0
      bultos += Number(p.total_empaque_bultos) || 0
      enviadoCamara += Number(p.enviado_a_camara) || 0
    })
    return { envasado, congelado, empaqueKg, bultos, enviadoCamara }
  }

  const todoValidado = () => {
    if (!controlData?.productos?.length) return false
    return controlData.productos.every((p) => totalesCoinciden(p))
  }

  const todoValidadoCamara = () => {
    if (!controlData?.productos?.length) return true
    return controlData.productos.every((p) => p.validado_camara !== false)
  }

  const mensajeAplicacionOp = (p) => {
    const total = Number(p.total_empaque_bultos) || 0
    let restante = total
    const formato = Number(p.formato) || 0
    const um = (p.unidad_medida || 'KG').toUpperCase()
    const bultosToKg = (b) => {
      if (formato <= 0) return 0
      if (um === 'LB') return (Number(b) * formato) / 2.2046
      return Number(b) * formato
    }

    const seleccion = (asignacionEdit[p.producto_id] || []).length ? asignacionEdit[p.producto_id] : [null]
    const opciones = opcionesOpByProducto[p.producto_id] || []

    const parts = []
    for (const lineaId of seleccion) {
      if (restante <= 0) break
      if (!lineaId) continue
      const op = opciones.find((x) => x.linea_id === lineaId)
      if (!op) continue
      const falt = Number(op.faltante_bultos) || 0
      if (falt <= 0) continue
      const add = Math.min(restante, falt)
      if (add > 0) {
        parts.push(`${op.numero_op}: +${add} b (${bultosToKg(add).toFixed(1)} kg)`)
        restante -= add
      }
    }
    if (restante > 0 && total > 0) parts.push(`Sin OP: +${restante} b`)
    if (!parts.length) return total > 0 ? `Sin OP: +${total} b` : '—'
    return parts.join(' · ')
  }

  const estadoTexto = (estado) => {
    if (!estado) return { label: 'Sin registro', className: 'text-xs font-medium text-gray-400 dark:text-gray-500' }
    if (estado === 'finalizado') return { label: 'Finalizado', className: 'text-xs font-medium text-green-600 dark:text-green-400' }
    return { label: 'En proceso', className: 'text-xs font-medium text-amber-600 dark:text-amber-400' }
  }

  if (loading && lotesActivos.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-10 h-10 animate-spin text-primary-600" />
      </div>
    )
  }

  return (
    <div className="min-w-0 max-w-full">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between mb-4">
        <div className="flex items-start gap-3 min-w-0">
        <div className="p-2 rounded-lg bg-primary-100 dark:bg-primary-900/40 shrink-0">
          <ClipboardList className="w-6 h-6 text-primary-600 dark:text-primary-400" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">Control de producción</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Totales y asignación a OP</p>
        </div>
        </div>
        <div className="w-full xl:flex-1 xl:min-w-0 xl:max-w-none">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 xl:hidden">Lote activo</p>
          <div className="flex flex-nowrap gap-2 overflow-x-auto pb-2 -mx-1 px-1 wms-table-scroll xl:justify-end xl:overflow-visible xl:flex-wrap xl:pb-0">
          {lotesActivos.length === 0 ? (
            <span className="text-sm text-gray-500 dark:text-gray-400">No hay lotes activos.</span>
          ) : (
            lotesActivos.map((lote) => {
              const selected = loteSeleccionado?.id === lote.id
              return (
                <button
                  key={lote.id}
                  type="button"
                  onClick={() => handleClickLote(lote)}
                  className={`shrink-0 text-left px-4 py-2.5 rounded-xl border-2 w-[min(100%,280px)] sm:min-w-[200px] sm:w-auto transition-colors min-h-[44px] ${
                    selected
                      ? 'border-primary-500 bg-primary-500/20 dark:bg-primary-500/30 text-gray-900 dark:text-white'
                      : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:border-gray-300 dark:hover:border-gray-500'
                  }`}
                >
                  <div className="font-semibold text-base">{lote.codigo}</div>
                  <div className="text-xs mt-0.5 text-gray-600 dark:text-gray-400">
                    {lote.cliente_nombre} — {lote.especie_nombre}
                  </div>
                </button>
              )
            })
          )}
          </div>
        </div>
      </div>

      <div className="w-full">
        {!loteSeleccionado && (
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center text-gray-500 dark:text-gray-400">
            Seleccione un lote para ver el control de producción.
          </div>
        )}

        {loteSeleccionado && loadingControl && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-10 h-10 animate-spin text-primary-600" />
          </div>
        )}

        {loteSeleccionado && !loadingControl && controlData && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {controlData.codigo} — {controlData.cliente_nombre} — {controlData.especie_nombre}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                Plantilla: {controlData.plantilla_titulo || 'Sin plantilla predeterminada'}
              </p>
            </div>

            {(!controlData.productos || controlData.productos.length === 0) && (
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-6 text-center text-gray-500 dark:text-gray-400">
                No hay plantilla predeterminada para este lote o no tiene productos. Configure la plantilla en Plantillas de proceso.
              </div>
            )}

            {controlData.productos?.length > 0 && (
              <>
                <div className="rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden">
                  <div className="px-3 py-1.5 text-[11px] text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/40">
                    Vista tipo hoja de cálculo: use flechas para desplazarse por toda la fila y deslice horizontalmente para ver todas las columnas.
                  </div>
                  <div className="wms-table-scroll">
                    <table className="min-w-[92rem] w-full text-sm border-separate border-spacing-0 table-fixed">
                      <colgroup>
                        <col style={{ width: '100px' }} />
                        <col style={{ width: '320px', minWidth: '280px' }} />
                        <col style={{ width: '90px' }} />
                        <col style={{ width: '90px' }} />
                        <col style={{ width: '90px' }} />
                        <col style={{ width: '90px' }} />
                        <col style={{ width: '100px' }} />
                        <col style={{ width: '95px' }} />
                        <col style={{ width: '100px' }} />
                        <col style={{ width: '280px', minWidth: '280px' }} />
                        <col style={{ width: '440px', minWidth: '440px' }} />
                      </colgroup>
                      <thead>
                        <tr className="bg-gray-100 dark:bg-gray-700">
                          <th className="px-2 py-2 text-left font-medium text-gray-900 dark:text-gray-100 sticky left-0 z-20 bg-gray-100 dark:bg-gray-700">Producto</th>
                          <th className="px-2 py-2 text-left font-medium text-gray-900 dark:text-gray-100 sticky z-20 bg-gray-100 dark:bg-gray-700" style={{ left: '100px' }}>Código · Descripción</th>
                          <th className="px-2 py-2 text-center font-medium text-gray-900 dark:text-gray-100">
                            <div>Total envasado</div>
                            <div className="mt-1 flex justify-center">
                              {(() => {
                                const e = estadoTexto(controlData.envasado_estado)
                                return <span className={e.className}>{e.label}</span>
                              })()}
                            </div>
                          </th>
                          <th className="px-2 py-2 text-center font-medium text-gray-900 dark:text-gray-100">
                            <div>Total congelado</div>
                            <div className="mt-1 flex justify-center">
                              {(() => {
                                const e = estadoTexto(controlData.congelado_estado)
                                return <span className={e.className}>{e.label}</span>
                              })()}
                            </div>
                          </th>
                          <th className="px-2 py-2 text-center font-medium text-gray-900 dark:text-gray-100">
                            <div>Total empaque</div>
                            <div className="mt-1 flex justify-center">
                              {(() => {
                                const e = estadoTexto(controlData.empaque_estado)
                                return <span className={e.className}>{e.label}</span>
                              })()}
                            </div>
                          </th>
                          <th className="px-2 py-2 text-center font-medium text-gray-900 dark:text-gray-100">Estado</th>
                          <th className="px-2 py-2 text-center font-medium text-gray-900 dark:text-gray-100">Total bultos</th>
                          <th className="px-2 py-2 text-center font-medium text-gray-900 dark:text-gray-100" title="Enviado a cámara (parihuelas)">Env. cámara</th>
                          <th className="px-2 py-2 text-center font-medium text-gray-900 dark:text-gray-100" title="Todo lo enviado a cámara recepcionado en almacén">Validado por cámara</th>
                          <th className="px-2 py-2 text-left font-medium text-gray-900 dark:text-gray-100">Asignación OP</th>
                          <th className="px-2 py-2 text-left font-medium text-gray-900 dark:text-gray-100">Aplicación a OP</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          let rowCursor = -1
                          const maxRow = Math.max((controlData?.productos?.length || 1) - 1, 0)
                          const maxCol = 10
                          return productosAgrupados().map(({ nombreProducto, productos }) =>
                          productos.map((p, idx) => {
                            rowCursor += 1
                            const rowIndex = rowCursor
                            const linea = [p.codigo, p.descripcion, p.presentacion].filter(Boolean).join(' · ')
                            const isFirst = idx === 0
                            const opciones = opcionesOpByProducto[p.producto_id] || []
                            const lineasIds = (asignacionEdit[p.producto_id] || []).length ? asignacionEdit[p.producto_id] : [null]
                            return (
                              <tr key={p.producto_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 odd:bg-white even:bg-gray-50/40 dark:odd:bg-gray-800 dark:even:bg-gray-800/70">
                                {isFirst ? (
                                  <td rowSpan={productos.length} tabIndex={0} onKeyDown={(e) => handleGridArrowNav(e, 'control-grid', rowIndex, 0, maxRow, maxCol)} data-grid="control-grid" data-row={rowIndex} data-col={0} className="px-2 py-1.5 align-top sticky left-0 z-10 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 font-medium border-b border-r border-gray-200 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-primary-500" style={{ minWidth: '100px' }}>
                                    {nombreProducto}
                                  </td>
                                ) : null}
                                <td tabIndex={0} onKeyDown={(e) => handleGridArrowNav(e, 'control-grid', rowIndex, 1, maxRow, maxCol)} data-grid="control-grid" data-row={rowIndex} data-col={1} className="px-2 py-1.5 whitespace-normal break-words sticky z-10 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-xs border-b border-r border-gray-200 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-primary-500" style={{ left: '100px' }} title={linea}>
                                  {linea}
                                </td>
                                <td tabIndex={0} onKeyDown={(e) => handleGridArrowNav(e, 'control-grid', rowIndex, 2, maxRow, maxCol)} data-grid="control-grid" data-row={rowIndex} data-col={2} className="px-2 py-1.5 text-center text-gray-900 dark:text-gray-100 border-b border-r border-gray-200 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-primary-500">
                                  {p.total_envasado_kg != null ? `${p.total_envasado_kg.toFixed(1)} kg` : '—'}
                                </td>
                                <td tabIndex={0} onKeyDown={(e) => handleGridArrowNav(e, 'control-grid', rowIndex, 3, maxRow, maxCol)} data-grid="control-grid" data-row={rowIndex} data-col={3} className="px-2 py-1.5 text-center text-gray-900 dark:text-gray-100 border-b border-r border-gray-200 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-primary-500">
                                  {p.total_congelado_kg != null ? `${p.total_congelado_kg.toFixed(1)} kg` : '—'}
                                </td>
                                <td tabIndex={0} onKeyDown={(e) => handleGridArrowNav(e, 'control-grid', rowIndex, 4, maxRow, maxCol)} data-grid="control-grid" data-row={rowIndex} data-col={4} className="px-2 py-1.5 text-center text-gray-900 dark:text-gray-100 border-b border-r border-gray-200 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-primary-500">
                                  {p.total_empaque_kg != null ? `${p.total_empaque_kg.toFixed(1)} kg` : '—'}
                                </td>
                                <td tabIndex={0} onKeyDown={(e) => handleGridArrowNav(e, 'control-grid', rowIndex, 5, maxRow, maxCol)} data-grid="control-grid" data-row={rowIndex} data-col={5} className="px-2 py-1.5 text-center bg-white dark:bg-gray-800 border-b border-r border-gray-200 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-primary-500">
                                  {iconoCoincidencia(p)}
                                </td>
                                <td tabIndex={0} onKeyDown={(e) => handleGridArrowNav(e, 'control-grid', rowIndex, 6, maxRow, maxCol)} data-grid="control-grid" data-row={rowIndex} data-col={6} className="px-2 py-1.5 text-center bg-white dark:bg-gray-800 border-b border-r border-gray-200 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-primary-500">
                                  {p.total_empaque_bultos != null ? Number(p.total_empaque_bultos) || 0 : 0}
                                </td>
                                <td tabIndex={0} onKeyDown={(e) => handleGridArrowNav(e, 'control-grid', rowIndex, 7, maxRow, maxCol)} data-grid="control-grid" data-row={rowIndex} data-col={7} className="px-2 py-1.5 text-center text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 border-b border-r border-gray-200 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-primary-500" title={`Enviado a cámara (${(p.unidad_parihuela || 'BULTOS').toLowerCase()})`}>
                                  {(p.enviado_a_camara != null ? Number(p.enviado_a_camara) : 0) || '—'}
                                </td>
                                <td tabIndex={0} onKeyDown={(e) => handleGridArrowNav(e, 'control-grid', rowIndex, 8, maxRow, maxCol)} data-grid="control-grid" data-row={rowIndex} data-col={8} className="px-2 py-1.5 text-center bg-white dark:bg-gray-800 border-b border-r border-gray-200 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-primary-500" title={p.validado_camara === true ? 'Todo recepcionado en cámara' : p.validado_camara === false ? 'Pendiente de recepción en cámara' : 'Sin envío a cámara'}>
                                  {p.validado_camara === true && <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 mx-auto" />}
                                  {p.validado_camara === false && <XCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 mx-auto" />}
                                  {p.validado_camara == null && <span className="text-gray-400">—</span>}
                                </td>
                                <td tabIndex={0} onKeyDown={(e) => handleGridArrowNav(e, 'control-grid', rowIndex, 9, maxRow, maxCol)} data-grid="control-grid" data-row={rowIndex} data-col={9} className="px-2 py-1.5 bg-white dark:bg-gray-800 border-b border-r border-gray-200 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-primary-500">
                                  <div className="flex flex-wrap items-center gap-1">
                                    {lineasIds.map((lineaId, i) => (
                                      <div key={i} className="flex items-center gap-0.5 w-full sm:w-auto">
                                        <span className="text-[10px] text-gray-500 dark:text-gray-400">{i + 1}.</span>
                                        <select
                                          value={lineaId || ''}
                                          onChange={(e) => setAsignacionPrioridad(p.producto_id, i, e.target.value || null)}
                                          className="text-xs border border-gray-300 dark:border-gray-500 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 w-full sm:w-[170px] min-w-0"
                                        >
                                          <option value="">Sin OP</option>
                                          {opciones.map((op) => (
                                            <option key={op.linea_id} value={op.linea_id}>
                                              {op.numero_op} (falta {op.faltante_kg?.toFixed(0) ?? 0} kg)
                                            </option>
                                          ))}
                                        </select>
                                        <button
                                          type="button"
                                          onClick={() => quitarPrioridad(p.producto_id, i)}
                                          className="p-0.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                                          title="Quitar"
                                        >
                                          ×
                                        </button>
                                      </div>
                                    ))}
                                    <button
                                      type="button"
                                      onClick={() => agregarPrioridad(p.producto_id)}
                                      className="inline-flex items-center gap-0.5 text-xs text-primary-600 dark:text-primary-400 hover:underline whitespace-nowrap"
                                    >
                                      <Plus className="w-3.5 h-3.5" /> Agregar OP
                                    </button>
                                  </div>
                                </td>
                                <td tabIndex={0} onKeyDown={(e) => handleGridArrowNav(e, 'control-grid', rowIndex, 10, maxRow, maxCol)} data-grid="control-grid" data-row={rowIndex} data-col={10} className="px-2 py-1.5 bg-white dark:bg-gray-800 text-xs text-gray-700 dark:text-gray-200 border-b border-gray-200 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-primary-500">
                                  <span title={mensajeAplicacionOp(p)} className="block whitespace-nowrap overflow-hidden text-ellipsis max-w-[420px]">
                                    {mensajeAplicacionOp(p)}
                                  </span>
                                </td>
                              </tr>
                            )
                          })
                        )})()
                        }
                      </tbody>
                      <tfoot>
                        <tr className="bg-gray-50 dark:bg-gray-900/40">
                          <td className="px-2 py-2 text-right font-semibold text-gray-900 dark:text-gray-100" colSpan={2}>
                            Totales
                          </td>
                          <td className="px-2 py-2 text-center font-semibold text-gray-900 dark:text-gray-100">
                            {totalesGenerales().envasado.toFixed(1)} kg
                          </td>
                          <td className="px-2 py-2 text-center font-semibold text-gray-900 dark:text-gray-100">
                            {totalesGenerales().congelado.toFixed(1)} kg
                          </td>
                          <td className="px-2 py-2 text-center font-semibold text-gray-900 dark:text-gray-100">
                            {totalesGenerales().empaqueKg.toFixed(1)} kg
                          </td>
                          <td className="px-2 py-2 text-center font-semibold text-gray-900 dark:text-gray-100">
                            {totalesGenerales().bultos}
                          </td>
                          <td className="px-2 py-2 text-center font-semibold text-gray-900 dark:text-gray-100">
                            {totalesGenerales().enviadoCamara}
                          </td>
                          <td className="px-2 py-2" />
                          <td className="px-2 py-2" />
                          <td className="px-2 py-2" />
                          <td className="px-2 py-2" />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                <div className="flex flex-col-reverse sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-end gap-2 pt-4 border-t border-gray-200 dark:border-gray-600">
                  <button
                    type="button"
                    onClick={() => {
                      if (!loteSeleccionado?.id) return
                      if (dirty) {
                        toast.error('Guarde la asignación antes de aplicar a OP.')
                        return
                      }
                      if (controlData?.op_aplicado_at) return
                      if (controlData?.empaque_estado !== 'finalizado') {
                        toast.error('El empaque debe estar finalizado.')
                        return
                      }
                      if (!todoValidado()) {
                        toast.error('No se puede aplicar: los totales no coinciden.')
                        return
                      }
                      if (!todoValidadoCamara()) {
                        toast.error('Hay productos con parihuelas pendientes de recepción en cámara. Recepcione todo en Recepción de parihuelas.')
                        return
                      }
                      setApplying(true)
                      controlProduccionApi.aplicarOp(loteSeleccionado.id)
                        .then(() => {
                          toast.success('Aplicado a OP. Cantidades actualizadas.')
                          loadControl(loteSeleccionado.id)
                        })
                        .catch((err) => toast.error(err.response?.data?.message || 'Error al aplicar a OP'))
                        .finally(() => setApplying(false))
                    }}
                    disabled={applying || saving || !!controlData?.op_aplicado_at || !todoValidadoCamara()}
                    className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto min-h-[44px] px-4 py-2.5 sm:py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                    title={
                      controlData?.op_aplicado_at
                        ? 'Ya aplicado a OP'
                        : !todoValidadoCamara()
                          ? 'Recepcione todas las parihuelas en Recepción de parihuelas antes de aplicar a OP'
                          : 'Valida y carga el empaque a OP según prioridades'
                    }
                  >
                    {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    {controlData?.op_aplicado_at ? 'Ya aplicado a OP' : 'Validar y aplicar a OP'}
                  </button>
                  <button
                    type="button"
                    onClick={handleGuardarAsignacion}
                    disabled={!dirty || saving}
                    className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto min-h-[44px] px-4 py-2.5 sm:py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Guardar asignación
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default ControlProduccion
