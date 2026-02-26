import { useState, useEffect } from 'react'
import { ArrowDownToLine, Loader2, Info, Search, X, ChevronRight, ChevronDown, LayoutList, MapPin } from 'lucide-react'
import Modal from '../../components/Modal'
import PaginationBar from '../../components/PaginationBar'
import ExportDropdown from '../../components/ExportDropdown'
import { movimientosApi } from '../../api/movimientos'
import { clientesApi } from '../../api/clientes'
import { especiesApi } from '../../api/especies'
import { useConfig } from '../../contexts/ConfigContext'
import toast from 'react-hot-toast'

const Ingresos = () => {
  const { registrosPorPagina } = useConfig()
  const [loading, setLoading] = useState(true)
  const [lista, setLista] = useState([])
  const [totalRegistros, setTotalRegistros] = useState(0)
  const [offset, setOffset] = useState(0)
  const [detalleGrupo, setDetalleGrupo] = useState(null)
  const [loadingDetalle, setLoadingDetalle] = useState(false)
  const [detalleMovimientos, setDetalleMovimientos] = useState([])
  const [vistaLineasIngreso, setVistaLineasIngreso] = useState('resumida')
  const [expandidosGruposIngreso, setExpandidosGruposIngreso] = useState(new Set())
  const [sinColumnaGuia, setSinColumnaGuia] = useState(false)
  const [clientes, setClientes] = useState([])
  const [especies, setEspecies] = useState([])
  const [filtroNumeroGuia, setFiltroNumeroGuia] = useState('')
  const [filtroFechaDesde, setFiltroFechaDesde] = useState('')
  const [filtroFechaHasta, setFiltroFechaHasta] = useState('')
  const [filtroClienteId, setFiltroClienteId] = useState('')
  const [filtroEspecieId, setFiltroEspecieId] = useState('')
  const [editarGuiaValor, setEditarGuiaValor] = useState('')
  const [guardandoGuia, setGuardandoGuia] = useState(false)

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
      .ingresosAgrupados(params)
      .then((res) => {
        if (cancelled) return
        const payload = res?.data
        setLista(Array.isArray(payload?.data) ? payload.data : [])
        setTotalRegistros(Number(payload?.total) || 0)
        setSinColumnaGuia(Boolean(payload?.sin_columna_guia))
      })
      .catch(() => {
        if (!cancelled) {
          setLista([])
          setTotalRegistros(0)
          toast.error('Error al cargar ingresos')
        }
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
    if (!detalleGrupo?.movimiento_ids?.length) {
      setDetalleMovimientos([])
      return
    }
    const guiaActual = detalleGrupo.numero_guia != null && String(detalleGrupo.numero_guia).trim() !== '' && detalleGrupo.numero_guia !== 'Sin guía'
      ? String(detalleGrupo.numero_guia).trim()
      : ''
    setEditarGuiaValor(guiaActual)
    setLoadingDetalle(true)
    Promise.all(detalleGrupo.movimiento_ids.map((id) => movimientosApi.obtener(id)))
      .then((responses) => {
        setDetalleMovimientos(responses.map((r) => r.data))
      })
      .catch(() => toast.error('Error al cargar detalle'))
      .finally(() => setLoadingDetalle(false))
  }, [detalleGrupo])

  const handleActualizarGuia = async () => {
    if (!detalleGrupo?.movimiento_ids?.length) return
    const nuevoValor = (editarGuiaValor != null ? String(editarGuiaValor).trim() : '') || ''
    try {
      setGuardandoGuia(true)
      await movimientosApi.actualizarGuiaGrupo({
        movimiento_ids: detalleGrupo.movimiento_ids,
        numero_guia: nuevoValor || null,
      })
      const guiaMostrar = nuevoValor || 'Sin guía'
      setDetalleGrupo((prev) => (prev ? { ...prev, numero_guia: guiaMostrar } : prev))
      setLista((prev) =>
        prev.map((g) => {
          if (!g.movimiento_ids || !detalleGrupo.movimiento_ids || g.movimiento_ids.length !== detalleGrupo.movimiento_ids.length) return g
          const mismoGrupo = g.movimiento_ids.every((id, i) => id === detalleGrupo.movimiento_ids[i])
          return mismoGrupo ? { ...g, numero_guia: guiaMostrar } : g
        })
      )
      toast.success('Número de guía actualizado. El cambio se refleja en ingresos, historial de movimientos y vista posición.')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al actualizar la guía')
    } finally {
      setGuardandoGuia(false)
    }
  }

  const formatFecha = (fechaHora) => {
    if (!fechaHora) return '-'
    return new Date(fechaHora).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })
  }

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
          <ArrowDownToLine className="w-8 h-8 text-primary-600" />
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Por guía de ingreso</p>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Ingresos</h1>
          </div>
        </div>
        <ExportDropdown
          getExportConfig={() => ({
            title: 'Ingresos',
            filtersSummary: [filtroNumeroGuia && 'Nº guía', filtroFechaDesde && 'Desde', filtroFechaHasta && 'Hasta', filtroClienteId && 'Cliente', filtroEspecieId && 'Especie'].filter(Boolean).join(', ') || 'Ninguno',
            columns: [
              { key: 'numero_guia', label: 'Nº guía' },
              { key: 'fecha_hora', label: 'Fecha' },
              { key: 'cliente_nombre', label: 'Cliente' },
              { key: 'especie_nombre', label: 'Especie' },
              { key: 'usuario_nombre', label: 'Usuario' },
              { key: 'total_bultos', label: 'Bultos' },
              { key: 'total_kg', label: 'Total KG' },
              { key: 'cantidad_productos', label: 'Productos' },
            ],
            fetchData: () => movimientosApi.ingresosAgrupados(exportParams()).then((r) => ({ data: r.data?.data ?? [] })),
            detailTitle: 'Detalle de ingresos (líneas por movimiento)',
            detailColumns: [
              { key: 'numero_guia', label: 'Nº guía' },
              { key: 'fecha_hora', label: 'Fecha' },
              { key: 'cliente_nombre', label: 'Cliente' },
              { key: 'especie_nombre', label: 'Especie' },
              { key: 'producto_codigo', label: 'Código producto' },
              { key: 'producto_descripcion', label: 'Producto' },
              { key: 'lote', label: 'Lote' },
              { key: 'cantidad_bultos', label: 'Bultos' },
              { key: 'total_kg', label: 'Total KG' },
              { key: 'ubicacion', label: 'Ubicación' },
            ],
            fetchDataWithDetail: async () => {
              const { data: list } = await movimientosApi.ingresosAgrupados({ ...exportParams(), limit: 25 })
              const grupos = list?.data ?? list ?? []
              const detailRows = []
              for (const g of grupos) {
                const ids = g.movimiento_ids || []
                if (ids.length === 0) continue
                const movs = await Promise.all(ids.map((id) => movimientosApi.obtener(id).then((r) => r.data)))
                for (const m of movs) {
                  for (const d of m.detalles || []) {
                    const ubicacion = [d.almacen_nombre, d.carril_nombre, d.numero_nivel != null ? `N${d.numero_nivel}` : '', d.numero_posicion != null ? `P${d.numero_posicion}` : ''].filter(Boolean).join(' → ') || '-'
                    detailRows.push({
                      numero_guia: g.numero_guia,
                      fecha_hora: g.fecha_hora,
                      cliente_nombre: g.cliente_nombre,
                      especie_nombre: g.especie_nombre,
                      producto_codigo: d.producto_codigo,
                      producto_descripcion: d.producto_descripcion,
                      lote: d.lote ?? '',
                      cantidad_bultos: d.cantidad_bultos,
                      total_kg: d.total_kg,
                      ubicacion,
                    })
                  }
                }
              }
              return { data: grupos, detailRows }
            },
          })}
        />
      </div>

      {sinColumnaGuia && (
        <div className="mb-4 p-3 rounded-lg bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 text-sm">
          Para mostrar el número de guía en cada ingreso, ejecute la migración de base de datos: <code className="bg-amber-200/50 dark:bg-amber-800/50 px-1 rounded">add_numero_guia_movimientos.sql</code> (o <code className="bg-amber-200/50 dark:bg-amber-800/50 px-1 rounded">run-migrations.bat</code>).
        </div>
      )}

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
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Cliente</label>
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
          No hay ingresos registrados.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {lista.filter((g) => g && (g.grupo_id != null || g.numero_guia != null)).map((g, idx) => (
              <div
                key={g.grupo_id ?? g.numero_guia ?? `g-${idx}`}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow overflow-hidden"
              >
                <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Nº guía de ingreso</p>
                  <h3 className="font-semibold text-lg text-gray-900 dark:text-white truncate" title={g.numero_guia ?? ''}>
                    {(g.numero_guia != null && String(g.numero_guia).trim() !== '') ? g.numero_guia : 'Sin guía'}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{formatFecha(g.fecha_hora)}</p>
                </div>
                <div className="p-4 space-y-2 text-sm">
                  <p className="text-gray-700 dark:text-gray-300"><span className="text-gray-500 dark:text-gray-400">Cliente:</span> {g.cliente_nombre ?? '-'}</p>
                  <p className="text-gray-700 dark:text-gray-300"><span className="text-gray-500 dark:text-gray-400">Especie:</span> {g.especie_nombre ?? '-'}</p>
                  <p className="text-gray-700 dark:text-gray-300"><span className="text-gray-500 dark:text-gray-400">Ref. ingreso:</span> {g.referencia_ingreso ?? '-'}</p>
                  <p className="text-gray-700 dark:text-gray-300"><span className="text-gray-500 dark:text-gray-400">Productos:</span> {g.cantidad_productos ?? 0}</p>
                  <p className="font-medium text-gray-900 dark:text-white">Total: {Number(g.total_bultos) || 0} bultos · {Number(g.total_kg).toFixed(2)} kg</p>
                  {(Number(g.total_peso_adicional) || 0) > 0 && (
                    <p className="text-gray-700 dark:text-gray-300"><span className="text-gray-500 dark:text-gray-400">Saldo (peso adj.):</span> {Number(g.total_peso_adicional).toFixed(2)} kg</p>
                  )}
                </div>
                <div className="p-4 pt-0">
                  <button
                    type="button"
                    onClick={() => setDetalleGrupo(g)}
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
        isOpen={!!detalleGrupo}
        onClose={() => { setDetalleGrupo(null); setVistaLineasIngreso('resumida'); setExpandidosGruposIngreso(new Set()) }}
        title={`Detalle ingreso — ${detalleGrupo?.numero_guia ?? ''}`}
        size="xl"
      >
        {loadingDetalle ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-10 h-10 text-primary-600 animate-spin" />
          </div>
        ) : (
          <div className="space-y-6 overflow-y-auto max-h-[70vh] text-gray-900 dark:text-white">
            {detalleGrupo && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg text-sm">
                <div className="md:col-span-2 flex flex-col gap-1">
                  <span className="text-gray-500 dark:text-gray-400 block text-xs">Número de guía de ingreso</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={editarGuiaValor}
                      onChange={(e) => setEditarGuiaValor(e.target.value)}
                      placeholder="Guía referencial o definitiva"
                      className="flex-1 min-w-[140px] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500"
                      disabled={guardandoGuia}
                    />
                    <button
                      type="button"
                      onClick={handleActualizarGuia}
                      disabled={guardandoGuia}
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 inline-flex items-center gap-1.5"
                    >
                      {guardandoGuia ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      Actualizar guía
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">El cambio se refleja en esta vista, en el historial de movimientos y en la vista posición.</p>
                </div>
                <div><span className="text-gray-500 dark:text-gray-400 block text-xs">Fecha</span>{formatFecha(detalleGrupo.fecha_hora)}</div>
                <div><span className="text-gray-500 dark:text-gray-400 block text-xs">Cliente</span>{detalleGrupo.cliente_nombre}</div>
                <div><span className="text-gray-500 dark:text-gray-400 block text-xs">Especie</span>{detalleGrupo.especie_nombre}</div>
                <div><span className="text-gray-500 dark:text-gray-400 block text-xs">Ref. ingreso</span>{detalleGrupo.referencia_ingreso}</div>
                <div><span className="text-gray-500 dark:text-gray-400 block text-xs">Usuario</span>{detalleGrupo.usuario_nombre}</div>
                <div><span className="text-gray-500 dark:text-gray-400 block text-xs">Total bultos</span>{detalleGrupo.total_bultos}</div>
                <div><span className="text-gray-500 dark:text-gray-400 block text-xs">Total kg</span>{Number(detalleGrupo.total_kg).toFixed(2)}</div>
                <div><span className="text-gray-500 dark:text-gray-400 block text-xs">Saldo (peso adj.)</span>{Number(detalleGrupo.total_peso_adicional || 0).toFixed(2)} kg</div>
              </div>
            )}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h4 className="font-semibold text-gray-900 dark:text-white">Líneas de detalle</h4>
                <button
                  type="button"
                  onClick={() => setVistaLineasIngreso((v) => (v === 'resumida' ? 'ubicacion' : 'resumida'))}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-primary-100 dark:hover:bg-primary-900/30"
                >
                  {vistaLineasIngreso === 'resumida' ? <MapPin className="w-4 h-4" /> : <LayoutList className="w-4 h-4" />}
                  {vistaLineasIngreso === 'resumida' ? 'Ver por ubicación' : 'Ver resumido por producto y lote'}
                </button>
              </div>
              {(() => {
                const todasLasLineas = detalleMovimientos.flatMap((mov) => mov.detalles || [])
                const vistos = new Set()
                const lineasUnicas = todasLasLineas.filter((d) => {
                  const clave = d.stock_posicion_id ?? d.id
                  if (vistos.has(clave)) return false
                  vistos.add(clave)
                  return true
                })
                const totalBultos = lineasUnicas.reduce((s, d) => s + (Number(d.cantidad_bultos) || 0), 0)
                const totalPesoAdj = lineasUnicas.reduce((s, d) => s + (Number(d.peso_adicional) || 0), 0)
                const totalKg = lineasUnicas.reduce((s, d) => s + (Number(d.total_kg) || 0), 0)
                return (
                  <div className="mb-3 flex flex-wrap gap-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                    <span>Total bultos: {totalBultos}</span>
                    <span>Saldo (peso adj.): {totalPesoAdj.toFixed(2)} kg</span>
                    <span>Total kg: {totalKg.toFixed(2)}</span>
                  </div>
                )
              })()}
              {(() => {
                const todasLasLineas = detalleMovimientos.flatMap((mov) => mov.detalles || [])
                const vistos = new Set()
                const lineasUnicas = todasLasLineas.filter((d) => {
                  const clave = d.stock_posicion_id ?? d.id
                  if (vistos.has(clave)) return false
                  vistos.add(clave)
                  return true
                })
                if (lineasUnicas.length === 0) return <p className="text-sm text-gray-500 dark:text-gray-400 py-3">Sin líneas.</p>
                if (vistaLineasIngreso === 'resumida') {
                  const byKey = {}
                  lineasUnicas.forEach((d) => {
                    const key = `${d.producto_codigo || ''}|${d.lote ?? ''}`
                    if (!byKey[key]) {
                      byKey[key] = { codigo: d.producto_codigo, descripcion: d.producto_descripcion, presentacion: d.producto_presentacion, lote: d.lote ?? '', lineas: [] }
                    }
                    byKey[key].lineas.push(d)
                  })
                  const grupos = Object.entries(byKey).map(([key, g]) => ({
                    key,
                    ...g,
                    totalBultos: g.lineas.reduce((s, d) => s + (Number(d.cantidad_bultos) || 0), 0),
                    totalAdicional: g.lineas.reduce((s, d) => s + (Number(d.peso_adicional) || 0), 0),
                    totalKg: g.lineas.reduce((s, d) => s + (Number(d.total_kg) || 0), 0),
                  }))
                  return (
                    <div className="space-y-2">
                      {grupos.map((gr) => {
                        const expandido = expandidosGruposIngreso.has(gr.key)
                        const toggle = () => setExpandidosGruposIngreso((prev) => { const n = new Set(prev); if (n.has(gr.key)) n.delete(gr.key); else n.add(gr.key); return n })
                        const ubicacionStr = (d) => [d.almacen_nombre, d.carril_nombre, d.numero_nivel != null ? `N${d.numero_nivel}` : '', d.numero_posicion != null ? `P${d.numero_posicion}` : ''].filter(Boolean).join(' → ') || '-'
                        return (
                          <div key={gr.key} className="rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 overflow-hidden">
                            <button type="button" onClick={toggle} className="w-full flex items-center justify-between gap-2 p-3 text-left hover:bg-gray-100 dark:hover:bg-gray-700/50">
                              <span className="flex items-center gap-2 font-medium text-gray-900 dark:text-white">
                                {expandido ? <ChevronDown className="w-4 h-4 text-primary-600" /> : <ChevronRight className="w-4 h-4 text-primary-600" />}
                                {gr.codigo}{gr.descripcion ? ` — ${gr.descripcion}` : ''}{gr.presentacion ? ` · ${gr.presentacion}` : ''} {gr.lote ? `· Lote: ${gr.lote}` : ''}
                              </span>
                              <span className="text-sm text-gray-600 dark:text-gray-400">
                                {gr.totalBultos} bultos · {gr.totalAdicional.toFixed(2)} kg adj. · {gr.totalKg.toFixed(2)} kg · {gr.lineas.length} ubicación{gr.lineas.length !== 1 ? 'es' : ''}
                              </span>
                            </button>
                            {expandido && (
                              <div className="border-t border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800">
                                <table className="w-full text-sm">
                                  <thead className="bg-gray-50 dark:bg-gray-900/50">
                                    <tr>
                                      <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Ubicación</th>
                                      <th className="px-3 py-1.5 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Bultos</th>
                                      <th className="px-3 py-1.5 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Peso adj.</th>
                                      <th className="px-3 py-1.5 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Total kg</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {gr.lineas.map((d) => (
                                      <tr key={d.stock_posicion_id ?? d.id}>
                                        <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-xs">{ubicacionStr(d)}</td>
                                        <td className="px-3 py-1.5 text-right">{d.cantidad_bultos}</td>
                                        <td className="px-3 py-1.5 text-right">{Number(d.peso_adicional || 0).toFixed(2)}</td>
                                        <td className="px-3 py-1.5 text-right font-medium">{Number(d.total_kg).toFixed(2)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                }
                return (
                  <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-600">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-900/50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Producto</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Lote</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Bultos</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Peso adj. (kg)</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Total (kg)</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Ubicación</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {lineasUnicas.map((d) => (
                          <tr key={d.stock_posicion_id ?? d.id}>
                            <td className="px-3 py-2">{d.producto_codigo} — {d.producto_descripcion} — {d.producto_presentacion}</td>
                            <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{d.lote ?? '-'}</td>
                            <td className="px-3 py-2 text-right">{d.cantidad_bultos}</td>
                            <td className="px-3 py-2 text-right">{Number(d.peso_adicional || 0).toFixed(2)}</td>
                            <td className="px-3 py-2 text-right">{Number(d.total_kg).toFixed(2)}</td>
                            <td className="px-3 py-2 text-gray-600 dark:text-gray-400">
                              {[d.almacen_nombre, d.carril_nombre, d.numero_nivel != null ? `N${d.numero_nivel}` : '', d.numero_posicion != null ? `P${d.numero_posicion}` : ''].filter(Boolean).join(' → ') || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              })()}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default Ingresos
