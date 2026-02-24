import { useState, useEffect } from 'react'
import { ArrowUpFromLine, Loader2, Info, Search, X } from 'lucide-react'
import Modal from '../../components/Modal'
import PaginationBar from '../../components/PaginationBar'
import ExportDropdown from '../../components/ExportDropdown'
import { movimientosApi } from '../../api/movimientos'
import { despachosApi } from '../../api/despachos'
import { clientesApi } from '../../api/clientes'
import { especiesApi } from '../../api/especies'
import { useConfig } from '../../contexts/ConfigContext'
import toast from 'react-hot-toast'

const Salidas = () => {
  const { registrosPorPagina } = useConfig()
  const [loading, setLoading] = useState(true)
  const [lista, setLista] = useState([])
  const [totalRegistros, setTotalRegistros] = useState(0)
  const [offset, setOffset] = useState(0)
  const [detalleDespachoId, setDetalleDespachoId] = useState(null)
  const [loadingDetalle, setLoadingDetalle] = useState(false)
  const [detalle, setDetalle] = useState(null)
  const [clientes, setClientes] = useState([])
  const [especies, setEspecies] = useState([])
  const [filtroNumeroGuia, setFiltroNumeroGuia] = useState('')
  const [filtroFechaDesde, setFiltroFechaDesde] = useState('')
  const [filtroFechaHasta, setFiltroFechaHasta] = useState('')
  const [filtroClienteId, setFiltroClienteId] = useState('')
  const [filtroEspecieId, setFiltroEspecieId] = useState('')

  const limit = registrosPorPagina || 20

  useEffect(() => {
    clientesApi.listar({ limit: 500 }).then((r) => setClientes(r.data?.data ?? r.data ?? [])).catch(() => toast.error('Error al cargar clientes'))
    especiesApi.listar({ limit: 500 }).then((r) => setEspecies(r.data?.data ?? r.data ?? [])).catch(() => toast.error('Error al cargar especies'))
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const params = { limit, offset }
    if (filtroNumeroGuia.trim()) params.numero_guia = filtroNumeroGuia.trim()
    if (filtroFechaDesde) params.fecha_desde = filtroFechaDesde
    if (filtroFechaHasta) params.fecha_hasta = filtroFechaHasta
    if (filtroClienteId) params.cliente_id = filtroClienteId
    if (filtroEspecieId) params.especie_id = filtroEspecieId
    movimientosApi
      .salidasAgrupadas(params)
      .then(({ data }) => {
        if (cancelled) return
        setLista(data?.data ?? [])
        setTotalRegistros(data?.total ?? 0)
      })
      .catch(() => {
        if (!cancelled) toast.error('Error al cargar salidas')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [limit, offset, filtroNumeroGuia, filtroFechaDesde, filtroFechaHasta, filtroClienteId, filtroEspecieId])

  const aplicarFiltro = (setter, value) => {
    setter(value)
    setOffset(0)
  }

  const limpiarFiltros = () => {
    setFiltroNumeroGuia('')
    setFiltroFechaDesde('')
    setFiltroFechaHasta('')
    setFiltroClienteId('')
    setFiltroEspecieId('')
    setOffset(0)
  }

  useEffect(() => {
    if (!detalleDespachoId) {
      setDetalle(null)
      return
    }
    setLoadingDetalle(true)
    despachosApi
      .obtener(detalleDespachoId)
      .then((r) => setDetalle(r.data))
      .catch(() => toast.error('Error al cargar detalle'))
      .finally(() => setLoadingDetalle(false))
  }, [detalleDespachoId])

  const formatFecha = (f) => (f ? new Date(f).toLocaleDateString('es-ES') : '-')

  const exportParams = () => {
    const p = { limit: 10000, offset: 0 }
    if (filtroNumeroGuia.trim()) p.numero_guia = filtroNumeroGuia.trim()
    if (filtroFechaDesde) p.fecha_desde = filtroFechaDesde
    if (filtroFechaHasta) p.fecha_hasta = filtroFechaHasta
    if (filtroClienteId) p.cliente_id = filtroClienteId
    if (filtroEspecieId) p.especie_id = filtroEspecieId
    return p
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <ArrowUpFromLine className="w-8 h-8 text-primary-600" />
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Por guía de salida</p>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Salidas</h1>
          </div>
        </div>
        <ExportDropdown
          getExportConfig={() => ({
            title: 'Salidas',
            filtersSummary: [filtroNumeroGuia && 'Nº guía', filtroFechaDesde && 'Desde', filtroFechaHasta && 'Hasta', filtroClienteId && 'Cliente', filtroEspecieId && 'Especie'].filter(Boolean).join(', ') || 'Ninguno',
            columns: [
              { key: 'numero_guia', label: 'Nº guía' },
              { key: 'fecha', label: 'Fecha' },
              { key: 'tipo_salida', label: 'Tipo' },
              { key: 'cliente_nombre', label: 'Cliente destino' },
              { key: 'cliente_origen_nombre', label: 'Cliente origen' },
              { key: 'usuario_nombre', label: 'Usuario' },
              { key: 'total_bultos', label: 'Bultos' },
              { key: 'total_kg', label: 'Total KG' },
              { key: 'cantidad_productos', label: 'Productos' },
            ],
            fetchData: () => movimientosApi.salidasAgrupadas(exportParams()).then((r) => ({ data: r.data?.data ?? [] })),
            detailTitle: 'Líneas de salidas',
            detailColumns: [
              { key: 'numero_guia', label: 'Nº guía' },
              { key: 'fecha', label: 'Fecha' },
              { key: 'tipo_salida', label: 'Tipo' },
              { key: 'cliente_nombre', label: 'Cliente destino' },
              { key: 'producto_codigo', label: 'Código producto' },
              { key: 'producto_descripcion', label: 'Producto' },
              { key: 'lote', label: 'Lote' },
              { key: 'cantidad_bultos', label: 'Bultos' },
              { key: 'total_kg', label: 'Total KG' },
              { key: 'ubicacion', label: 'Ubicación' },
            ],
            fetchDataWithDetail: async () => {
              const { data: list } = await movimientosApi.salidasAgrupadas({ ...exportParams(), limit: 50 })
              const salidas = list?.data ?? list ?? []
              const full = await Promise.all(salidas.map((s) => despachosApi.obtener(s.despacho_id).then((r) => r.data)))
              const detailRows = full.flatMap((d, i) => (d.lineas || []).map((lin) => ({
                numero_guia: salidas[i].numero_guia,
                fecha: salidas[i].fecha,
                tipo_salida: salidas[i].tipo_salida,
                cliente_nombre: salidas[i].cliente_nombre,
                producto_codigo: lin.producto_codigo,
                producto_descripcion: lin.producto_descripcion,
                lote: lin.lote ?? '',
                cantidad_bultos: lin.cantidad_bultos,
                total_kg: lin.total_kg,
                ubicacion: lin.ubicacion || '-',
              })))
              return { data: salidas, detailRows }
            },
          })}
        />
      </div>

      <div className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
          <Search className="w-4 h-4" />
          Filtros
        </h2>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Nº guía</label>
            <input
              type="text"
              value={filtroNumeroGuia}
              onChange={(e) => aplicarFiltro(setFiltroNumeroGuia, e.target.value)}
              placeholder="Buscar por guía"
              className="w-40 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Fecha desde</label>
            <input
              type="date"
              value={filtroFechaDesde}
              onChange={(e) => aplicarFiltro(setFiltroFechaDesde, e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Fecha hasta</label>
            <input
              type="date"
              value={filtroFechaHasta}
              onChange={(e) => aplicarFiltro(setFiltroFechaHasta, e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Cliente (origen)</label>
            <select
              value={filtroClienteId}
              onChange={(e) => aplicarFiltro(setFiltroClienteId, e.target.value)}
              className="min-w-[180px] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Todos</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Especie</label>
            <select
              value={filtroEspecieId}
              onChange={(e) => aplicarFiltro(setFiltroEspecieId, e.target.value)}
              className="min-w-[140px] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Todas</option>
              {especies.map((e) => (
                <option key={e.id} value={e.id}>{e.nombre}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={limpiarFiltros}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            <X className="w-4 h-4" />
            Limpiar
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-10 h-10 text-primary-600 animate-spin" />
        </div>
      ) : lista.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center text-gray-500 dark:text-gray-400">
          No hay salidas (despachos despachados).
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {lista.map((s) => (
              <div
                key={s.despacho_id}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow overflow-hidden"
              >
                <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                  <h3 className="font-semibold text-lg text-gray-900 dark:text-white truncate" title={s.numero_guia}>
                    {s.numero_guia}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{formatFecha(s.fecha)}</p>
                </div>
                <div className="p-4 space-y-2 text-sm">
                  {s.cliente_origen_nombre && (
                    <p className="text-gray-700 dark:text-gray-300"><span className="text-gray-500 dark:text-gray-400">Cliente origen:</span> {s.cliente_origen_nombre}</p>
                  )}
                  <p className="text-gray-700 dark:text-gray-300"><span className="text-gray-500 dark:text-gray-400">Cliente destino:</span> {s.cliente_nombre}</p>
                  <p className="text-gray-700 dark:text-gray-300"><span className="text-gray-500 dark:text-gray-400">Tipo salida:</span> {s.tipo_salida}</p>
                  <p className="text-gray-700 dark:text-gray-300"><span className="text-gray-500 dark:text-gray-400">Ref.:</span> {s.referencia}</p>
                  <p className="text-gray-700 dark:text-gray-300"><span className="text-gray-500 dark:text-gray-400">Productos:</span> {s.cantidad_productos}</p>
                  <p className="font-medium text-gray-900 dark:text-white">Total: {s.total_bultos} bultos · {Number(s.total_kg).toFixed(2)} kg</p>
                  {(Number(s.total_peso_adicional) || 0) > 0 && (
                    <p className="text-gray-700 dark:text-gray-300"><span className="text-gray-500 dark:text-gray-400">Saldo (peso adj.):</span> {Number(s.total_peso_adicional).toFixed(2)} kg</p>
                  )}
                </div>
                <div className="p-4 pt-0">
                  <button
                    type="button"
                    onClick={() => setDetalleDespachoId(s.despacho_id)}
                    className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 hover:bg-primary-200 dark:hover:bg-primary-800/40 transition-colors"
                  >
                    <Info className="w-4 h-4" />
                    Ver detalle
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 px-2">
            <PaginationBar total={totalRegistros} limit={limit} offset={offset} onPageChange={setOffset} />
          </div>
        </>
      )}

      <Modal
        isOpen={!!detalleDespachoId}
        onClose={() => setDetalleDespachoId(null)}
        title={`Detalle salida — ${detalle?.guia_salida ?? detalle?.referencia_salida ?? ''}`}
        size="xl"
      >
        {loadingDetalle ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-10 h-10 text-primary-600 animate-spin" />
          </div>
        ) : detalle ? (
          <div className="space-y-6 overflow-y-auto max-h-[70vh] text-gray-900 dark:text-white">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg text-sm">
              <div><span className="text-gray-500 dark:text-gray-400 block text-xs">Guía salida</span>{detalle.guia_salida || '-'}</div>
              <div><span className="text-gray-500 dark:text-gray-400 block text-xs">Fecha</span>{formatFecha(detalle.fecha_salida)}</div>
              <div><span className="text-gray-500 dark:text-gray-400 block text-xs">Tipo</span>{detalle.tipo_salida}</div>
              <div><span className="text-gray-500 dark:text-gray-400 block text-xs">Cliente origen</span>{detalle.cliente_origen_nombre || '-'}</div>
              <div><span className="text-gray-500 dark:text-gray-400 block text-xs">Cliente destino</span>{detalle.cliente_destino || '-'}</div>
              <div><span className="text-gray-500 dark:text-gray-400 block text-xs">Usuario</span>{detalle.usuario_nombre}</div>
              <div><span className="text-gray-500 dark:text-gray-400 block text-xs">Estado</span>{detalle.estado}</div>
              <div><span className="text-gray-500 dark:text-gray-400 block text-xs">Saldo (peso adj.)</span>{(Number(detalle.total_adicional_despacho) || 0).toFixed(2)} kg</div>
            </div>
            <div>
              <h4 className="font-semibold mb-3">Líneas</h4>
              <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-600">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900/50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Producto</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Lote</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Bultos</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Total (kg)</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Peso adj. (kg)</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Ubicación</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {(detalle.lineas || []).map((l) => (
                      <tr key={l.id}>
                        <td className="px-3 py-2">{l.producto_codigo} — {l.producto_descripcion} — {l.producto_presentacion}</td>
                        <td className="px-3 py-2">{l.lote || '-'}</td>
                        <td className="px-3 py-2 text-right">{l.cantidad_bultos}</td>
                        <td className="px-3 py-2 text-right">{Number(l.total_kg).toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">{Number(l.peso_adicional || 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{l.ubicacion || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex gap-4 text-sm font-medium">
                <span>Total bultos: {detalle.lineas?.reduce((s, l) => s + (Number(l.cantidad_bultos) || 0), 0) ?? 0}</span>
                <span>Saldo (peso adj.): {(detalle.total_adicional_despacho != null ? Number(detalle.total_adicional_despacho) : (detalle.lineas?.reduce((s, l) => s + (Number(l.peso_adicional) || 0), 0) ?? 0)).toFixed(2)} kg</span>
                <span>Total kg: {(detalle.total_kg_despacho != null ? detalle.total_kg_despacho : detalle.lineas?.reduce((s, l) => s + (Number(l.total_kg) || 0), 0) ?? 0).toFixed(2)}</span>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}

export default Salidas
