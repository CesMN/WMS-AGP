import { useState, useEffect, Fragment } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Package, Search, ChevronDown, ChevronRight, MapPin, Loader2, Info, Layers, Download } from 'lucide-react'
import Modal from '../../components/Modal'
import PaginationBar from '../../components/PaginationBar'
import ExportDropdown from '../../components/ExportDropdown'
import { stockApi } from '../../api/stock'
import { almacenesApi } from '../../api/almacenes'
import { despachosApi } from '../../api/despachos'
import { especiesApi } from '../../api/especies'
import { clientesApi } from '../../api/clientes'
import { useConfig } from '../../contexts/ConfigContext'
import { exportToPdf, exportToExcel } from '../../utils/exportReport'
import { traducirLoteAFecha } from '../../utils/traducirLoteAFecha'
import toast from 'react-hot-toast'

const Stock = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const clienteFromUrl = searchParams.get('cliente_id') || ''
  const { registrosPorPagina, nombreEmpresa, lotRepublicanoAnos } = useConfig()
  const [loading, setLoading] = useState(true)
  const [almacenes, setAlmacenes] = useState([])
  const [especies, setEspecies] = useState([])
  const [clientes, setClientes] = useState([])
  const [items, setItems] = useState([])
  const [totalRegistros, setTotalRegistros] = useState(0)
  const [offset, setOffset] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const [filtroAlmacen, setFiltroAlmacen] = useState('')
  const [filtroCarril, setFiltroCarril] = useState('')
  const [filtroNivel, setFiltroNivel] = useState('')
  const [filtroPosicion, setFiltroPosicion] = useState('')
  const [filtroEspecie, setFiltroEspecie] = useState('')
  const [filtroCliente, setFiltroCliente] = useState(clienteFromUrl)
  const [busqueda, setBusqueda] = useState('')
  const [carrilesList, setCarrilesList] = useState([])
  const [nivelesList, setNivelesList] = useState([])
  const [posicionesList, setPosicionesList] = useState([])
  const [expandidoId, setExpandidoId] = useState(null)
  const [detalleItem, setDetalleItem] = useState(null)
  const [verLotes, setVerLotes] = useState(false)
  const [expandidosLotes, setExpandidosLotes] = useState(new Set())
  const [despachoResaltado, setDespachoResaltado] = useState({ id: '', activa: false, codigos: new Set(), ordenProduccion: '' })

  useEffect(() => {
    if (clienteFromUrl) setFiltroCliente(clienteFromUrl)
  }, [clienteFromUrl])

  useEffect(() => {
    Promise.all([
      almacenesApi.listar(),
      especiesApi.listar({ limit: 500 }),
      clientesApi.listar({ limit: 500 }),
    ])
      .then(([a, e, c]) => {
        setAlmacenes(a.data)
        setEspecies(e.data?.data ?? e.data ?? [])
        setClientes(c.data?.data ?? c.data ?? [])
      })
      .catch(() => toast.error('Error al cargar filtros'))
  }, [])

  useEffect(() => {
    setOffset(0)
  }, [filtroAlmacen, filtroCarril, filtroNivel, filtroPosicion, filtroEspecie, filtroCliente, busqueda])

  useEffect(() => {
    if (!filtroAlmacen) {
      setCarrilesList([])
      setFiltroCarril('')
      setFiltroNivel('')
      setFiltroPosicion('')
      setNivelesList([])
      setPosicionesList([])
      return
    }
    almacenesApi.carriles(filtroAlmacen).then((r) => setCarrilesList(r.data || [])).catch(() => setCarrilesList([]))
    setFiltroCarril('')
    setFiltroNivel('')
    setFiltroPosicion('')
    setNivelesList([])
    setPosicionesList([])
  }, [filtroAlmacen])

  useEffect(() => {
    if (!filtroAlmacen || !filtroCarril) {
      setNivelesList([])
      setPosicionesList([])
      setFiltroNivel('')
      setFiltroPosicion('')
      return
    }
    almacenesApi.nivelesPosiciones(filtroAlmacen, filtroCarril).then((r) => {
      const data = r.data || {}
      const matriz = data.matriz || []
      const niveles = matriz.map((n) => ({ id: n.nivel_id, numero_nivel: n.numero_nivel }))
      const posiciones = matriz.flatMap((n) =>
        (n.posiciones || []).map((p) => ({ id: p.id, nombre: p.nombre, numero_posicion: p.numero_posicion, nivel_id: n.nivel_id }))
      )
      setNivelesList(niveles)
      setPosicionesList(posiciones)
    }).catch(() => {
      setNivelesList([])
      setPosicionesList([])
    })
    setFiltroNivel('')
    setFiltroPosicion('')
  }, [filtroAlmacen, filtroCarril])

  useEffect(() => {
    let cancelled = false
    const limit = registrosPorPagina || 50
    const params = { limit, offset: Number(offset) }
    if (filtroAlmacen) params.almacen_id = filtroAlmacen
    if (filtroCarril) params.carril_id = filtroCarril
    if (filtroNivel) params.nivel_id = filtroNivel
    if (filtroPosicion) params.posicion_id = filtroPosicion
    if (filtroEspecie) params.especie_id = filtroEspecie
    if (filtroCliente) params.cliente_id = filtroCliente
    if (busqueda.trim()) params.q = busqueda.trim()
    setLoading(true)
    stockApi
      .listar(params)
      .then(({ data }) => {
        if (cancelled) return
        const list = data?.data ?? data ?? []
        setItems(Array.isArray(list) ? list : [])
        setTotalRegistros(data?.total ?? list.length ?? 0)
        setExpandidoId(null)
      })
      .catch(() => {
        if (!cancelled) {
          toast.error('Error al cargar el inventario')
          setItems([])
          setTotalRegistros(0)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [filtroAlmacen, filtroCarril, filtroNivel, filtroPosicion, filtroEspecie, filtroCliente, busqueda, offset, registrosPorPagina, refreshKey])

  useEffect(() => {
    let cancel = false
    const cargarRequeridos = async () => {
      let despachoId = ''
      try {
        despachoId = localStorage.getItem('despacho_activo_requeridos_id') || ''
      } catch (_) {
        despachoId = ''
      }
      if (!despachoId) {
        if (!cancel) setDespachoResaltado({ id: '', activa: false, codigos: new Set(), ordenProduccion: '' })
        return
      }
      try {
        const { data } = await despachosApi.obtenerProductosRequeridos(despachoId)
        if (cancel) return
        if (!data?.activa) {
          try {
            localStorage.removeItem('despacho_activo_requeridos_id')
          } catch (_) { /* noop */ }
          setDespachoResaltado({ id: '', activa: false, codigos: new Set(), ordenProduccion: '' })
          return
        }
        setDespachoResaltado({
          id: String(despachoId),
          activa: true,
          codigos: new Set((data?.productos || []).map((p) => String(p.codigo || '').trim()).filter(Boolean)),
          ordenProduccion: String(data?.orden_produccion || '').trim(),
        })
      } catch (_) {
        try {
          localStorage.removeItem('despacho_activo_requeridos_id')
        } catch (_) { /* noop */ }
        if (!cancel) setDespachoResaltado({ id: '', activa: false, codigos: new Set(), ordenProduccion: '' })
      }
    }
    cargarRequeridos()
    const handler = () => cargarRequeridos()
    window.addEventListener('despacho-requeridos-actualizados', handler)
    return () => {
      cancel = true
      window.removeEventListener('despacho-requeridos-actualizados', handler)
    }
  }, [])

  const toggleExpand = (productoId) => {
    setExpandidoId((prev) => (prev === productoId ? null : productoId))
  }

  const irAUbicacion = (almacenId, carrilId, posicionId) => {
    navigate(`/almacenes/${almacenId}/carriles/${carrilId}/posicion/${posicionId}`)
  }

  const totalBultos = items.reduce((s, i) => s + (i.total_bultos || 0), 0)
  const totalKg = items.reduce((s, i) => s + (Number(i.total_kg) || 0), 0)

  return (
    <div className="min-w-0 max-w-full">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between mb-5 sm:mb-6">
        <div className="flex items-start gap-3 min-w-0">
          <Package className="w-7 h-7 sm:w-8 sm:h-8 text-primary-600 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm text-gray-500 dark:text-gray-400">Inventario</p>
            <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white leading-tight">Stock por producto</h1>
          </div>
        </div>
        <div className="w-full sm:w-auto shrink-0">
        <ExportDropdown
          getExportConfig={() => ({
            title: 'Stock por producto',
            filtersSummary: [filtroAlmacen && 'Almacén', filtroCarril && 'Carril', filtroNivel && 'Nivel', filtroPosicion && 'Posición', filtroEspecie && 'Especie', filtroCliente && 'Cliente', busqueda && 'Búsqueda'].filter(Boolean).join(', ') || 'Ninguno',
            columns: [
              { key: 'codigo', label: 'Código' },
              { key: 'producto_nombre', label: 'Producto' },
              { key: 'descripcion', label: 'Descripción' },
              { key: 'presentacion', label: 'Presentación' },
              { key: 'especie_nombre', label: 'Especie' },
              { key: 'cliente_nombre', label: 'Cliente' },
              { key: 'total_bultos', label: 'Bultos' },
              { key: 'total_kg', label: 'Total KG' },
            ],
            fetchData: () => stockApi.listar({ limit: 10000, offset: 0, almacen_id: filtroAlmacen || undefined, carril_id: filtroCarril || undefined, nivel_id: filtroNivel || undefined, posicion_id: filtroPosicion || undefined, especie_id: filtroEspecie || undefined, cliente_id: filtroCliente || undefined, q: busqueda.trim() || undefined }).then((r) => ({ data: r.data?.data ?? r.data ?? [] })),
          })}
        />
        </div>
      </div>

      <div className="mb-6 p-3 sm:p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Filtros</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3 sm:gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Almacén</label>
            <select
              value={filtroAlmacen}
              onChange={(e) => setFiltroAlmacen(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white text-sm"
            >
              <option value="">Todos</option>
              {almacenes.map((a) => (
                <option key={a.id} value={a.id}>{a.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Carril</label>
            <select
              value={filtroCarril}
              onChange={(e) => setFiltroCarril(e.target.value)}
              disabled={!filtroAlmacen}
              className="w-full min-h-[44px] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">Todos</option>
              {carrilesList.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Nivel</label>
            <select
              value={filtroNivel}
              onChange={(e) => setFiltroNivel(e.target.value)}
              disabled={!filtroCarril}
              className="w-full min-h-[44px] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">Todos</option>
              {nivelesList.map((n) => (
                <option key={n.id} value={n.id}>Nivel {n.numero_nivel}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Posición</label>
            <select
              value={filtroPosicion}
              onChange={(e) => setFiltroPosicion(e.target.value)}
              disabled={!filtroCarril}
              className="w-full min-h-[44px] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">Todas</option>
              {(filtroNivel ? posicionesList.filter((p) => p.nivel_id === filtroNivel) : posicionesList).map((p) => (
                <option key={p.id} value={p.id}>{p.nombre || `P${p.numero_posicion}`}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Especie</label>
            <select
              value={filtroEspecie}
              onChange={(e) => setFiltroEspecie(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white text-sm"
            >
              <option value="">Todas</option>
              {especies.map((e) => (
                <option key={e.id} value={e.id}>{e.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Cliente</label>
            <select
              value={filtroCliente}
              onChange={(e) => setFiltroCliente(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white text-sm"
            >
              <option value="">Todos</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Buscar producto</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Código, nombre o descripción..."
                className="w-full min-h-[44px] pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white text-sm"
              />
            </div>
          </div>
        </div>
      </div>

      {despachoResaltado.activa && (
        <div className="mb-4 px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 text-sm">
          Resaltando codigos requeridos por OP {despachoResaltado.ordenProduccion || '-'}.
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-10 h-10 text-primary-600 animate-spin" />
        </div>
      ) : (
        <>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="wms-table-scroll">
              <table className="min-w-[56rem] w-full">
                <thead className="bg-gray-50 dark:bg-gray-900/50">
                  <tr>
                    <th className="w-9 p-2" />
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Producto</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Descripción</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Presentación</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Especie</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Cliente</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Bultos</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total KG</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ubicaciones</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-24">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                        No hay stock que coincida con los filtros.
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => (
                      <Fragment key={item.producto_id}>
                        {(() => {
                          const esRequerido = despachoResaltado.activa && despachoResaltado.codigos.has(String(item.codigo || '').trim())
                          return (
                        <tr
                          className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${esRequerido ? 'bg-amber-50 dark:bg-amber-900/10' : ''}`}
                        >
                          <td className="p-2">
                            {item.ubicaciones && item.ubicaciones.length > 0 && (
                              <button
                                type="button"
                                onClick={() => toggleExpand(item.producto_id)}
                                className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
                              >
                                {expandidoId === item.producto_id ? (
                                  <ChevronDown className="w-4 h-4 text-gray-500" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-gray-500" />
                                )}
                              </button>
                            )}
                          </td>
                          <td className="px-4 py-1">
                            <div className={`font-medium ${esRequerido ? 'text-amber-700 dark:text-amber-300' : 'text-gray-900 dark:text-white'}`}>
                              {item.codigo}
                              {esRequerido && (
                                <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                                  Requerido
                                </span>
                              )}
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">{item.producto_nombre}</div>
                          </td>
                          <td className="px-4 py-1 text-sm text-gray-700 dark:text-gray-300 min-w-[160px] max-w-[260px] align-top">
                            <div className="line-clamp-2 break-words" title={item.descripcion}>
                              {item.descripcion || '-'}
                            </div>
                          </td>
                          <td className="px-4 py-1 text-sm text-gray-700 dark:text-gray-300">
                            {item.presentacion || '-'}
                          </td>
                          <td className="px-4 py-1 text-sm text-gray-700 dark:text-gray-300">
                            {item.especie_nombre}
                          </td>
                          <td className="px-4 py-1 text-sm text-gray-700 dark:text-gray-300">
                            {item.cliente_nombre}
                          </td>
                          <td className="px-4 py-1 text-right font-medium text-gray-900 dark:text-white">
                            {item.total_bultos.toLocaleString()}
                          </td>
                          <td className="px-4 py-1 text-right font-medium text-gray-900 dark:text-white">
                            {Number(item.total_kg).toFixed(2)} KG
                          </td>
                          <td className="px-4 py-1 text-center">
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-200">
                              <MapPin className="w-3.5 h-3.5" />
                              {item.ubicaciones?.length || 0}
                            </span>
                          </td>
                          <td className="px-4 py-1 text-center">
                            <button
                              type="button"
                              onClick={() => setDetalleItem(item)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-primary-100 dark:hover:bg-primary-900/30 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
                            >
                              <Info className="w-4 h-4" />
                              Detalles
                            </button>
                          </td>
                        </tr>
                          )
                        })()}
                        {expandidoId === item.producto_id && item.ubicaciones?.length > 0 && (
                          <tr className="bg-gray-50 dark:bg-gray-900/30">
                            <td colSpan={10} className="px-4 py-3">
                              <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">Ubicaciones</div>
                              <div className="flex flex-wrap gap-2">
                                {item.ubicaciones.map((u, idx) => (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={() => irAUbicacion(u.almacen_id, u.carril_id, u.posicion_id)}
                                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-primary-50 dark:hover:bg-primary-900/20 text-left text-sm"
                                  >
                                    <MapPin className="w-4 h-4 text-primary-600" />
                                    <span>{u.almacen_nombre} → {u.carril_nombre} → N{u.numero_nivel} → P{u.numero_posicion}</span>
                                    {u.lote ? (
                                      <span className="text-xs font-medium text-primary-600 dark:text-primary-400">
                                        Lote: {u.lote}
                                        {traducirLoteAFecha(u.lote, lotRepublicanoAnos) && (
                                          <span className="font-normal text-gray-500 dark:text-gray-400 ml-1">({traducirLoteAFecha(u.lote, lotRepublicanoAnos)})</span>
                                        )}
                                      </span>
                                    ) : null}
                                    <span className="text-gray-500 dark:text-gray-400">({u.cantidad_bultos} bultos{u.peso_adicional ? `, ${Number(u.peso_adicional).toFixed(2)} kg adj.` : ''}, {(Number(u.total_kg) > 0 ? Number(u.total_kg) : Number(u.total_kg) + Number(u.peso_adicional || 0)).toFixed(2)} kg total)</span>
                                  </button>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {items.length > 0 && (
              <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
                <PaginationBar total={totalRegistros} limit={registrosPorPagina || 50} offset={offset} onPageChange={setOffset} />
              </div>
            )}
          </div>

          {items.length > 0 && (
            <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 flex flex-wrap gap-6 text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-300">
                Total productos con stock: <strong>{items.length}</strong>
              </span>
              <span className="font-medium text-gray-700 dark:text-gray-300">
                Suma bultos: <strong>{totalBultos.toLocaleString()}</strong>
              </span>
              <span className="font-medium text-gray-700 dark:text-gray-300">
                Suma KG: <strong>{totalKg.toFixed(2)} KG</strong>
              </span>
            </div>
          )}
        </>
      )}

      <Modal
        isOpen={!!detalleItem}
        onClose={() => { setDetalleItem(null); setVerLotes(false); setExpandidosLotes(new Set()) }}
        title={verLotes ? `Lotes — ${detalleItem?.codigo ?? ''}` : 'Detalle del producto'}
        size="lg"
      >
        {detalleItem && (
          <div className="space-y-5 overflow-y-auto max-h-[70vh]">
            {verLotes ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setVerLotes(false)}
                    className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
                  >
                    ← Volver al detalle
                  </button>
                  {(() => {
                    const ubs = detalleItem.ubicaciones || []
                    const byLote = {}
                    ubs.forEach((u) => {
                      const key = (u.lote != null && String(u.lote).trim() !== '') ? String(u.lote).trim() : '(Sin lote)'
                      if (!byLote[key]) {
                        byLote[key] = { lote: key, ubicaciones: [], totalBultos: 0, totalKg: 0, totalPesoAdj: 0 }
                      }
                      byLote[key].ubicaciones.push(u)
                      byLote[key].totalBultos += Number(u.cantidad_bultos) || 0
                      byLote[key].totalPesoAdj += Number(u.peso_adicional) || 0
                      byLote[key].totalKg += Number(u.total_kg) || 0
                    })
                    const lotesOrdenados = Object.keys(byLote).sort((a, b) => (a === '(Sin lote)' ? 1 : b === '(Sin lote)' ? -1 : a.localeCompare(b)))
                    const reportTitle = [detalleItem.codigo, detalleItem.descripcion || detalleItem.producto_nombre, detalleItem.presentacion].filter(Boolean).join(' — ')
                    const reportRows = lotesOrdenados.map((key) => {
                      const g = byLote[key]
                      const totalKgReal = g.totalKg
                      return {
                        lote: g.lote,
                        total_bultos: g.totalBultos,
                        saldo_kg: Number(g.totalPesoAdj).toFixed(2),
                        total_kg: Number(totalKgReal).toFixed(2),
                      }
                    })
                    const reportColumns = [
                      { key: 'lote', label: 'Lote' },
                      { key: 'total_bultos', label: 'Total bultos' },
                      { key: 'saldo_kg', label: 'Saldo (kg)' },
                      { key: 'total_kg', label: 'Total KG' },
                    ]
                    const appName = (nombreEmpresa && nombreEmpresa.trim()) ? nombreEmpresa.trim() : 'Sistema WMS'
                    const filtersText = `Código: ${detalleItem.codigo || '-'}  |  Descripción: ${(detalleItem.descripcion || detalleItem.producto_nombre || '-').toString().slice(0, 60)}  |  Presentación: ${detalleItem.presentacion || '-'}`
                    const titleReport = reportTitle.slice(0, 100)
                    return (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            try {
                              exportToPdf(reportRows, reportColumns, titleReport, filtersText, '', { appName })
                              toast.success('Informe PDF descargado')
                            } catch (e) {
                              toast.error('Error al generar PDF')
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-primary-100 dark:hover:bg-primary-900/30 hover:text-primary-700 dark:hover:text-primary-300"
                        >
                          <Download className="w-4 h-4" />
                          Exportar PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            try {
                              exportToExcel(reportRows, reportColumns, titleReport, filtersText, '', { appName })
                              toast.success('Informe Excel descargado')
                            } catch (e) {
                              toast.error('Error al generar Excel')
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-primary-100 dark:hover:bg-primary-900/30 hover:text-primary-700 dark:hover:text-primary-300"
                        >
                          <Download className="w-4 h-4" />
                          Exportar Excel
                        </button>
                      </>
                    )
                  })()}
                </div>
                {(() => {
                  const ubs = detalleItem.ubicaciones || []
                  const byLote = {}
                  ubs.forEach((u) => {
                    const key = (u.lote != null && String(u.lote).trim() !== '') ? String(u.lote).trim() : '(Sin lote)'
                    if (!byLote[key]) {
                      byLote[key] = { lote: key, ubicaciones: [], totalBultos: 0, totalKg: 0, totalPesoAdj: 0 }
                    }
                    byLote[key].ubicaciones.push(u)
                    byLote[key].totalBultos += Number(u.cantidad_bultos) || 0
                    byLote[key].totalPesoAdj += Number(u.peso_adicional) || 0
                    byLote[key].totalKg += Number(u.total_kg) || 0
                  })
                  const lotesOrdenados = Object.keys(byLote).sort((a, b) => (a === '(Sin lote)' ? 1 : b === '(Sin lote)' ? -1 : a.localeCompare(b)))
                  return lotesOrdenados.map((key) => {
                    const g = byLote[key]
                    const totalKgReal = g.totalKg
                    const expandido = expandidosLotes.has(key)
                    const toggleLote = () => {
                      setExpandidosLotes((prev) => {
                        const next = new Set(prev)
                        if (next.has(key)) next.delete(key)
                        else next.add(key)
                        return next
                      })
                    }
                    return (
                      <div key={key} className="rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 overflow-hidden">
                        <button
                          type="button"
                          onClick={toggleLote}
                          className="w-full flex flex-wrap items-center justify-between gap-2 p-4 text-left hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
                        >
                          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                            {expandido ? (
                              <ChevronDown className="w-4 h-4 text-primary-600 flex-shrink-0" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-primary-600 flex-shrink-0" />
                            )}
                            <Layers className="w-4 h-4 text-primary-600" />
                            Lote: {g.lote}
                            {traducirLoteAFecha(g.lote, lotRepublicanoAnos) && (
                              <span className="text-xs font-normal text-gray-500 dark:text-gray-400 ml-1">
                                ({traducirLoteAFecha(g.lote, lotRepublicanoAnos)})
                              </span>
                            )}
                          </h3>
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {g.totalBultos} bultos · {totalKgReal.toFixed(2)} kg total · {g.ubicaciones.length} ubicación{g.ubicaciones.length !== 1 ? 'es' : ''}
                          </span>
                        </button>
                        {expandido && (
                          <div className="flex flex-wrap gap-2 px-4 pb-4 pt-0 border-t border-gray-200 dark:border-gray-600">
                            {g.ubicaciones.map((u, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => { setDetalleItem(null); setVerLotes(false); setExpandidosLotes(new Set()); irAUbicacion(u.almacen_id, u.carril_id, u.posicion_id) }}
                                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-primary-50 dark:hover:bg-primary-900/20 text-left text-sm"
                              >
                                <MapPin className="w-4 h-4 text-primary-600 flex-shrink-0" />
                                <span>{u.almacen_nombre} → {u.carril_nombre} → N{u.numero_nivel} → P{u.numero_posicion}</span>
                                <span className="text-gray-500 dark:text-gray-400">({u.cantidad_bultos} bultos{u.peso_adicional ? `, ${Number(u.peso_adicional).toFixed(2)} kg adj.` : ''})</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })
                })()}
              </div>
            ) : (
            <>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setVerLotes(true)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 hover:bg-primary-200 dark:hover:bg-primary-800/40"
              >
                <Layers className="w-4 h-4" />
                Ver lotes
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500 dark:text-gray-400 block text-xs font-medium">Código</span>
                <span className="font-semibold text-gray-900 dark:text-white">{detalleItem.codigo}</span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400 block text-xs font-medium">Nombre</span>
                <span className="text-gray-900 dark:text-white">{detalleItem.producto_nombre}</span>
              </div>
              <div className="col-span-2">
                <span className="text-gray-500 dark:text-gray-400 block text-xs font-medium">Descripción</span>
                <p className="text-gray-900 dark:text-white mt-0.5 whitespace-pre-wrap break-words">{detalleItem.descripcion || '-'}</p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400 block text-xs font-medium">Presentación</span>
                <span className="text-gray-900 dark:text-white">{detalleItem.presentacion || '-'}</span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400 block text-xs font-medium">Especie</span>
                <span className="text-gray-900 dark:text-white">{detalleItem.especie_nombre}</span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400 block text-xs font-medium">Cliente</span>
                <span className="text-gray-900 dark:text-white">{detalleItem.cliente_nombre}</span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400 block text-xs font-medium">Total bultos</span>
                <span className="font-semibold text-gray-900 dark:text-white">{detalleItem.total_bultos?.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400 block text-xs font-medium">Peso adicional total (kg)</span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {(detalleItem.ubicaciones || []).reduce((s, u) => s + (Number(u.peso_adicional) || 0), 0).toFixed(2)} kg
                </span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400 block text-xs font-medium">Total KG</span>
                <span className="font-semibold text-gray-900 dark:text-white">{Number(detalleItem.total_kg).toFixed(2)} KG</span>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Ubicaciones ({detalleItem.ubicaciones?.length || 0})
              </h3>
              <div className="flex flex-wrap gap-2">
                {detalleItem.ubicaciones?.length > 0 ? (
                  detalleItem.ubicaciones.map((u, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setDetalleItem(null)
                        setVerLotes(false)
                        irAUbicacion(u.almacen_id, u.carril_id, u.posicion_id)
                      }}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 hover:bg-primary-50 dark:hover:bg-primary-900/20 text-left text-sm w-full sm:w-auto"
                    >
                      <MapPin className="w-4 h-4 text-primary-600 flex-shrink-0" />
                      <span>{u.almacen_nombre} → {u.carril_nombre} → N{u.numero_nivel} → P{u.numero_posicion}</span>
                      {u.lote ? <span className="text-xs font-medium text-primary-600 dark:text-primary-400">Lote: {u.lote}</span> : null}
                      <span className="text-gray-500 dark:text-gray-400">({u.cantidad_bultos} bultos{u.peso_adicional ? `, ${Number(u.peso_adicional).toFixed(2)} kg adj.` : ''}, {(Number(u.total_kg) > 0 ? Number(u.total_kg) : Number(u.total_kg) + Number(u.peso_adicional || 0)).toFixed(2)} kg total)</span>
                    </button>
                  ))
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">Sin ubicaciones.</p>
                )}
              </div>
            </div>
            </>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

export default Stock
