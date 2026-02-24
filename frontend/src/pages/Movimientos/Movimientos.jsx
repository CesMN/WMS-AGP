import { useState, useEffect } from 'react'
import { Move, Loader2, Info } from 'lucide-react'
import Modal from '../../components/Modal'
import PaginationBar from '../../components/PaginationBar'
import ExportDropdown from '../../components/ExportDropdown'
import { movimientosApi } from '../../api/movimientos'
import { usuariosApi } from '../../api/usuarios'
import { useConfig } from '../../contexts/ConfigContext'
import toast from 'react-hot-toast'

const TIPOS = [
  { value: '', label: 'Todos' },
  { value: 'Ingreso', label: 'Ingreso' },
  { value: 'Salida', label: 'Salida' },
  { value: 'Movimiento', label: 'Movimiento' },
]

const Movimientos = () => {
  const { registrosPorPagina } = useConfig()
  const [loading, setLoading] = useState(true)
  const [usuarios, setUsuarios] = useState([])
  const [lista, setLista] = useState([])
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroFechaDesde, setFiltroFechaDesde] = useState('')
  const [filtroFechaHasta, setFiltroFechaHasta] = useState('')
  const [filtroUsuario, setFiltroUsuario] = useState('')
  const [detalleId, setDetalleId] = useState(null)
  const [detalle, setDetalle] = useState(null)
  const [loadingDetalle, setLoadingDetalle] = useState(false)

  const [totalRegistros, setTotalRegistros] = useState(0)
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    usuariosApi.listar({ limit: 500 }).then((r) => setUsuarios(r.data?.data ?? r.data ?? [])).catch(() => toast.error('Error al cargar usuarios'))
  }, [])

  useEffect(() => {
    setOffset(0)
  }, [filtroTipo, filtroFechaDesde, filtroFechaHasta, filtroUsuario])

  useEffect(() => {
    let cancelled = false
    const limit = registrosPorPagina || 50
    const params = { limit, offset: Number(offset) }
    if (filtroTipo) params.tipo_movimiento = filtroTipo
    if (filtroFechaDesde) params.fecha_desde = filtroFechaDesde
    if (filtroFechaHasta) params.fecha_hasta = filtroFechaHasta
    if (filtroUsuario) params.usuario_id = filtroUsuario
    setLoading(true)
    movimientosApi
      .listar(params)
      .then(({ data }) => {
        if (cancelled) return
        setLista(data?.data ?? data ?? [])
        setTotalRegistros(data?.total ?? (data?.data ?? data)?.length ?? 0)
      })
      .catch(() => {
        if (!cancelled) {
          toast.error('Error al cargar movimientos')
          setLista([])
          setTotalRegistros(0)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [filtroTipo, filtroFechaDesde, filtroFechaHasta, filtroUsuario, registrosPorPagina, offset])

  useEffect(() => {
    if (detalleId) {
      setLoadingDetalle(true)
      movimientosApi
        .obtener(detalleId)
        .then((r) => setDetalle(r.data))
        .catch(() => {
          toast.error('Error al cargar el detalle')
          setDetalleId(null)
        })
        .finally(() => setLoadingDetalle(false))
    } else {
      setDetalle(null)
    }
  }, [detalleId])

  const formatFecha = (fechaHora) => {
    if (!fechaHora) return '-'
    const d = new Date(fechaHora)
    return d.toLocaleString('es-ES', {
      dateStyle: 'short',
      timeStyle: 'short',
    })
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <Move className="w-8 h-8 text-primary-600" />
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Historial</p>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Movimientos</h1>
          </div>
        </div>
        <ExportDropdown
          getExportConfig={() => {
            const listParams = { limit: 10000, offset: 0, tipo_movimiento: filtroTipo || undefined, fecha_desde: filtroFechaDesde || undefined, fecha_hasta: filtroFechaHasta || undefined, usuario_id: filtroUsuario || undefined }
            return {
              title: 'Movimientos',
              filtersSummary: [filtroTipo && 'Tipo', filtroFechaDesde && 'Desde', filtroFechaHasta && 'Hasta', filtroUsuario && 'Usuario'].filter(Boolean).join(', ') || 'Ninguno',
              columns: [
                { key: 'tipo_movimiento', label: 'Tipo' },
                { key: 'fecha_hora', label: 'Fecha' },
                { key: 'motivo', label: 'Motivo' },
                { key: 'usuario_nombre', label: 'Usuario' },
                { key: 'cantidad_detalles', label: 'Detalles' },
              ],
              fetchData: () => movimientosApi.listar(listParams).then((r) => ({ data: r.data?.data ?? r.data ?? [] })),
              detailTitle: 'Detalle de movimientos',
              detailColumns: [
                { key: 'tipo_movimiento', label: 'Tipo' },
                { key: 'fecha_hora', label: 'Fecha' },
                { key: 'usuario_nombre', label: 'Usuario' },
                { key: 'motivo', label: 'Motivo' },
                { key: 'producto_codigo', label: 'Código producto' },
                { key: 'producto_descripcion', label: 'Producto' },
                { key: 'lote', label: 'Lote' },
                { key: 'cantidad_bultos', label: 'Bultos' },
                { key: 'total_kg', label: 'Total KG' },
              ],
              fetchDataWithDetail: async () => {
                const { data } = await movimientosApi.listar({ ...listParams, limit: 80 })
                const list = data?.data ?? data ?? []
                const full = await Promise.all(list.map((m) => movimientosApi.obtener(m.id).then((r) => r.data)))
                const detailRows = full.flatMap((m) => (m.detalles || []).map((d) => ({
                  tipo_movimiento: m.tipo_movimiento,
                  fecha_hora: m.fecha_hora,
                  usuario_nombre: m.usuario_nombre,
                  motivo: m.motivo,
                  producto_codigo: d.producto_codigo,
                  producto_descripcion: d.producto_descripcion,
                  lote: d.lote ?? '',
                  cantidad_bultos: d.cantidad_bultos,
                  total_kg: d.total_kg,
                })))
                return { data: list, detailRows }
              },
            }
          }}
        />
      </div>

      <div className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Filtros</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Tipo</label>
            <select
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white text-sm"
            >
              {TIPOS.map((t) => (
                <option key={t.value || 'all'} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Fecha desde</label>
            <input
              type="date"
              value={filtroFechaDesde}
              onChange={(e) => setFiltroFechaDesde(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Fecha hasta</label>
            <input
              type="date"
              value={filtroFechaHasta}
              onChange={(e) => setFiltroFechaHasta(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Usuario</label>
            <select
              value={filtroUsuario}
              onChange={(e) => setFiltroUsuario(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white text-sm"
            >
              <option value="">Todos</option>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>{u.nombre}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fecha y hora</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tipo</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Guía / Cliente</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Usuario</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Motivo</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Líneas</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-24">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto" />
                  </td>
                </tr>
              ) : lista.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    No hay movimientos que coincidan con los filtros.
                  </td>
                </tr>
              ) : (
                lista.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-4 py-1 text-sm text-gray-900 dark:text-white whitespace-nowrap">
                      {formatFecha(m.fecha_hora)}
                    </td>
                    <td className="px-4 py-1">
                      <span
                        className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                          m.tipo_movimiento === 'Ingreso'
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                            : m.tipo_movimiento === 'Salida'
                            ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
                            : 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300'
                        }`}
                      >
                        {m.tipo_movimiento}
                      </span>
                    </td>
                    <td className="px-4 py-1 text-sm text-gray-700 dark:text-gray-300 max-w-[200px]">
                      {m.tipo_movimiento === 'Ingreso' && (
                        (m.numero_guia != null && m.numero_guia !== '') ? m.numero_guia : '-'
                      )}
                      {m.tipo_movimiento === 'Salida' && (
                        <span className="block truncate" title={[m.cliente_origen_nombre, m.cliente_destino].filter(Boolean).join(' → ')}>
                          {m.cliente_origen_nombre ? `${m.cliente_origen_nombre} → ` : ''}{m.cliente_destino || '-'}
                        </span>
                      )}
                      {m.tipo_movimiento !== 'Ingreso' && m.tipo_movimiento !== 'Salida' && '-'}
                    </td>
                    <td className="px-4 py-1 text-sm text-gray-700 dark:text-gray-300">
                      {m.usuario_nombre}
                    </td>
                    <td className="px-4 py-1 text-sm text-gray-700 dark:text-gray-300 max-w-[280px]">
                      <div className="line-clamp-2 break-words" title={m.motivo || ''}>
                        {m.motivo || '-'}
                      </div>
                    </td>
                    <td className="px-4 py-1 text-center text-sm font-medium text-gray-900 dark:text-white">
                      {m.cantidad_detalles ?? 0}
                    </td>
                    <td className="px-4 py-1 text-center">
                      <button
                        type="button"
                        onClick={() => setDetalleId(m.id)}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-primary-100 dark:hover:bg-primary-900/30 hover:text-primary-700 dark:hover:text-primary-300 transition-colors whitespace-nowrap"
                        >
                        <Info className="w-4 h-4 flex-shrink-0" />
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && lista.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
            <PaginationBar total={totalRegistros} limit={registrosPorPagina || 50} offset={offset} onPageChange={setOffset} />
          </div>
        )}
      </div>

      <Modal
        isOpen={!!detalleId}
        onClose={() => setDetalleId(null)}
        title="Detalle del movimiento"
        size="lg"
      >
        {loadingDetalle ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-10 h-10 text-primary-600 animate-spin" />
          </div>
        ) : detalle ? (
          <div className="space-y-5 overflow-y-auto max-h-[70vh]">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500 dark:text-gray-400 block text-xs font-medium">Fecha y hora</span>
                <span className="text-gray-900 dark:text-white">{formatFecha(detalle.fecha_hora)}</span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400 block text-xs font-medium">Tipo</span>
                <span
                  className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                    detalle.tipo_movimiento === 'Ingreso'
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                      : detalle.tipo_movimiento === 'Salida'
                      ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
                      : 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300'
                  }`}
                >
                  {detalle.tipo_movimiento}
                </span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400 block text-xs font-medium">Usuario</span>
                <span className="text-gray-900 dark:text-white">{detalle.usuario_nombre}</span>
              </div>
              {detalle.tipo_movimiento === 'Ingreso' && (detalle.numero_guia != null && detalle.numero_guia !== '') && (
                <div>
                  <span className="text-gray-500 dark:text-gray-400 block text-xs font-medium">Nº guía ingreso</span>
                  <span className="text-gray-900 dark:text-white">{detalle.numero_guia}</span>
                </div>
              )}
              {detalle.tipo_movimiento === 'Ingreso' && (detalle.cliente_ingreso || detalle.especie_ingreso) && (
                <>
                  {detalle.cliente_ingreso && (
                    <div>
                      <span className="text-gray-500 dark:text-gray-400 block text-xs font-medium">Cliente</span>
                      <span className="text-gray-900 dark:text-white">{detalle.cliente_ingreso}</span>
                    </div>
                  )}
                  {detalle.especie_ingreso && (
                    <div>
                      <span className="text-gray-500 dark:text-gray-400 block text-xs font-medium">Especie</span>
                      <span className="text-gray-900 dark:text-white">{detalle.especie_ingreso}</span>
                    </div>
                  )}
                </>
              )}
              {detalle.tipo_movimiento === 'Salida' && (detalle.cliente_origen_nombre || detalle.cliente_destino) && (
                <>
                  {detalle.cliente_origen_nombre && (
                    <div>
                      <span className="text-gray-500 dark:text-gray-400 block text-xs font-medium">Cliente origen</span>
                      <span className="text-gray-900 dark:text-white">{detalle.cliente_origen_nombre}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-gray-500 dark:text-gray-400 block text-xs font-medium">Cliente destino</span>
                    <span className="text-gray-900 dark:text-white">{detalle.cliente_destino || '-'}</span>
                  </div>
                </>
              )}
              <div className="col-span-2">
                <span className="text-gray-500 dark:text-gray-400 block text-xs font-medium">Motivo</span>
                <p className="text-gray-900 dark:text-white mt-0.5 whitespace-pre-wrap break-words">{detalle.motivo || '-'}</p>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Líneas del movimiento</h3>
              <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-600">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900/50">
                    <tr>
                      {detalle.detalles?.some((d) => d.tipo_linea) && (
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Estado</th>
                      )}
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Producto</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Lote</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Bultos</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Peso adj. (kg)</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Total (kg)</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Ubicación</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {detalle.detalles?.length > 0 ? (
                      detalle.detalles.map((d) => (
                        <tr key={d.id} className={`bg-white dark:bg-gray-800 ${d.tipo_linea === 'Antes' ? 'bg-gray-50 dark:bg-gray-800/70' : ''}`}>
                          {detalle.detalles?.some((x) => x.tipo_linea) && (
                            <td className="px-3 py-2">
                              {d.tipo_linea ? (
                                <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${d.tipo_linea === 'Antes' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300' : 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'}`}>
                                  {d.tipo_linea === 'Antes' ? 'Antes' : 'Después'}
                                </span>
                              ) : (
                                '-'
                              )}
                            </td>
                          )}
                          <td className="px-3 py-2">
                            <span className="font-medium text-gray-900 dark:text-white">{d.producto_codigo}</span>
                            {d.producto_descripcion && (
                              <span className="text-gray-500 dark:text-gray-400 block text-xs">{d.producto_descripcion}</span>
                            )}
                            {d.producto_presentacion && (
                              <span className="text-gray-500 dark:text-gray-400 block text-xs">{d.producto_presentacion}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{d.lote ?? '-'}</td>
                          <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-white">{d.cantidad_bultos}</td>
                          <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-400">{Number(d.peso_adicional || 0).toFixed(2)}</td>
                          <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-white">{Number(d.total_kg).toFixed(2)}</td>
                          <td className="px-3 py-2 text-gray-600 dark:text-gray-400 text-xs">
                            {d.almacen_nombre && d.carril_nombre != null
                              ? `${d.almacen_nombre} → ${d.carril_nombre} → N${d.numero_nivel ?? '-'} → P${d.numero_posicion ?? '-'}`
                              : '-'}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={detalle.detalles?.some((d) => d.tipo_linea) ? 8 : 7} className="px-3 py-4 text-center text-gray-500 dark:text-gray-400">
                          Sin líneas.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}

export default Movimientos
