import { useState, useEffect, useMemo } from 'react'
import {
  ScrollText,
  Loader2,
  Info,
  Layers,
  BarChart3,
  Users,
  Clock,
  Package,
  TrendingUp,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import Modal from '../../components/Modal'
import PaginationBar from '../../components/PaginationBar'
import ExportDropdown from '../../components/ExportDropdown'
import { adminActividadApi } from '../../api/admin-actividad'
import { movimientosApi } from '../../api/movimientos'
import { despachosApi } from '../../api/despachos'
import { insumosApi } from '../../api/insumos'
import { usuariosApi } from '../../api/usuarios'
import { useConfig } from '../../contexts/ConfigContext'
import toast from 'react-hot-toast'

const moduloBadge = (modulo) => {
  const m = String(modulo || '')
  if (m === 'Almacén') return 'bg-emerald-100 dark:bg-emerald-900/35 text-emerald-900 dark:text-emerald-200'
  if (m === 'Despachos') return 'bg-sky-100 dark:bg-sky-900/35 text-sky-900 dark:text-sky-200'
  if (m === 'Insumos') return 'bg-violet-100 dark:bg-violet-900/35 text-violet-900 dark:text-violet-200'
  return 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200'
}

const origenLabel = (t) => {
  const x = { movimiento: 'Stock', despacho: 'Despacho', insumo_documento: 'Insumos', app_log: 'Sistema' }
  return x[t] || t || '—'
}

function HoraChart({ porHora }) {
  const map = useMemo(() => {
    const m = Array(24).fill(0)
    ;(porHora || []).forEach((r) => {
      const h = Number(r.hora)
      if (h >= 0 && h < 24) m[h] = Number(r.n) || 0
    })
    return m
  }, [porHora])
  const max = Math.max(1, ...map)
  return (
    <div className="flex items-end gap-0.5 h-24">
      {map.map((n, h) => (
        <div key={h} className="flex-1 min-w-0 flex flex-col items-center gap-0.5 group">
          <div
            className="w-full rounded-t bg-primary-500/80 dark:bg-primary-400/70 min-h-[2px] transition-all group-hover:bg-primary-600"
            style={{ height: `${(n / max) * 100}%` }}
            title={`${h}:00 — ${n} eventos`}
          />
          {h % 4 === 0 && <span className="text-[8px] text-gray-500">{h}</span>}
        </div>
      ))}
    </div>
  )
}

const RegistroActividad = () => {
  const { registrosPorPagina } = useConfig()
  const [loading, setLoading] = useState(true)
  const [loadingResumen, setLoadingResumen] = useState(true)
  const [usuarios, setUsuarios] = useState([])
  const [lista, setLista] = useState([])
  const [modulos, setModulos] = useState([])
  const [origenes, setOrigenes] = useState([])
  const [resumen, setResumen] = useState(null)
  const [panelAnalisisOpen, setPanelAnalisisOpen] = useState(true)

  const [filtroModulo, setFiltroModulo] = useState('')
  const [filtroOrigen, setFiltroOrigen] = useState('')
  const [filtroRol, setFiltroRol] = useState('')
  const [filtroQ, setFiltroQ] = useState('')
  const [filtroFechaDesde, setFiltroFechaDesde] = useState('')
  const [filtroFechaHasta, setFiltroFechaHasta] = useState('')
  const [filtroUsuario, setFiltroUsuario] = useState('')
  const [ordenFecha, setOrdenFecha] = useState('desc')
  const [totalRegistros, setTotalRegistros] = useState(0)
  const [offset, setOffset] = useState(0)

  const [detalleRow, setDetalleRow] = useState(null)
  const [detallePayload, setDetallePayload] = useState(null)
  const [detalleTipo, setDetalleTipo] = useState(null)
  const [loadingDetalle, setLoadingDetalle] = useState(false)

  useEffect(() => {
    usuariosApi.listar({ limit: 500 }).then((r) => setUsuarios(r.data?.data ?? r.data ?? [])).catch(() => toast.error('Error al cargar usuarios'))
  }, [])

  useEffect(() => {
    setOffset(0)
  }, [filtroModulo, filtroOrigen, filtroRol, filtroQ, filtroFechaDesde, filtroFechaHasta, filtroUsuario, ordenFecha])

  const baseFilterParams = useMemo(
    () => ({
      modulo: filtroModulo || undefined,
      origen_tabla: filtroOrigen || undefined,
      usuario_rol: filtroRol || undefined,
      q: filtroQ.trim() || undefined,
      fecha_desde: filtroFechaDesde || undefined,
      fecha_hasta: filtroFechaHasta || undefined,
      usuario_id: filtroUsuario || undefined,
      orden: ordenFecha,
    }),
    [filtroModulo, filtroOrigen, filtroRol, filtroQ, filtroFechaDesde, filtroFechaHasta, filtroUsuario, ordenFecha]
  )

  useEffect(() => {
    let cancelled = false
    const limit = registrosPorPagina || 50
    const listParams = { ...baseFilterParams, limit, offset: Number(offset) }
    setLoading(true)
    setLoadingResumen(true)
    Promise.all([adminActividadApi.listar(listParams), adminActividadApi.resumen(baseFilterParams)])
      .then(([listRes, resRes]) => {
        if (cancelled) return
        const data = listRes.data
        setLista(data?.data ?? [])
        setTotalRegistros(data?.total ?? 0)
        if (Array.isArray(data?.modulos)) setModulos(data.modulos)
        if (Array.isArray(data?.origenes)) setOrigenes(data.origenes)
        setResumen(resRes.data || null)
      })
      .catch(() => {
        if (!cancelled) {
          toast.error('Error al cargar el registro de actividad')
          setLista([])
          setTotalRegistros(0)
          setResumen(null)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
          setLoadingResumen(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [baseFilterParams, registrosPorPagina, offset])

  useEffect(() => {
    if (!detalleRow) {
      setDetallePayload(null)
      setDetalleTipo(null)
      return
    }
    const { origen_tabla, origen_id } = detalleRow
    const esRegistroApp =
      origen_tabla === 'app_log' || String(detalleRow.event_id || '').startsWith('log:')
    if (esRegistroApp) {
      setDetalleTipo('app_log')
      setDetallePayload(detalleRow)
      setLoadingDetalle(false)
      return
    }
    setDetalleTipo(origen_tabla)
    setLoadingDetalle(true)
    setDetallePayload(null)
    const p =
      origen_tabla === 'movimiento'
        ? movimientosApi.obtener(origen_id)
        : origen_tabla === 'despacho'
          ? despachosApi.obtener(origen_id)
          : origen_tabla === 'insumo_documento'
            ? insumosApi.documentoObtener(origen_id)
            : Promise.resolve({ data: detalleRow })
    p.then((r) => setDetallePayload(r.data))
      .catch(() => {
        toast.error('No se pudo cargar el detalle')
        setDetalleRow(null)
      })
      .finally(() => setLoadingDetalle(false))
  }, [detalleRow])

  const formatFecha = (fechaHora) => {
    if (!fechaHora) return '-'
    const d = new Date(fechaHora)
    return d.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'medium' })
  }

  const formatFechaLarga = (fechaHora) => {
    if (!fechaHora) return '-'
    const d = new Date(fechaHora)
    return d.toLocaleString('es-ES', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  const aplicarRangoDias = (dias) => {
    const hasta = new Date()
    const desde = new Date()
    desde.setDate(desde.getDate() - dias)
    setFiltroFechaDesde(desde.toISOString().slice(0, 10))
    setFiltroFechaHasta(hasta.toISOString().slice(0, 10))
  }

  const usuariosDistintos = resumen?.usuarios_distintos ?? resumen?.por_usuario?.length ?? 0

  return (
    <div className="min-w-0 max-w-full">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-5 sm:mb-6">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2 rounded-xl bg-primary-100 dark:bg-primary-900/40 shrink-0">
            <ScrollText className="w-7 h-7 sm:w-8 sm:h-8 text-primary-600 dark:text-primary-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-gray-500 dark:text-gray-400">Administración</p>
            <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white leading-tight">Centro de actividad</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-3xl">
              Auditoría operativa: quién hizo qué, cuándo (fecha y hora), con cantidades agregadas, productos involucrados y
              trazabilidad por módulo. Use el panel analítico y los filtros para acotar por usuario, rol, origen del evento o
              periodo.
            </p>
          </div>
        </div>
        <div className="w-full lg:w-auto shrink-0 min-h-[44px] lg:min-h-0 flex items-stretch lg:items-center [&_button]:min-h-[44px] lg:[&_button]:min-h-0">
          <ExportDropdown
            getExportConfig={() => {
              const listParams = { limit: 10000, offset: 0, ...baseFilterParams }
              return {
                title: 'Registro_actividad',
                filtersSummary:
                  [
                    filtroModulo && 'Módulo',
                    filtroOrigen && 'Origen',
                    filtroRol && 'Rol',
                    filtroQ && 'Búsqueda',
                    filtroFechaDesde && 'Desde',
                    filtroFechaHasta && 'Hasta',
                    filtroUsuario && 'Usuario',
                  ]
                    .filter(Boolean)
                    .join(', ') || 'Ninguno',
                columns: [
                  { key: 'fecha', label: 'Fecha y hora' },
                  { key: 'modulo', label: 'Módulo' },
                  { key: 'origen_tabla', label: 'Origen técnico' },
                  { key: 'area', label: 'Área' },
                  { key: 'tipo_evento', label: 'Tipo / evento' },
                  { key: 'usuario_nombre', label: 'Usuario' },
                  { key: 'usuario_rol', label: 'Rol' },
                  { key: 'usuario_email', label: 'Email' },
                  { key: 'referencia_resumen', label: 'Referencia' },
                  { key: 'lineas', label: 'Líneas' },
                  { key: 'total_bultos', label: 'Total bultos' },
                  { key: 'total_kg', label: 'Total kg' },
                  { key: 'productos_distintos', label: 'Productos dist.' },
                  { key: 'productos_codigos', label: 'Productos / ítems' },
                  { key: 'descripcion', label: 'Descripción' },
                ],
                fetchData: () =>
                  adminActividadApi.listar(listParams).then((r) => ({
                    data: (r.data?.data ?? []).map((row) => ({
                      ...row,
                      fecha: row.fecha ? String(row.fecha) : '',
                      origen_tabla: origenLabel(row.origen_tabla),
                    })),
                  })),
              }
            }}
          />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wide">
            <BarChart3 className="w-4 h-4" /> Eventos (filtro actual)
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1 tabular-nums">
            {loadingResumen ? '…' : resumen?.total_eventos ?? totalRegistros}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wide">
            <Users className="w-4 h-4" /> Usuarios con actividad
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1 tabular-nums">
            {loadingResumen ? '…' : usuariosDistintos}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wide">
            <Package className="w-4 h-4" /> Módulos activos
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1 tabular-nums">
            {loadingResumen ? '…' : resumen?.por_modulo?.length ?? 0}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wide">
            <TrendingUp className="w-4 h-4" /> Registros (página)
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1 tabular-nums">{lista.length}</p>
        </div>
      </div>

      {/* Panel analítico colapsable */}
      <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setPanelAnalisisOpen((o) => !o)}
          className="w-full min-h-[48px] flex items-center justify-between px-4 py-3 text-left text-sm font-semibold text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700/50"
        >
          <span className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary-600" />
            Análisis por módulo, usuario, día y hora
          </span>
          {panelAnalisisOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>
        {panelAnalisisOpen && (
          <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 grid grid-cols-1 xl:grid-cols-2 gap-6 pt-4">
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Por módulo</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {(resumen?.por_modulo || []).map((r) => (
                  <div key={r.modulo} className="flex items-center gap-2 text-sm">
                    <span className={`shrink-0 px-2 py-0.5 rounded text-xs font-medium ${moduloBadge(r.modulo)}`}>{r.modulo}</span>
                    <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden min-w-0">
                      <div
                        className="h-full bg-primary-500/70 rounded-full"
                        style={{
                          width: `${Math.min(100, (Number(r.n) / Math.max(1, resumen?.total_eventos || 1)) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="tabular-nums text-gray-700 dark:text-gray-300 w-10 text-right">{r.n}</span>
                  </div>
                ))}
                {!loadingResumen && !(resumen?.por_modulo || []).length && (
                  <p className="text-sm text-gray-500">Sin datos en el rango seleccionado.</p>
                )}
              </div>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Top usuarios (por cantidad de eventos)</h3>
              <div className="wms-table-scroll max-h-48">
                <table className="w-full min-w-[20rem] text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-200 dark:border-gray-600">
                      <th className="py-1 pr-2">Usuario</th>
                      <th className="py-1 pr-2">Rol</th>
                      <th className="py-1 text-right">Eventos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(resumen?.por_usuario || []).slice(0, 15).map((r) => (
                      <tr key={r.usuario_id} className="border-b border-gray-100 dark:border-gray-700/80">
                        <td className="py-1 pr-2 truncate max-w-[12rem]" title={r.usuario_nombre}>
                          {r.usuario_nombre}
                        </td>
                        <td className="py-1 pr-2 text-gray-500">{r.usuario_rol}</td>
                        <td className="py-1 text-right tabular-nums font-medium">{r.n}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Por rol</h3>
              <div className="flex flex-wrap gap-2">
                {(resumen?.por_rol || []).map((r) => (
                  <span
                    key={r.usuario_rol}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-700 text-sm"
                  >
                    <span className="font-medium">{r.usuario_rol}</span>
                    <span className="tabular-nums text-gray-600 dark:text-gray-400">{r.n}</span>
                  </span>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Distribución por hora del día (servidor)</h3>
              {loadingResumen ? (
                <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
              ) : (
                <HoraChart porHora={resumen?.por_hora_utc} />
              )}
            </div>
            <div className="xl:col-span-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Actividad por día</h3>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {(resumen?.por_dia || []).map((r) => (
                  <div
                    key={String(r.dia)}
                    className="px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-700 text-xs flex items-center gap-2"
                  >
                    <span className="font-mono">{r.dia ? String(r.dia).slice(0, 10) : ''}</span>
                    <span className="tabular-nums font-semibold">{r.n}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Filtros */}
      <div className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Filtros avanzados</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => aplicarRangoDias(1)} className="text-xs min-h-[36px] px-2.5 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600">
              Últimas 24 h
            </button>
            <button type="button" onClick={() => aplicarRangoDias(7)} className="text-xs min-h-[36px] px-2.5 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600">
              7 días
            </button>
            <button type="button" onClick={() => aplicarRangoDias(30)} className="text-xs min-h-[36px] px-2.5 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600">
              30 días
            </button>
            <button
              type="button"
              onClick={() => {
                setFiltroFechaDesde('')
                setFiltroFechaHasta('')
              }}
              className="text-xs min-h-[36px] px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600"
            >
              Quitar fechas
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Módulo</label>
            <select
              value={filtroModulo}
              onChange={(e) => setFiltroModulo(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm"
            >
              <option value="">Todos</option>
              {(modulos.length ? modulos : ['Almacén', 'Despachos', 'Insumos']).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Origen del registro</label>
            <select
              value={filtroOrigen}
              onChange={(e) => setFiltroOrigen(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm"
            >
              <option value="">Todos</option>
              {(origenes.length ? origenes : []).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Rol de usuario</label>
            <select
              value={filtroRol}
              onChange={(e) => setFiltroRol(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm"
            >
              <option value="">Todos</option>
              <option value="Admin">Admin</option>
              <option value="Usuario">Usuario</option>
              <option value="Visitante">Visitante</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Orden fecha</label>
            <select
              value={ordenFecha}
              onChange={(e) => setOrdenFecha(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm"
            >
              <option value="desc">Más recientes primero</option>
              <option value="asc">Más antiguos primero</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Búsqueda global</label>
            <input
              type="search"
              value={filtroQ}
              onChange={(e) => setFiltroQ(e.target.value)}
              placeholder="Texto, email, productos, referencia…"
              className="w-full min-h-[44px] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Fecha desde</label>
            <input
              type="date"
              value={filtroFechaDesde}
              onChange={(e) => setFiltroFechaDesde(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Fecha hasta</label>
            <input
              type="date"
              value={filtroFechaHasta}
              onChange={(e) => setFiltroFechaHasta(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm"
            />
          </div>
          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Usuario</label>
            <select
              value={filtroUsuario}
              onChange={(e) => setFiltroUsuario(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm"
            >
              <option value="">Todos</option>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre} ({u.email})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Tabla principal */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="wms-table-scroll">
          <table className="w-full min-w-[1400px] text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th className="px-2 py-2.5 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Fecha / hora</th>
                <th className="px-2 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Origen</th>
                <th className="px-2 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Módulo</th>
                <th className="px-2 py-2.5 text-left text-xs font-medium text-gray-500 uppercase hidden xl:table-cell">Área</th>
                <th className="px-2 py-2.5 text-left text-xs font-medium text-gray-500 uppercase min-w-[12rem]">Evento</th>
                <th className="px-2 py-2.5 text-left text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">Referencia</th>
                <th className="px-2 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Usuario</th>
                <th className="px-2 py-2.5 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Rol</th>
                <th className="px-2 py-2.5 text-left text-xs font-medium text-gray-500 uppercase hidden 2xl:table-cell max-w-[10rem]">Email</th>
                <th className="px-2 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Lín.</th>
                <th className="px-2 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Bultos</th>
                <th className="px-2 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Kg</th>
                <th className="px-2 py-2.5 text-right text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">Prod.</th>
                <th className="px-2 py-2.5 text-left text-xs font-medium text-gray-500 uppercase hidden xl:table-cell min-w-[14rem]">Productos / ítems</th>
                <th className="px-2 py-2.5 text-center text-xs font-medium text-gray-500 uppercase w-24">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {loading ? (
                <tr>
                  <td colSpan={15} className="px-4 py-12 text-center">
                    <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto" />
                  </td>
                </tr>
              ) : lista.length === 0 ? (
                <tr>
                  <td colSpan={15} className="px-4 py-12 text-center text-gray-500">
                    No hay eventos que coincidan con los filtros.
                  </td>
                </tr>
              ) : (
                lista.map((row) => (
                  <tr key={row.event_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 align-top">
                    <td className="px-2 py-2 whitespace-nowrap">
                      <span className="text-gray-900 dark:text-white font-medium">{formatFecha(row.fecha)}</span>
                      <span className="block text-[10px] text-gray-500 font-mono truncate max-w-[9rem]" title={formatFechaLarga(row.fecha)}>
                        {formatFechaLarga(row.fecha)}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-xs text-gray-600 dark:text-gray-400">{origenLabel(row.origen_tabla)}</td>
                    <td className="px-2 py-2">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${moduloBadge(row.modulo)}`}>{row.modulo}</span>
                    </td>
                    <td className="px-2 py-2 text-gray-600 dark:text-gray-300 hidden xl:table-cell max-w-[8rem] truncate" title={row.area}>
                      {row.area || '—'}
                    </td>
                    <td className="px-2 py-2">
                      <div className="line-clamp-3 text-gray-800 dark:text-gray-200" title={row.tipo_evento}>
                        {row.tipo_evento || '—'}
                      </div>
                      <div className="text-[10px] text-gray-500 line-clamp-2 mt-0.5" title={row.descripcion}>
                        {row.descripcion || ''}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-gray-600 dark:text-gray-400 hidden lg:table-cell max-w-[10rem] truncate" title={row.referencia_resumen}>
                      {row.referencia_resumen || '—'}
                    </td>
                    <td className="px-2 py-2 font-medium text-gray-800 dark:text-gray-200">{row.usuario_nombre || '—'}</td>
                    <td className="px-2 py-2 text-gray-600 hidden md:table-cell">{row.usuario_rol || '—'}</td>
                    <td className="px-2 py-2 text-gray-500 hidden 2xl:table-cell truncate max-w-[10rem]" title={row.usuario_email}>
                      {row.usuario_email || '—'}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{row.lineas ?? 0}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">
                      {row.total_bultos != null ? Number(row.total_bultos).toFixed(2) : '—'}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">
                      {row.total_kg != null ? Number(row.total_kg).toFixed(2) : '—'}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums hidden lg:table-cell">{row.productos_distintos ?? '—'}</td>
                    <td className="px-2 py-2 text-xs text-gray-600 dark:text-gray-400 hidden xl:table-cell max-w-[18rem] truncate" title={row.productos_codigos}>
                      {row.productos_codigos || '—'}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => setDetalleRow(row)}
                        className="min-h-[40px] min-w-[40px] sm:min-w-0 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-600 hover:bg-primary-100 dark:hover:bg-primary-900/30"
                      >
                        <Info className="w-3.5 h-3.5" />
                        Ver
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

      <Modal isOpen={!!detalleRow} onClose={() => setDetalleRow(null)} title="Detalle del evento" size="xl">
        {detalleRow && (
          <div className="border-b border-gray-200 dark:border-gray-700 pb-3 mb-4 text-sm space-y-1">
            <p className="font-mono text-xs text-gray-500 break-all">{detalleRow.event_id}</p>
            <p>
              <span className="text-gray-500">Origen:</span> {origenLabel(detalleRow.origen_tabla)} ·{' '}
              <span className="text-gray-500">Módulo:</span> {detalleRow.modulo}
            </p>
            <p className="text-gray-700 dark:text-gray-300">
              <span className="text-gray-500">Usuario:</span> {detalleRow.usuario_nombre} ({detalleRow.usuario_rol}) · {detalleRow.usuario_email}
            </p>
            <p>
              <span className="text-gray-500">Momento:</span> {formatFechaLarga(detalleRow.fecha)}
            </p>
            {detalleRow.metadata && (
              <details className="mt-2">
                <summary className="cursor-pointer text-primary-600 dark:text-primary-400 text-sm font-medium">Metadatos técnicos (JSON)</summary>
                <pre className="mt-2 text-xs bg-gray-100 dark:bg-gray-900 p-3 rounded-lg overflow-auto max-h-40">
                  {JSON.stringify(detalleRow.metadata, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}
        {loadingDetalle ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-10 h-10 text-primary-600 animate-spin" />
          </div>
        ) : detallePayload && detalleTipo === 'movimiento' ? (
          <DetalleMovimiento detalle={detallePayload} formatFecha={formatFecha} />
        ) : detallePayload && detalleTipo === 'despacho' ? (
          <DetalleDespacho d={detallePayload} formatFecha={formatFecha} />
        ) : detallePayload && detalleTipo === 'insumo_documento' ? (
          <DetalleInsumoDoc d={detallePayload} />
        ) : detallePayload && detalleTipo === 'app_log' ? (
          <DetalleAppLog row={detallePayload} formatFechaLarga={formatFechaLarga} />
        ) : detalleRow ? (
          <p className="text-gray-600 dark:text-gray-400">{detalleRow.descripcion || 'Sin descripción adicional.'}</p>
        ) : null}
      </Modal>
    </div>
  )
}

const APP_LOG_META_SKIP = new Set(['fuente', 'registro_id'])
const APP_LOG_ARRAY_KEYS = ['lineas', 'detalles', 'items', 'productos', 'insumos', 'filas', 'movimientos', 'registros']

function normalizeAppLogMeta(raw) {
  if (raw == null) return {}
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw)
      return typeof p === 'object' && p !== null && !Array.isArray(p) ? p : { valor_parseado: p }
    } catch {
      return { texto_libre: raw }
    }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw
  return { valor: raw }
}

function fmtAppLogVal(v) {
  if (v == null) return '—'
  if (typeof v === 'boolean') return v ? 'Sí' : 'No'
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v)
    } catch {
      return String(v)
    }
  }
  return String(v)
}

function labelMetaCampo(k) {
  const map = {
    producto_codigo: 'Código producto',
    codigo: 'Código',
    insumo_codigo: 'Código insumo',
    producto_nombre: 'Nombre',
    nombre: 'Nombre',
    insumo_nombre: 'Insumo',
    producto_descripcion: 'Descripción',
    descripcion: 'Descripción',
    especie_nombre: 'Especie',
    lote: 'Lote',
    proveedor: 'Proveedor',
    guia_remision: 'Guía remisión',
    numero_guia: 'Nº guía',
    referencia: 'Referencia',
    cantidad: 'Cantidad',
    cantidad_bultos: 'Bultos',
    total_kg: 'Kg',
    ubicacion: 'Ubicación',
    tipo: 'Tipo',
    cliente_nombre: 'Cliente',
    origen_id: 'ID origen',
    origen_tabla: 'Tabla origen',
  }
  return map[k] || k.replace(/_/g, ' ')
}

function CeldaProductoMeta({ row }) {
  if (!row || typeof row !== 'object') return <span className="text-gray-500">—</span>
  const cod =
    row.producto_codigo ?? row.codigo ?? row.insumo_codigo ?? row.code ?? row.sku ?? ''
  const titulo =
    row.producto_nombre ?? row.nombre ?? row.insumo_nombre ?? row.producto ?? row.denominacion ?? ''
  const desc =
    row.producto_descripcion ||
    row.descripcion ||
    (typeof row.observaciones === 'string' ? row.observaciones : '') ||
    ''
  const has = cod || titulo || desc
  if (!has) return <span className="text-gray-500">—</span>
  return (
    <div className="min-w-[160px] max-w-md">
      {cod ? <span className="font-medium text-gray-900 dark:text-white">{cod}</span> : null}
      {titulo ? <div className="text-xs text-gray-700 dark:text-gray-300 mt-0.5">{titulo}</div> : null}
      {desc ? <div className="text-xs italic text-gray-600 dark:text-gray-400 mt-0.5">{desc}</div> : null}
    </div>
  )
}

function pickArrayBlockFromMeta(meta) {
  if (!meta || typeof meta !== 'object') return null
  for (const key of APP_LOG_ARRAY_KEYS) {
    const arr = meta[key]
    if (
      Array.isArray(arr) &&
      arr.length > 0 &&
      typeof arr[0] === 'object' &&
      arr[0] !== null &&
      !Array.isArray(arr[0])
    ) {
      return { key, rows: arr }
    }
  }
  return null
}

function ordenColumnasTabla(rows) {
  const first = rows[0] || {}
  const keys = Object.keys(first)
  const priority = [
    'producto_codigo',
    'codigo',
    'insumo_codigo',
    'sku',
    'producto_nombre',
    'nombre',
    'insumo_nombre',
    'producto',
    'producto_descripcion',
    'descripcion',
    'especie_nombre',
    'especie',
    'lote',
    'lote_codigo',
    'proveedor',
    'proveedor_nombre',
    'cliente_nombre',
    'cantidad',
    'cantidad_bultos',
    'bultos',
    'total_kg',
    'kg',
    'ubicacion',
    'tipo',
    'tipo_linea',
    'referencia',
  ]
  const out = []
  const seen = new Set()
  for (const k of priority) {
    if (keys.includes(k) && !seen.has(k)) {
      seen.add(k)
      out.push(k)
    }
  }
  for (const k of keys.sort()) {
    if (!seen.has(k)) {
      seen.add(k)
      out.push(k)
    }
  }
  return out.slice(0, 14)
}

function esColumnaProducto(k) {
  return (
    k === 'producto_codigo' ||
    k === 'codigo' ||
    k === 'insumo_codigo' ||
    k === 'sku' ||
    k === 'producto_nombre' ||
    k === 'nombre' ||
    k === 'insumo_nombre' ||
    k === 'producto' ||
    k === 'producto_descripcion' ||
    k === 'descripcion'
  )
}

function GrupoMetaPlano({ meta }) {
  const cod = meta.producto_codigo ?? meta.codigo ?? meta.insumo_codigo
  const nom = meta.producto_nombre ?? meta.nombre ?? meta.insumo_nombre
  const desc = meta.producto_descripcion ?? meta.descripcion
  if (!cod && !nom && !desc) return null
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50/80 dark:bg-slate-900/40 px-3 py-2">
      <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Producto / ítem</p>
      <CeldaProductoMeta row={meta} />
    </div>
  )
}

function valorCeldaAudit(v) {
  if (v == null) return <span className="text-gray-500">—</span>
  if (typeof v === 'object' && !Array.isArray(v)) {
    if (v.producto_codigo || v.codigo || v.insumo_codigo || v.nombre || v.producto_nombre || v.insumo_nombre) {
      return <CeldaProductoMeta row={v} />
    }
  }
  return <span className="whitespace-pre-wrap break-words">{fmtAppLogVal(v)}</span>
}

function SnapshotAntesDespues({ antes, despues }) {
  const a = antes && typeof antes === 'object' && !Array.isArray(antes) ? antes : {}
  const d = despues && typeof despues === 'object' && !Array.isArray(despues) ? despues : {}
  const keys = [...new Set([...Object.keys(a), ...Object.keys(d)])].filter((k) => !APP_LOG_META_SKIP.has(k))
  if (keys.length === 0) return null
  return (
    <div>
      <p className="text-xs font-medium text-amber-800 dark:text-amber-200 mb-2">Antes / después</p>
      <div className="wms-table-scroll rounded-lg border border-amber-200 dark:border-amber-800">
        <table className="w-full text-xs min-w-[480px]">
          <thead className="bg-amber-50 dark:bg-amber-950/40">
            <tr>
              <th className="px-2 py-2 text-left">Campo</th>
              <th className="px-2 py-2 text-left">Antes</th>
              <th className="px-2 py-2 text-left">Después</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-amber-100 dark:divide-amber-900">
            {keys.map((k) => (
              <tr key={k}>
                <td className="px-2 py-1.5 font-medium text-gray-700 dark:text-gray-300">{labelMetaCampo(k)}</td>
                <td className="px-2 py-1.5 text-gray-600 dark:text-gray-400">{valorCeldaAudit(a[k])}</td>
                <td className="px-2 py-1.5 text-gray-800 dark:text-gray-200">{valorCeldaAudit(d[k])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TablaCambiosMeta({ cambios }) {
  if (!cambios || typeof cambios !== 'object' || Array.isArray(cambios)) return null
  const entries = Object.entries(cambios).filter(([k]) => !APP_LOG_META_SKIP.has(k))
  if (entries.length === 0) return null
  return (
    <div>
      <p className="text-xs font-medium text-violet-800 dark:text-violet-200 mb-2">Cambios por campo</p>
      <div className="wms-table-scroll rounded-lg border border-violet-200 dark:border-violet-800">
        <table className="w-full text-xs min-w-[400px]">
          <thead className="bg-violet-50 dark:bg-violet-950/40">
            <tr>
              <th className="px-2 py-2 text-left">Campo</th>
              <th className="px-2 py-2 text-left">Antes</th>
              <th className="px-2 py-2 text-left">Después</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-violet-100 dark:divide-violet-900">
            {entries.map(([k, v]) => {
              let antesV
              let despuesV
              if (v && typeof v === 'object' && !Array.isArray(v)) {
                antesV = v.antes ?? v.anterior ?? v.before ?? v.previo
                despuesV = v.despues ?? v.nuevo ?? v.after ?? v.después
              } else {
                antesV = undefined
                despuesV = v
              }
              return (
                <tr key={k}>
                  <td className="px-2 py-1.5 font-medium">{labelMetaCampo(k)}</td>
                  <td className="px-2 py-1.5">{valorCeldaAudit(antesV)}</td>
                  <td className="px-2 py-1.5">{valorCeldaAudit(despuesV)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TablaLineasMeta({ title, rows }) {
  if (!Array.isArray(rows) || rows.length === 0) return null
  const colsAll = ordenColumnasTabla(rows)
  const tieneProd = colsAll.some(esColumnaProducto)
  const otrasCols = colsAll.filter((c) => !esColumnaProducto(c))
  return (
    <div>
      <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">{title}</p>
      <div className="wms-table-scroll rounded-lg border border-gray-200 dark:border-gray-600">
        <table className="w-full text-xs min-w-[520px]">
          <thead className="bg-gray-50 dark:bg-gray-900/50">
            <tr>
              {tieneProd && (
                <th className="px-2 py-2 text-left min-w-[200px]">Producto / insumo</th>
              )}
              {otrasCols.map((c) => (
                <th key={c} className="px-2 py-2 text-left">
                  {labelMetaCampo(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {rows.map((row, idx) => (
              <tr key={row.id ?? idx}>
                {tieneProd && (
                  <td className="px-2 py-1.5 align-top">
                    <CeldaProductoMeta row={row} />
                  </td>
                )}
                {otrasCols.map((c) => (
                  <td key={c} className="px-2 py-1.5 align-top whitespace-pre-wrap break-words">
                    {fmtAppLogVal(row[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RestoMetaPlano({ meta, omitKeys }) {
  const omit = new Set([...(omitKeys || []), ...APP_LOG_META_SKIP])
  const pairs = Object.entries(meta).filter(([k, v]) => !omit.has(k) && v !== undefined && v !== null && v !== '')
  if (pairs.length === 0) return null
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
      {pairs.map(([k, v]) => (
        <div key={k} className="rounded border border-gray-100 dark:border-gray-700 px-2 py-1.5">
          <span className="text-gray-500 dark:text-gray-400 block">{labelMetaCampo(k)}</span>
          <div className="text-gray-900 dark:text-gray-100 mt-0.5">
            {typeof v === 'object' && v !== null && !Array.isArray(v) ? valorCeldaAudit(v) : fmtAppLogVal(v)}
          </div>
        </div>
      ))}
    </div>
  )
}

function DetalleAppLog({ row, formatFechaLarga }) {
  const meta = normalizeAppLogMeta(row.metadata)
  const arrayBlock = pickArrayBlockFromMeta(meta)
  const antesObj = meta.antes && typeof meta.antes === 'object' && !Array.isArray(meta.antes) ? meta.antes : null
  const despuesObj = meta.despues && typeof meta.despues === 'object' && !Array.isArray(meta.despues) ? meta.despues : null
  const omitRest = new Set(['antes', 'despues', 'cambios', ...(arrayBlock ? [arrayBlock.key] : [])])
  const tienePlanoProducto =
    !arrayBlock &&
    (meta.producto_codigo || meta.codigo || meta.insumo_codigo || meta.producto_nombre || meta.nombre)

  return (
    <div className="space-y-4 text-sm max-h-[70vh] overflow-y-auto pr-1">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="text-xs text-gray-500">Momento</span>
          <p>{row.fecha ? formatFechaLarga(row.fecha) : '—'}</p>
        </div>
        <div>
          <span className="text-xs text-gray-500">Tipo de evento</span>
          <p className="font-medium">{row.tipo_evento || '—'}</p>
        </div>
        <div>
          <span className="text-xs text-gray-500">Módulo / área</span>
          <p>
            {row.modulo || '—'}
            {row.area ? ` · ${row.area}` : ''}
          </p>
        </div>
        <div>
          <span className="text-xs text-gray-500">Referencia</span>
          <p>{row.referencia_resumen && row.referencia_resumen !== '-' ? row.referencia_resumen : '—'}</p>
        </div>
        {row.origen_tabla && row.origen_tabla !== 'app_log' && (
          <div className="col-span-2">
            <span className="text-xs text-gray-500">Origen en aplicación</span>
            <p className="font-mono text-xs">
              {row.origen_tabla} {row.origen_id ? `· ${row.origen_id}` : ''}
            </p>
          </div>
        )}
      </div>
      <div>
        <span className="text-xs text-gray-500 block mb-1">Descripción</span>
        <p className="whitespace-pre-wrap text-gray-800 dark:text-gray-200 border-l-2 border-primary-400 pl-3">
          {row.descripcion || '—'}
        </p>
      </div>
      {tienePlanoProducto && <GrupoMetaPlano meta={meta} />}
      {arrayBlock && <TablaLineasMeta title={`Detalle (${arrayBlock.key})`} rows={arrayBlock.rows} />}
      {antesObj && despuesObj && <SnapshotAntesDespues antes={antesObj} despues={despuesObj} />}
      {meta.cambios && <TablaCambiosMeta cambios={meta.cambios} />}
      <RestoMetaPlano meta={meta} omitKeys={[...omitRest]} />
      <details className="text-xs">
        <summary className="cursor-pointer text-primary-600 dark:text-primary-400 font-medium">Metadatos completos (JSON)</summary>
        <pre className="mt-2 bg-gray-100 dark:bg-gray-900 p-3 rounded-lg overflow-auto max-h-48 text-[11px]">
          {JSON.stringify(meta, null, 2)}
        </pre>
      </details>
    </div>
  )
}

function ubicacionMovLinea(x) {
  if (!x?.almacen_nombre) return '—'
  return `${x.almacen_nombre} → ${x.carril_nombre} → N${x.numero_nivel} → P${x.numero_posicion}`
}


function DetalleMovimiento({ detalle, formatFecha }) {
  const esIngreso = detalle.tipo_movimiento === 'Ingreso'
  const filas = detalle.detalles || []
  const hasTipoLinea = filas.some((r) => r.tipo_linea)
  const fmtFechaCorta = (v) => {
    if (!v) return '—'
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }
  return (
    <div className="space-y-5 overflow-y-auto max-h-[70vh] text-sm">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <span className="text-gray-500 dark:text-gray-400 block text-xs font-medium">Fecha</span>
          <span className="text-gray-900 dark:text-white">{formatFecha(detalle.fecha_hora)}</span>
        </div>
        <div>
          <span className="text-gray-500 dark:text-gray-400 block text-xs font-medium">Tipo</span>
          <span>{detalle.tipo_movimiento}</span>
        </div>
        <div>
          <span className="text-gray-500 dark:text-gray-400 block text-xs font-medium">Usuario</span>
          <span>{detalle.usuario_nombre}</span>
        </div>
        {detalle.numero_guia && (
          <div>
            <span className="text-gray-500 dark:text-gray-400 block text-xs font-medium">Nº guía (mov.)</span>
            <span>{detalle.numero_guia}</span>
          </div>
        )}
        {(detalle.cliente_destino || detalle.cliente_origen_nombre) && (
          <div className="col-span-2 grid grid-cols-2 gap-2">
            {detalle.cliente_destino && (
              <div>
                <span className="text-gray-500 dark:text-gray-400 block text-xs font-medium">Cliente destino</span>
                <span>{detalle.cliente_destino}</span>
              </div>
            )}
            {detalle.cliente_origen_nombre && (
              <div>
                <span className="text-gray-500 dark:text-gray-400 block text-xs font-medium">Cliente origen</span>
                <span>{detalle.cliente_origen_nombre}</span>
              </div>
            )}
          </div>
        )}
        <div className="col-span-2">
          <span className="text-gray-500 dark:text-gray-400 block text-xs font-medium">Motivo</span>
          <p className="whitespace-pre-wrap break-words">{detalle.motivo || '-'}</p>
        </div>
      </div>
      {esIngreso && (
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/30 px-3 py-2 space-y-1 text-xs">
          <p className="font-medium text-emerald-900 dark:text-emerald-200">Contexto del ingreso</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div>
              <span className="text-gray-500 dark:text-gray-400">Especie</span>
              <p className="text-gray-900 dark:text-gray-100">{detalle.especie_ingreso || '—'}</p>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Cliente (producto)</span>
              <p className="text-gray-900 dark:text-gray-100">{detalle.cliente_ingreso || '—'}</p>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Proveedor (recepción)</span>
              <p className="text-gray-900 dark:text-gray-100">{detalle.proveedor_recepcion || '—'}</p>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Guía recepción</span>
              <p className="text-gray-900 dark:text-gray-100">{detalle.guia_recepcion || '—'}</p>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Fecha recepción</span>
              <p className="text-gray-900 dark:text-gray-100">{fmtFechaCorta(detalle.fecha_recepcion)}</p>
            </div>
          </div>
        </div>
      )}
      <div className="wms-table-scroll rounded-lg border border-gray-200 dark:border-gray-600">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-gray-50 dark:bg-gray-900/50">
            <tr>
              {hasTipoLinea && (
                <th className="px-2 py-2 text-left text-xs whitespace-nowrap">Línea</th>
              )}
              <th className="px-2 py-2 text-left text-xs min-w-[200px]">Producto</th>
              <th className="px-2 py-2 text-left text-xs">Especie</th>
              <th className="px-2 py-2 text-left text-xs">Lote</th>
              <th className="px-2 py-2 text-left text-xs">Ref. stock</th>
              <th className="px-2 py-2 text-left text-xs">Proveedor / guía</th>
              <th className="px-2 py-2 text-left text-xs min-w-[160px]">Ubicación</th>
              <th className="px-2 py-2 text-right text-xs">Bultos</th>
              <th className="px-2 py-2 text-right text-xs">Kg</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {filas.map((x) => (
              <tr key={x.id}>
                {hasTipoLinea && (
                  <td className="px-2 py-1.5 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">{x.tipo_linea || '—'}</td>
                )}
                <td className="px-2 py-1.5 align-top">
                  <span className="font-medium text-gray-900 dark:text-white">{x.producto_codigo || '—'}</span>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 space-y-0.5">
                    {x.producto_nombre && <div>{x.producto_nombre}</div>}
                    {x.producto_descripcion && <div className="italic">{x.producto_descripcion}</div>}
                  </div>
                </td>
                <td className="px-2 py-1.5 align-top text-xs">{x.especie_nombre ?? '—'}</td>
                <td className="px-2 py-1.5 align-top font-mono text-xs">{x.lote ?? '—'}</td>
                <td className="px-2 py-1.5 align-top text-xs">
                  <div>{x.stock_referencia ?? '—'}</div>
                  {x.stock_fecha_ingreso && (
                    <div className="text-gray-500">{fmtFechaCorta(x.stock_fecha_ingreso)}</div>
                  )}
                </td>
                <td className="px-2 py-1.5 align-top text-xs">
                  <div>{x.recepcion_proveedor ?? '—'}</div>
                  {x.recepcion_guia && <div className="text-gray-500">GR: {x.recepcion_guia}</div>}
                </td>
                <td className="px-2 py-1.5 align-top text-xs">{ubicacionMovLinea(x)}</td>
                <td className="px-2 py-1.5 text-right">{x.cantidad_bultos}</td>
                <td className="px-2 py-1.5 text-right">{Number(x.total_kg || 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DetalleDespacho({ d, formatFecha }) {
  const lineas = Array.isArray(d.lineas) ? d.lineas : []
  return (
    <div className="space-y-4 text-sm max-h-[70vh] overflow-y-auto">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="text-xs text-gray-500">Estado</span>
          <p>{d.estado}</p>
        </div>
        <div>
          <span className="text-xs text-gray-500">Tipo salida</span>
          <p>{d.tipo_salida}</p>
        </div>
        <div>
          <span className="text-xs text-gray-500">Cliente destino</span>
          <p>{d.cliente_destino || '—'}</p>
        </div>
        <div>
          <span className="text-xs text-gray-500">Guía</span>
          <p>{d.guia_salida || '—'}</p>
        </div>
        {d.cliente_origen_nombre && (
          <div>
            <span className="text-xs text-gray-500">Cliente origen</span>
            <p>{d.cliente_origen_nombre}</p>
          </div>
        )}
        <div>
          <span className="text-xs text-gray-500">Usuario</span>
          <p>{d.usuario_nombre || '—'}</p>
        </div>
        <div className="col-span-2">
          <span className="text-xs text-gray-500">Observaciones</span>
          <p className="whitespace-pre-wrap">{d.observaciones || '—'}</p>
        </div>
        <div>
          <span className="text-xs text-gray-500">Actualizado</span>
          <p>{formatFecha(d.updated_at || d.created_at)}</p>
        </div>
        {(d.total_bultos_despacho != null || d.total_kg_despacho != null) && (
          <div className="col-span-2 flex flex-wrap gap-4 text-xs">
            {d.total_bultos_despacho != null && (
              <span>
                <span className="text-gray-500">Total bultos: </span>
                {Number(d.total_bultos_despacho).toLocaleString('es-PE')}
              </span>
            )}
            {d.total_kg_despacho != null && (
              <span>
                <span className="text-gray-500">Total kg: </span>
                {Number(d.total_kg_despacho).toFixed(2)}
              </span>
            )}
          </div>
        )}
      </div>
      {lineas.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Productos del despacho</p>
          <div className="wms-table-scroll rounded-lg border border-gray-200 dark:border-gray-600">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-2 py-2 text-left text-xs min-w-[200px]">Producto</th>
                  <th className="px-2 py-2 text-left text-xs">Lote</th>
                  <th className="px-2 py-2 text-left text-xs min-w-[180px]">Ubicación</th>
                  <th className="px-2 py-2 text-right text-xs">Bultos</th>
                  <th className="px-2 py-2 text-right text-xs">Kg</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {lineas.map((ln) => (
                  <tr key={ln.id}>
                    <td className="px-2 py-1.5 align-top">
                      <span className="font-medium">{ln.producto_codigo || '—'}</span>
                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 space-y-0.5">
                        {ln.producto_nombre && <div>{ln.producto_nombre}</div>}
                        {ln.producto_descripcion && <div className="italic">{ln.producto_descripcion}</div>}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 align-top font-mono text-xs">{ln.lote || '—'}</td>
                    <td className="px-2 py-1.5 align-top text-xs">{ln.ubicacion || '—'}</td>
                    <td className="px-2 py-1.5 text-right">{ln.cantidad_bultos}</td>
                    <td className="px-2 py-1.5 text-right">{Number(ln.total_kg || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function DetalleInsumoDoc({ d }) {
  const lineas = Array.isArray(d.lineas) ? d.lineas : []
  return (
    <div className="space-y-4 text-sm max-h-[70vh] overflow-y-auto">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="text-xs text-gray-500">Tipo documento</span>
          <p className="font-medium">{d.tipo}</p>
        </div>
        <div>
          <span className="text-xs text-gray-500">Fecha movimiento</span>
          <p>{d.fecha_movimiento || '—'}</p>
        </div>
        <div>
          <span className="text-xs text-gray-500">Referencia</span>
          <p>{d.referencia || '—'}</p>
        </div>
        <div>
          <span className="text-xs text-gray-500">Usuario</span>
          <p>{d.usuario_nombre || '—'}</p>
        </div>
        {d.lote_codigo && (
          <div>
            <span className="text-xs text-gray-500">Lote producción</span>
            <p className="font-mono text-xs">{d.lote_codigo}</p>
          </div>
        )}
        {d.ingreso_origen && (
          <div>
            <span className="text-xs text-gray-500">Origen ingreso</span>
            <p>{d.ingreso_origen}</p>
          </div>
        )}
        {d.proveedor_nombre && (
          <div className="col-span-2">
            <span className="text-xs text-gray-500">Proveedor insumos</span>
            <p>{d.proveedor_nombre}</p>
          </div>
        )}
        <div className="col-span-2">
          <span className="text-xs text-gray-500">Observaciones</span>
          <p className="whitespace-pre-wrap">{d.observaciones || '—'}</p>
        </div>
      </div>
      {lineas.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Insumos</p>
          <div className="wms-table-scroll rounded-lg border border-gray-200 dark:border-gray-600">
            <table className="w-full text-sm min-w-[520px]">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-2 py-2 text-left text-xs min-w-[220px]">Insumo</th>
                  <th className="px-2 py-2 text-left text-xs">Tipo línea</th>
                  <th className="px-2 py-2 text-right text-xs">Cantidad</th>
                  <th className="px-2 py-2 text-left text-xs">Und.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {lineas.map((ln) => (
                  <tr key={ln.id}>
                    <td className="px-2 py-1.5 align-top">
                      <span className="font-mono text-xs font-medium">{ln.insumo_codigo || '—'}</span>
                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{ln.insumo_nombre || '—'}</div>
                    </td>
                    <td className="px-2 py-1.5 text-xs">{ln.tipo || '—'}</td>
                    <td className="px-2 py-1.5 text-right">{ln.cantidad != null ? Number(ln.cantidad).toLocaleString('es-PE', { maximumFractionDigits: 4 }) : '—'}</td>
                    <td className="px-2 py-1.5 text-xs">{ln.insumo_unidad || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default RegistroActividad
