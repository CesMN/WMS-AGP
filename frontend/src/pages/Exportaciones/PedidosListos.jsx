import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Ship, Loader2, Package, Truck, Eye } from 'lucide-react'
import Modal from '../../components/Modal'
import PaginationBar from '../../components/PaginationBar'
import { ordenesExportacionApi } from '../../api/ordenes-exportacion'
import { despachosApi } from '../../api/despachos'
import { useConfig } from '../../contexts/ConfigContext'
import toast from 'react-hot-toast'

const rowKey = (r) => `${r.orden_id}|${r.referencia}`

const parseProductos = (raw) => {
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const j = JSON.parse(raw)
      return Array.isArray(j) ? j : []
    } catch {
      return []
    }
  }
  return []
}

const productoLabel = (p) => [p?.producto_codigo, p?.producto_descripcion].filter(Boolean).join(' - ') || '—'
const toNum = (v) => Number(v || 0)

const PedidosListos = () => {
  const navigate = useNavigate()
  const { registrosPorPagina } = useConfig()
  const [grupos, setGrupos] = useState([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [detalleOpen, setDetalleOpen] = useState(false)
  const [detalleLoading, setDetalleLoading] = useState(false)
  const [detalleData, setDetalleData] = useState(null)
  const [detalleTarget, setDetalleTarget] = useState(null)
  const [savingFechaKey, setSavingFechaKey] = useState(null)
  const [creandoDespachoKey, setCreandoDespachoKey] = useState(null)
  const [syncPendienteKey, setSyncPendienteKey] = useState({})
  const [syncDespachoKey, setSyncDespachoKey] = useState(null)
  /** Valor al enfocar el input (para guardar solo si cambió). */
  const [fechaAlFoco, setFechaAlFoco] = useState({})

  const loadGrupos = useCallback(() => {
    const limit = registrosPorPagina || 50
    const off = Number(offset)
    setLoading(true)
    return ordenesExportacionApi
      .listosDespachoGrupos({ limit, offset: off })
      .then((res) => {
        setGrupos(res.data?.data ?? res.data ?? [])
        setTotal(res.data?.total ?? 0)
      })
      .catch(() => {
        toast.error('Error al cargar listos para despacho')
        setGrupos([])
        setTotal(0)
      })
      .finally(() => setLoading(false))
  }, [offset, registrosPorPagina])

  useEffect(() => {
    loadGrupos()
  }, [loadGrupos])

  const formatDate = (d) => {
    if (!d) return ''
    const s = typeof d === 'string' ? d.slice(0, 10) : ''
    return s || ''
  }

  const fechaProbableValue = (row) => formatDate(row.fecha_probable_embarque)

  const guardarFechaProbable = async (row, valorDateInput) => {
    const k = rowKey(row)
    const v = valorDateInput || ''
    setSavingFechaKey(k)
    try {
      await ordenesExportacionApi.actualizarFechaProbableEmbarque(row.orden_id, {
        fecha_probable_embarque: v || null,
      })
      setGrupos((prev) =>
        prev.map((g) =>
          rowKey(g) === k ? { ...g, fecha_probable_embarque: v || null } : g
        )
      )
      if (v) toast.success('Fecha probable de embarque guardada')
      else toast.success('Fecha eliminada')
      setSyncPendienteKey((prev) => ({ ...prev, [k]: 'pending' }))
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al guardar la fecha')
    } finally {
      setSavingFechaKey(null)
    }
  }

  const sincronizarFechaDespacho = async (row) => {
    const k = rowKey(row)
    const fecha = fechaProbableValue(row)
    if (!fecha) {
      toast.error('Defina una fecha probable de embarque antes de sincronizar')
      return
    }
    try {
      setSyncDespachoKey(k)
      const { data } = await despachosApi.sincronizarFechaPorReferencia({
        orden_produccion: row.numero_op || '',
        referencia: row.referencia || '',
        fecha_salida: fecha,
      })
      const actualizados = Number(data?.actualizados || 0)
      if (actualizados > 0) {
        toast.success(data?.message || 'Fecha sincronizada en despacho')
      } else {
        toast(data?.message || 'No se encontraron despachos registrados para sincronizar')
      }
      setSyncPendienteKey((prev) => ({ ...prev, [k]: 'synced' }))
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al sincronizar fecha en despacho')
    } finally {
      setSyncDespachoKey(null)
    }
  }

  const abrirDetalle = async (row) => {
    setDetalleTarget(row)
    setDetalleOpen(true)
    setDetalleLoading(true)
    setDetalleData(null)
    try {
      const { data } = await ordenesExportacionApi.listosDespachoGrupoDetalle({
        orden_id: row.orden_id,
        referencia: row.referencia,
      })
      setDetalleData(data)
    } catch {
      toast.error('Error al cargar el detalle')
      setDetalleOpen(false)
    } finally {
      setDetalleLoading(false)
    }
  }

  const cerrarDetalle = () => {
    setDetalleOpen(false)
    setDetalleData(null)
    setDetalleTarget(null)
  }

  const puedeCrearDespacho = (row) => !!fechaProbableValue(row)

  const crearDespachoDirecto = async (row) => {
    if (!puedeCrearDespacho(row)) {
      toast.error('Indique la fecha probable de embarque antes de crear el despacho')
      return
    }
    const k = rowKey(row)
    try {
      setCreandoDespachoKey(k)
      const payload = {
        tipo_salida: 'Embarque',
        cliente_origen_id: row.cliente_origen_id || null,
        fecha_salida: fechaProbableValue(row),
        orden_produccion: row.numero_op || '',
        cliente_destino: row.cliente_exportacion_nombre || '',
        pais_destino: row.destino || '',
        destino: row.destino || '',
        contenedor: '',
        guia_salida: '',
        observaciones: `Generado desde Listos para despacho. Referencia: ${row.referencia || '-'}.`,
        lineas: [],
      }
      const { data } = await despachosApi.crear(payload)
      toast.success('Despacho creado correctamente')
      navigate('/despachos', { state: { openDespachoId: data?.id } })
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al crear despacho')
    } finally {
      setCreandoDespachoKey(null)
    }
  }

  const totalDetalleBultos = (detalleData?.productos_totales || []).reduce((acc, p) => acc + toNum(p.total_bultos), 0)
  const totalDetalleKg = (detalleData?.productos_totales || []).reduce((acc, p) => acc + toNum(p.total_kg), 0)

  if (loading && grupos.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-10 h-10 animate-spin text-primary-600" />
      </div>
    )
  }

  return (
    <div className="min-w-0 max-w-full">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5 sm:mb-6">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2 rounded-lg bg-primary-100 dark:bg-primary-900/40 shrink-0">
            <Ship className="w-6 h-6 text-primary-600 dark:text-primary-400" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white leading-tight">Listos para despacho</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Una fila por <strong>referencia</strong> (contenedores agrupados). La{' '}
              <strong>fecha probable de embarque</strong> es obligatoria para <strong>Crear despacho</strong>.
            </p>
          </div>
        </div>
      </div>

      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <Package className="w-5 h-5 text-teal-600 dark:text-teal-400 shrink-0" />
          <h2 className="text-base sm:text-lg font-medium text-gray-900 dark:text-white">Por referencia</h2>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
          <div className="wms-table-scroll">
            <table className="min-w-[72rem] w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-teal-50/80 dark:bg-teal-950/20">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                    Referencia
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                    OP
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                    Fecha probable de embarque
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                    Cliente exp.
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                    Cliente prod.
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                    Destino
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                    Producto
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                    Total a despachar
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {grupos.map((row) => {
                  const k = rowKey(row)
                  const productos = parseProductos(row.productos)
                  return (
                    <tr key={k} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-sm font-mono font-medium text-teal-800 dark:text-teal-200">
                        {row.referencia || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                        {row.numero_op || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm align-top">
                        <div className="flex flex-col gap-1 min-w-[10rem]">
                          <input
                            type="date"
                            className="text-sm w-full min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-2 dark:bg-gray-900 dark:text-white"
                            value={fechaProbableValue(row)}
                            disabled={savingFechaKey === k}
                            onFocus={() => {
                              setFechaAlFoco((prev) => ({ ...prev, [k]: fechaProbableValue(row) }))
                            }}
                            onChange={(e) => {
                              const v = e.target.value
                              setGrupos((prev) =>
                                prev.map((g) => (rowKey(g) === k ? { ...g, fecha_probable_embarque: v || null } : g))
                              )
                            }}
                            onBlur={(e) => {
                              const v = e.target.value
                              const antes = fechaAlFoco[k] ?? ''
                              if (v === antes) return
                              guardarFechaProbable(row, v)
                            }}
                          />
                          {savingFechaKey === k && (
                            <span className="text-[10px] text-gray-500">Guardando…</span>
                          )}
                          {syncPendienteKey[k] === 'pending' && (
                            <button
                              type="button"
                              onClick={() => sincronizarFechaDespacho(row)}
                              disabled={syncDespachoKey === k || savingFechaKey === k}
                              className="inline-flex items-center justify-center gap-1 min-h-[40px] sm:min-h-0 px-2 py-2 sm:py-1 text-[11px] font-medium rounded-lg text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-60 w-full sm:w-auto"
                              title="Actualizar esta fecha en el despacho registrado"
                            >
                              {syncDespachoKey === k ? 'Actualizando...' : 'Actualizar despacho'}
                            </button>
                          )}
                          {syncPendienteKey[k] === 'synced' && (
                            <span className="inline-flex items-center justify-center px-2 py-1 text-[11px] font-medium rounded-md text-emerald-700 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                              Sincronizado
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        {row.cliente_exportacion_nombre || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        {row.cliente_produccion_nombre || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{row.destino || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white align-top">
                        <ul className="space-y-0.5">
                          {productos.length === 0 ? (
                            <li className="text-gray-400">—</li>
                          ) : (
                            productos.map((p) => (
                              <li key={p.producto_codigo} className="font-mono text-xs">
                                {productoLabel(p)}
                              </li>
                            ))
                          )}
                        </ul>
                      </td>
                      <td className="px-4 py-3 text-sm text-right align-top text-gray-800 dark:text-gray-200">
                        <ul className="space-y-0.5">
                          {productos.length === 0 ? (
                            <li className="text-gray-400">—</li>
                          ) : (
                            productos.map((p) => (
                              <li key={p.producto_codigo} className="tabular-nums text-xs">
                                {Number(p.total_bultos || 0).toFixed(2)} bultos
                              </li>
                            ))
                          )}
                        </ul>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => abrirDetalle(row)}
                            className="inline-flex items-center justify-center gap-1 min-h-[40px] sm:min-h-0 px-2.5 py-2 sm:py-1 text-xs font-medium rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-white"
                          >
                            <Eye className="w-3.5 h-3.5 shrink-0" />
                            Ver detalles
                          </button>
                          <button
                            type="button"
                            onClick={() => crearDespachoDirecto(row)}
                            disabled={creandoDespachoKey === k || !puedeCrearDespacho(row)}
                            className={`inline-flex items-center justify-center gap-1 min-h-[40px] sm:min-h-0 px-2.5 py-2 sm:py-1 text-xs font-medium rounded-lg text-white disabled:opacity-70 ${
                              puedeCrearDespacho(row)
                                ? 'bg-primary-600 hover:bg-primary-700'
                                : 'bg-gray-400 cursor-not-allowed'
                            }`}
                            title={
                              puedeCrearDespacho(row)
                                ? 'Crear despacho automático desde esta referencia'
                                : 'Requiere fecha probable de embarque'
                            }
                          >
                            <Truck className="w-3.5 h-3.5 shrink-0" />
                            {creandoDespachoKey === k ? 'Creando...' : 'Crear despacho'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
        {grupos.length === 0 && !loading && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 py-4 text-center border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
            Ningún grupo listo para despacho. Arme y guarde la distribución en Órdenes de producción.
          </p>
        )}
      </div>

      {total > 0 && (
        <div className="mt-4">
          <PaginationBar
            total={total}
            limit={registrosPorPagina || 50}
            offset={offset}
            onPageChange={setOffset}
          />
        </div>
      )}

      <Modal isOpen={detalleOpen} onClose={cerrarDetalle} title="Detalle — listo para despacho" size="xl">
        {detalleLoading && (
          <div className="flex flex-col items-center justify-center gap-2 py-14 text-gray-500 dark:text-gray-400">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
            <span className="text-sm">Cargando…</span>
          </div>
        )}
        {!detalleLoading && detalleData && (
          <div className="space-y-4 text-sm text-gray-800 dark:text-gray-200 max-h-[min(75dvh,720px)] overflow-y-auto overflow-x-hidden pr-1 -mr-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs border-b border-gray-200 dark:border-gray-600 pb-3">
              <div>
                <span className="text-gray-500 dark:text-gray-400">Referencia</span>
                <p className="font-mono font-semibold text-teal-800 dark:text-teal-200">{detalleData.referencia}</p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">N° OP</span>
                <p className="font-medium">{detalleData.orden?.numero_op || '—'}</p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Fecha probable de embarque</span>
                <p>{formatDate(detalleData.orden?.fecha_probable_embarque) || '—'}</p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Destino</span>
                <p>{detalleData.orden?.destino || '—'}</p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Cliente exportación</span>
                <p>{detalleData.orden?.cliente_exportacion_nombre || '—'}</p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Cliente producción</span>
                <p>{detalleData.orden?.cliente_produccion_nombre || '—'}</p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Especie</span>
                <p>{detalleData.orden?.especie_nombre || '—'}</p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Estado OP</span>
                <p>{detalleData.orden?.estado || '—'}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50/70 dark:bg-teal-900/20 px-3 py-2">
                <span className="text-gray-500 dark:text-gray-400">Total bultos</span>
                <p className="text-base font-semibold tabular-nums">{totalDetalleBultos.toFixed(2)}</p>
              </div>
              <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-900/20 px-3 py-2">
                <span className="text-gray-500 dark:text-gray-400">Total kg</span>
                <p className="text-base font-semibold tabular-nums">{totalDetalleKg.toFixed(2)} kg</p>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Totales por producto (referencia)</p>
              <div className="wms-table-scroll rounded-lg border border-gray-200 dark:border-gray-600">
                <table className="min-w-[28rem] w-full text-xs">
                  <thead className="bg-gray-100 dark:bg-gray-700">
                    <tr>
                      <th className="text-left px-3 py-2">Producto</th>
                      <th className="text-right px-3 py-2">Total bultos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detalleData.productos_totales || []).map((p) => (
                      <tr key={p.producto_codigo} className="border-t border-gray-100 dark:border-gray-600">
                        <td className="px-3 py-1.5 font-mono">{productoLabel(p)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {Number(p.total_bultos || 0).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Contenedores y distribución</p>
              <div className="space-y-3">
                {(detalleData.contenedores || []).map((c) => (
                  <div
                    key={c.id}
                    className="rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden"
                  >
                    <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/80 text-xs font-medium">
                      Contenedor {c.letra} (índ. {c.indice}) — {c.codigo_exportacion || c.codigo_interno || c.id}
                    </div>
                    <div className="wms-table-scroll">
                    <table className="min-w-[32rem] w-full text-xs">
                      <thead>
                        <tr className="text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-600">
                          <th className="text-left px-3 py-1">Producto</th>
                          <th className="text-right px-3 py-1">Bultos</th>
                          <th className="text-right px-3 py-1">Desde stock</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(c.lineas || []).length === 0 ? (
                          <tr>
                            <td colSpan={3} className="px-3 py-2 text-gray-400">
                              Sin líneas
                            </td>
                          </tr>
                        ) : (
                          (c.lineas || []).map((ln, idx) => (
                            <tr key={`${c.id}-${idx}`} className="border-t border-gray-50 dark:border-gray-700">
                              <td className="px-3 py-1 font-mono">{productoLabel(ln)}</td>
                              <td className="px-3 py-1 text-right tabular-nums">
                                {Number(ln.cantidad_bultos || 0).toFixed(2)}
                              </td>
                              <td className="px-3 py-1 text-right tabular-nums">
                                {Number(ln.cantidad_bultos_stock || 0).toFixed(2)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {detalleTarget && (
              <div className="pt-2 border-t border-gray-200 dark:border-gray-600 flex flex-wrap gap-2">
                <Link
                  to={`/exportaciones/ordenes-produccion?expand=${encodeURIComponent(detalleTarget.orden_id)}`}
                  className="inline-flex min-h-[40px] sm:min-h-0 items-center text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline py-2 sm:py-0"
                >
                  Abrir orden en Órdenes de producción
                </Link>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

export default PedidosListos
