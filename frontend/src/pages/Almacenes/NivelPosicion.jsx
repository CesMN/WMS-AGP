import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, Grid3X3, Lock, Move, Truck } from 'lucide-react'
import { almacenesApi } from '../../api/almacenes'
import { despachosApi } from '../../api/despachos'
import { usePosicionEnTransito } from '../../contexts/PosicionEnTransitoContext'
import Modal from '../../components/Modal'
import toast from 'react-hot-toast'

const ESTADO_COLORS = {
  Disponible: 'bg-green-500 dark:bg-green-600 border-green-600 dark:border-green-500',
  Ocupado: 'bg-red-500 dark:bg-red-600 border-red-600 dark:border-red-500',
  Mix: 'bg-amber-500 dark:bg-amber-600 border-amber-600 dark:border-amber-500',
  Bloqueado: 'bg-slate-500 dark:bg-slate-600 border-slate-600 dark:border-slate-500',
}

const NivelPosicion = () => {
  const { almacenId, carrilId } = useParams()
  const navigate = useNavigate()
  const [almacenNombre, setAlmacenNombre] = useState('')
  const [carrilNombre, setCarrilNombre] = useState('')
  const [numeroCarril, setNumeroCarril] = useState(1)
  const [matriz, setMatriz] = useState([])
  const [resumen, setResumen] = useState({ espacios_totales: 0, espacios_ocupados: 0, espacios_libres: 0, porcentaje_ocupacion: 0 })
  const [loading, setLoading] = useState(true)
  const [modoMover, setModoMover] = useState(false)
  const [movingTodo, setMovingTodo] = useState(false)
  const [modalDespacho, setModalDespacho] = useState({ open: false, posicionId: null })
  const [despachosRegistrados, setDespachosRegistrados] = useState([])
  const [despachoSeleccionado, setDespachoSeleccionado] = useState('')
  const [agregandoADespacho, setAgregandoADespacho] = useState(false)
  const [productosRequeridosDespacho, setProductosRequeridosDespacho] = useState({ activa: false, codigos: new Set(), ordenProduccion: '' })
  const [resumenAgregarPosicion, setResumenAgregarPosicion] = useState({ total: 0, requeridos: 0, omitidos: 0, codigosOmitidos: [] })
  const { enTransito, setEnTransito, clearTransito } = usePosicionEnTransito()
  const [almacenesDrawer, setAlmacenesDrawer] = useState([])
  const [carrilesPorAlmacen, setCarrilesPorAlmacen] = useState({})
  const [almacenesExpandidos, setAlmacenesExpandidos] = useState(new Set())
  const [carrilesExpandidos, setCarrilesExpandidos] = useState(new Set())
  const [matrizPorCarril, setMatrizPorCarril] = useState({})
  const [moverAquiLoading, setMoverAquiLoading] = useState(null)
  const [panelDestinoAbierto, setPanelDestinoAbierto] = useState(true)

  const idsEnDespacho = new Set(
    despachosRegistrados.flatMap((d) =>
      (d?.productos || [])
        .map((p) => p?.stock_posicion_id)
        .filter(Boolean)
    )
  )
  const bultosEnDespachoPorStock = despachosRegistrados
    .flatMap((d) => (d?.productos || []))
    .filter((p) => p?.stock_posicion_id)
    .reduce((acc, p) => {
      const k = p.stock_posicion_id
      acc.set(k, (acc.get(k) || 0) + (Number(p.cantidad_bultos) || 0))
      return acc
    }, new Map())

  useEffect(() => {
    if (!almacenId || !carrilId) return
    cargaDatos()
  }, [almacenId, carrilId])

  const cargaDatos = async () => {
    try {
      setLoading(true)
      const res = await almacenesApi.nivelesPosiciones(almacenId, carrilId)
      const data = res?.data ?? {}
      setAlmacenNombre(data.almacen?.nombre || 'Almacén')
      setCarrilNombre(data.carril?.nombre || 'Carril')
      setNumeroCarril(data.carril?.numero_carril ?? 1)
      const matrizSegura = Array.isArray(data.matriz) ? data.matriz : []
      setMatriz(matrizSegura)
      setResumen(data.resumen || { espacios_totales: 0, espacios_ocupados: 0, espacios_libres: 0, porcentaje_ocupacion: 0 })
    } catch (e) {
      toast.error('Error al cargar niveles y posiciones')
      setMatriz([])
    } finally {
      setLoading(false)
    }
  }

  const volver = () => navigate(`/almacenes/${almacenId}/carriles`)

  const handleDragStart = (e, pos, fila) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ posicionId: pos.id }))
    e.dataTransfer.effectAllowed = 'move'
    if (modoMover && pos.estado !== 'Disponible' && !pos.bloqueada) {
      setEnTransito({
        posicionId: pos.id,
        numeroPosicion: pos.numero_posicion,
        almacenId,
        almacenNombre: almacenNombre || 'Almacén',
        carrilId,
        carrilNombre: carrilNombre || 'Carril',
        nivelId: fila?.nivel_id ?? null,
        productoResumen: pos.es_varios ? `Varios · ${pos.producto_codigo || ''}` : `${pos.producto_codigo || ''} ${pos.producto_nombre || ''}`.trim(),
      })
    }
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = async (e, posDestino, filaDestino) => {
    e.preventDefault()
    const raw = e.dataTransfer.getData('application/json')
    if (!raw) return
    let source
    try {
      source = JSON.parse(raw)
    } catch {
      return
    }
    const posicionOrigenId = source.posicionId
    if (posicionOrigenId === posDestino.id) return
    if (posDestino.bloqueada) {
      toast.error('No se puede soltar en una posición bloqueada')
      return
    }
    try {
      setMovingTodo(true)
      await almacenesApi.moverTodoPosicion(almacenId, carrilId, posicionOrigenId, {
        nuevo_almacen_id: almacenId,
        nuevo_carril_id: carrilId,
        nuevo_nivel_id: filaDestino.nivel_id,
        nuevo_posicion_id: posDestino.id,
      })
      toast.success('Todos los productos se movieron correctamente')
      clearTransito()
      cargaDatos()
    } catch (err) {
      const msg = err.response?.data?.message || 'Error al mover los productos'
      toast.error(msg)
    } finally {
      setMovingTodo(false)
    }
  }

  const irAPosicion = (posicionId, numeroNivel, numeroPosicion) => {
    const posicionNombre = etiquetaPosicion(numeroPosicion)
    navigate(`/almacenes/${almacenId}/carriles/${carrilId}/posicion/${posicionId}`, {
      state: { almacenNombre, carrilNombre, posicionNombre },
    })
  }

  const etiquetaPosicion = (numeroPosicion) => `Posición ${numeroPosicion}`

  useEffect(() => {
    if (enTransito) {
      almacenesApi.listar()
        .then((r) => setAlmacenesDrawer(Array.isArray(r.data) ? r.data : []))
        .catch(() => setAlmacenesDrawer([]))
      setCarrilesPorAlmacen({})
      setAlmacenesExpandidos(new Set())
      setCarrilesExpandidos(new Set())
      setMatrizPorCarril({})
    }
  }, [enTransito])

  const toggleAlmacenDrawer = (aid) => {
    if (almacenesExpandidos.has(aid)) {
      setAlmacenesExpandidos((s) => { const n = new Set(s); n.delete(aid); return n })
      return
    }
    setAlmacenesExpandidos((s) => new Set(s).add(aid))
    if (!carrilesPorAlmacen[aid]) {
      almacenesApi.carriles(aid)
        .then((r) => setCarrilesPorAlmacen((prev) => ({ ...prev, [aid]: r.data ?? [] })))
        .catch(() => setCarrilesPorAlmacen((prev) => ({ ...prev, [aid]: [] })))
    }
  }

  const toggleCarrilDrawer = (almacenId, almacenNombre, carrilId, carrilNombre) => {
    const key = `${almacenId}_${carrilId}`
    if (carrilesExpandidos.has(key)) {
      setCarrilesExpandidos((s) => { const n = new Set(s); n.delete(key); return n })
      return
    }
    setCarrilesExpandidos((s) => new Set(s).add(key))
    if (!matrizPorCarril[key]) {
      almacenesApi.nivelesPosiciones(almacenId, carrilId)
        .then((res) => {
          const matriz = res?.data?.matriz ?? []
          setMatrizPorCarril((prev) => ({
            ...prev,
            [key]: { matriz, almacenNombre, carrilNombre },
          }))
        })
        .catch(() => setMatrizPorCarril((prev) => ({ ...prev, [key]: { matriz: [], almacenNombre, carrilNombre } })))
    }
  }

  const handleMoverAquiPosicion = async (destAlmacenId, destAlmacenNombre, destCarrilId, destCarrilNombre, nivelId, posicionId, numeroNivel, numeroPosicion) => {
    if (!enTransito) return
    if (posicionId === enTransito.posicionId && destCarrilId === carrilId) {
      toast.error('Elija una posición distinta a la de origen')
      return
    }
    const loadingKey = `${destCarrilId}_${posicionId}`
    try {
      setMoverAquiLoading(loadingKey)
      const confirmar = window.confirm(
        `¿Está seguro de mover la Posición ${enTransito.numeroPosicion} del ${enTransito.carrilNombre} (${enTransito.almacenNombre}) a ${destAlmacenNombre} → ${destCarrilNombre} → Nivel ${numeroNivel} → Posición ${numeroPosicion}?`
      )
      if (!confirmar) return
      await almacenesApi.moverTodoPosicion(enTransito.almacenId, enTransito.carrilId, enTransito.posicionId, {
        nuevo_almacen_id: destAlmacenId,
        nuevo_carril_id: destCarrilId,
        nuevo_nivel_id: nivelId,
        nuevo_posicion_id: posicionId,
      })
      toast.success('Posición movida correctamente')
      clearTransito()
      cargaDatos()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al mover la posición')
    } finally {
      setMoverAquiLoading(null)
    }
  }

  useEffect(() => {
    const cargarDespachos = () => {
      despachosApi.listar({ estado: 'Registrado', limit: 100 })
        .then((r) => setDespachosRegistrados(r.data?.data ?? r.data ?? []))
        .catch(() => setDespachosRegistrados([]))
    }
    if (modalDespacho.open) setDespachoSeleccionado('')
    cargarDespachos()
    window.addEventListener('despachos-actualizados', cargarDespachos)
    return () => window.removeEventListener('despachos-actualizados', cargarDespachos)
  }, [modalDespacho.open])

  const cargarRequeridosDespacho = async (despachoId) => {
    if (!despachoId) {
      setProductosRequeridosDespacho({ activa: false, codigos: new Set(), ordenProduccion: '' })
      return { activa: false }
    }
    const { data } = await despachosApi.obtenerProductosRequeridos(despachoId)
    const codigos = new Set((data?.productos || []).map((p) => String(p.codigo || '').trim()).filter(Boolean))
    if (!data?.activa) {
      try {
        localStorage.removeItem('despacho_activo_requeridos_id')
      } catch (_) { /* noop */ }
      setProductosRequeridosDespacho({ activa: false, codigos: new Set(), ordenProduccion: '' })
      return { activa: false }
    }
    setProductosRequeridosDespacho({
      activa: true,
      codigos,
      ordenProduccion: String(data?.orden_produccion || '').trim(),
    })
    return { activa: true }
  }

  useEffect(() => {
    let cancel = false
    const cargarInicial = async () => {
      let despachoId = ''
      try {
        despachoId = localStorage.getItem('despacho_activo_requeridos_id') || ''
      } catch (_) {
        despachoId = ''
      }
      if (!despachoId) return
      try {
        if (!cancel) await cargarRequeridosDespacho(despachoId)
      } catch (_) {
        try {
          localStorage.removeItem('despacho_activo_requeridos_id')
        } catch (_) { /* noop */ }
        if (!cancel) setProductosRequeridosDespacho({ activa: false, codigos: new Set(), ordenProduccion: '' })
      }
    }
    const handler = (e) => {
      const id = String(e?.detail?.despachoId || '')
      cargarRequeridosDespacho(id).catch(() => setProductosRequeridosDespacho({ activa: false, codigos: new Set(), ordenProduccion: '' }))
    }
    cargarInicial()
    window.addEventListener('despacho-requeridos-actualizados', handler)
    return () => {
      cancel = true
      window.removeEventListener('despacho-requeridos-actualizados', handler)
    }
  }, [])

  useEffect(() => {
    let cancel = false
    if (!despachoSeleccionado) {
      setProductosRequeridosDespacho({ activa: false, codigos: new Set(), ordenProduccion: '' })
      return
    }
    cargarRequeridosDespacho(despachoSeleccionado)
      .then((res) => {
        if (cancel) return
        if (!res?.activa) return
        try {
          localStorage.setItem('despacho_activo_requeridos_id', String(despachoSeleccionado))
          window.dispatchEvent(new CustomEvent('despacho-requeridos-actualizados', { detail: { despachoId: String(despachoSeleccionado) } }))
        } catch (_) { /* noop */ }
      })
      .catch(() => {
        try {
          localStorage.removeItem('despacho_activo_requeridos_id')
        } catch (_) { /* noop */ }
        if (!cancel) setProductosRequeridosDespacho({ activa: false, codigos: new Set(), ordenProduccion: '' })
      })
    return () => { cancel = true }
  }, [despachoSeleccionado])

  useEffect(() => {
    let cancel = false
    const cargarResumen = async () => {
      if (!modalDespacho.open || !modalDespacho.posicionId || !despachoSeleccionado) {
        setResumenAgregarPosicion({ total: 0, requeridos: 0, omitidos: 0, codigosOmitidos: [] })
        return
      }
      try {
        const { data } = await almacenesApi.obtenerPosicion(almacenId, carrilId, modalDespacho.posicionId)
        if (cancel) return
        const stockPos = Array.isArray(data?.stock) ? data.stock : []
        const codigos = stockPos.map((s) => String(s?.producto_codigo || '').trim()).filter(Boolean)
        if (!productosRequeridosDespacho.activa) {
          setResumenAgregarPosicion({
            total: stockPos.length,
            requeridos: stockPos.length,
            omitidos: 0,
            codigosOmitidos: [],
          })
          return
        }
        const requeridos = codigos.filter((c) => productosRequeridosDespacho.codigos.has(c)).length
        const omitidosCodes = [...new Set(codigos.filter((c) => !productosRequeridosDespacho.codigos.has(c)))]
        setResumenAgregarPosicion({
          total: stockPos.length,
          requeridos,
          omitidos: omitidosCodes.length,
          codigosOmitidos: omitidosCodes,
        })
      } catch (_) {
        if (!cancel) setResumenAgregarPosicion({ total: 0, requeridos: 0, omitidos: 0, codigosOmitidos: [] })
      }
    }
    cargarResumen()
    return () => { cancel = true }
  }, [modalDespacho.open, modalDespacho.posicionId, despachoSeleccionado, productosRequeridosDespacho, almacenId, carrilId])

  const confirmarAgregarPosicionAlDespacho = async () => {
    if (!despachoSeleccionado || !modalDespacho.posicionId) return
    try {
      setAgregandoADespacho(true)
      const { data } = await despachosApi.agregarPosicion(despachoSeleccionado, modalDespacho.posicionId)
      toast.success(data?.message || 'Posición agregada al despacho')
      setModalDespacho({ open: false, posicionId: null })
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al agregar al despacho')
    } finally {
      setAgregandoADespacho(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-600 border-t-transparent" />
      </div>
    )
  }

  const matrizSegura = Array.isArray(matriz) ? matriz : []
  const maxColumnas = Math.max(...matrizSegura.map((f) => (f.posiciones || []).length), 1)
  // Orden para vista: nivel 1 abajo (como primer piso), niveles superiores hacia arriba
  const matrizVista = [...matrizSegura].reverse()

  return (
    <div className="min-w-0 max-w-full">
      <div className="flex flex-col lg:flex-row lg:flex-wrap lg:items-center gap-3 lg:gap-4 mb-4">
        <button
          type="button"
          onClick={volver}
          className="inline-flex items-center justify-center gap-2 min-h-[44px] w-full lg:w-auto px-4 py-2.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 shrink-0"
        >
          <ArrowLeft className="w-4 h-4 shrink-0" />
          Regresar
        </button>
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <Grid3X3 className="w-7 h-7 sm:w-8 sm:h-8 text-primary-600 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm text-gray-500 dark:text-gray-400">Vista nivel–posición</p>
            <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white leading-tight">
              Almacén: <span className="text-primary-600 dark:text-primary-400">{almacenNombre}</span>{' '}
              <span className="text-gray-400 font-normal">&gt;</span> Carril:{' '}
              <span className="text-primary-600 dark:text-primary-400">{carrilNombre}</span>
            </h1>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setModoMover((m) => !m)}
          className={`inline-flex items-center justify-center gap-2 min-h-[44px] w-full lg:w-auto px-4 py-2.5 rounded-lg font-medium transition-colors shrink-0 ${
            modoMover
              ? 'bg-primary-600 text-white hover:bg-primary-700'
              : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
          }`}
          title={modoMover ? 'Desactivar modo mover (hacer clic en una posición para ir al detalle)' : 'Activar para arrastrar una posición a otra y mover todos sus productos'}
        >
          <Move className="w-5 h-5 shrink-0" />
          {modoMover ? 'Modo mover (activo)' : 'Modo mover'}
        </button>
      </div>

      {modoMover && (
        <div className="mb-4 p-3 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg text-sm text-primary-800 dark:text-primary-200 flex items-center gap-2">
          <Move className="w-5 h-5 flex-shrink-0" />
          <span>Arrastre una posición con productos a otra posición para mover todos los productos. No se puede soltar en posiciones bloqueadas.</span>
        </div>
      )}

      <div className="mb-6 p-5 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 rounded-xl border border-gray-200 dark:border-gray-600 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Estado del Carril</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Espacios Totales</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{resumen.espacios_totales}</div>
          </div>
          <div className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Ocupados</div>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">{resumen.espacios_ocupados}</div>
          </div>
          <div className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Disponibles</div>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{resumen.espacios_libres}</div>
          </div>
          <div className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">% Ocupación</div>
            <div className="text-2xl font-bold text-primary-600 dark:text-primary-400">{resumen.porcentaje_ocupacion}%</div>
          </div>
        </div>
        <div>
          <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
            <span className="font-medium">Ocupación del carril</span>
            <span className="font-semibold">{resumen.porcentaje_ocupacion}%</span>
          </div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden shadow-inner">
            <div
              className="h-full bg-gradient-to-r from-primary-500 to-primary-600 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, resumen.porcentaje_ocupacion)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="wms-table-scroll bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="p-1 text-center text-sm font-bold text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 rounded-tl-lg">
                ↑↓
              </th>
              {Array.from({ length: maxColumnas }, (_, i) => (
                <th
                  key={i}
                  className="p-3 text-center text-sm font-semibold text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700"
                >
                  Pos {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrizVista.map((fila, idx) => (
              <tr key={fila.nivel_id}>
                <td className="p-1 text-sm font-semibold text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 whitespace-nowrap">
                  <div className="[writing-mode:vertical-lr] rotate-180 mx-auto">
                    Nivel {fila.numero_nivel}
                  </div>
                </td>
                {(fila.posiciones || []).map((pos) => {
                  const codigoPos = String(pos.producto_codigo || '').trim()
                  const codigoRequerido = productosRequeridosDespacho.activa && codigoPos && productosRequeridosDespacho.codigos.has(codigoPos)
                  const esBloqueada = pos.bloqueada
                  const stockPosicionIds = Array.isArray(pos.stock_posicion_ids) ? pos.stock_posicion_ids.filter(Boolean) : []
                  const stockItems = Array.isArray(pos.stock_items) ? pos.stock_items : []
                  const totalItems = stockItems.length > 0 ? stockItems.length : stockPosicionIds.length
                  const despachadosItems = stockItems.length > 0
                    ? stockItems.filter((it) => {
                        const desp = Number(bultosEnDespachoPorStock.get(it?.id) || 0)
                        const stk = Number(it?.cantidad_bultos || 0)
                        return desp > 0 && stk > 0
                      }).length
                    : (totalItems > 0 ? stockPosicionIds.filter((id) => idsEnDespacho.has(id)).length : 0)
                  const completosItems = stockItems.length > 0
                    ? stockItems.filter((it) => {
                        const desp = Number(bultosEnDespachoPorStock.get(it?.id) || 0)
                        const stk = Number(it?.cantidad_bultos || 0)
                        return stk > 0 && desp >= stk
                      }).length
                    : despachadosItems
                  const posicionCompletaEnDespacho = totalItems > 0 && completosItems === totalItems
                  const posicionParcialEnDespacho = totalItems > 0 && despachadosItems > 0 && !posicionCompletaEnDespacho
                  const estadoVisual = esBloqueada ? 'Bloqueado' : pos.estado
                  const colorFondoPosicion = posicionCompletaEnDespacho
                    ? 'bg-blue-600 dark:bg-blue-700 border-blue-700 dark:border-blue-500'
                    : posicionParcialEnDespacho
                    ? 'bg-sky-500 dark:bg-sky-600 border-sky-600 dark:border-sky-400'
                    : (ESTADO_COLORS[estadoVisual] || ESTADO_COLORS.Disponible)
                  const tituloCelda = esBloqueada
                    ? `${etiquetaPosicion(pos.numero_posicion)} - Bloqueada`
                    : `${etiquetaPosicion(pos.numero_posicion)} - Estado: ${pos.estado}`
                  const puedeArrastrar = modoMover && pos.estado !== 'Disponible' && !esBloqueada
                  const puedeSoltar = modoMover && !esBloqueada
                  return (
                    <td
                      key={pos.id}
                      className="border border-gray-300 dark:border-gray-600 p-1 min-w-[112px]"
                      draggable={puedeArrastrar && !movingTodo}
                      onDragStart={puedeArrastrar ? (e) => handleDragStart(e, pos, fila) : undefined}
                      onDragOver={puedeSoltar ? handleDragOver : undefined}
                      onDrop={puedeSoltar ? (e) => handleDrop(e, pos, fila) : undefined}
                    >
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => {
                            if (!modoMover) irAPosicion(pos.id, fila.numero_nivel, pos.numero_posicion)
                          }}
                          className={`w-full p-2.5 rounded-lg border-2 text-left text-xs transition-all hover:scale-105 hover:shadow-lg hover:ring-2 hover:ring-offset-1 hover:ring-primary-400 ${colorFondoPosicion} text-white font-medium ${modoMover && puedeArrastrar ? 'cursor-grab active:cursor-grabbing' : ''} ${modoMover ? 'cursor-default' : ''} ${enTransito?.posicionId === pos.id ? 'opacity-50 ring-2 ring-primary-400' : ''} ${codigoRequerido ? 'ring-4 ring-yellow-300 dark:ring-yellow-300 ring-offset-2 ring-offset-white dark:ring-offset-gray-900 border-yellow-200 dark:border-yellow-300 shadow-[0_0_0_2px_rgba(253,224,71,0.6)]' : ''}`}
                          title={modoMover ? (puedeArrastrar ? 'Arrastre a otra posición para mover todos los productos' : tituloCelda) : tituloCelda}
                        >
                        <div className="flex items-center gap-1.5 font-bold mb-1 whitespace-normal break-words leading-tight" title={tituloCelda}>
                          {esBloqueada && <Lock className="w-4 h-4 flex-shrink-0" />}
                          {modoMover && puedeArrastrar && <Move className="w-4 h-4 flex-shrink-0 opacity-90" />}
                          Posición {pos.numero_posicion}
                        </div>
                        {pos.estado !== 'Disponible' && (
                          <>
                            <div className="mt-1 opacity-95 text-xs font-semibold whitespace-normal break-words leading-tight">
                              {pos.es_varios ? (
                                <>
                                  Varios ·{' '}
                                  <span className={codigoRequerido ? 'inline-flex items-center px-1.5 py-0.5 rounded border border-yellow-300 dark:border-yellow-200 bg-yellow-100/95 dark:bg-yellow-900/50 text-yellow-900 dark:text-yellow-100 font-extrabold' : ''}>
                                    {pos.producto_codigo || ''}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span className={codigoRequerido ? 'inline-flex items-center px-1.5 py-0.5 rounded border border-yellow-300 dark:border-yellow-200 bg-yellow-100/95 dark:bg-yellow-900/50 text-yellow-900 dark:text-yellow-100 font-extrabold' : ''}>
                                    {pos.producto_codigo || ''}
                                  </span>
                                  {pos.producto_nombre ? ` - ${pos.producto_nombre}` : ''}
                                </>
                              )}
                            </div>
                            {pos.producto_descripcion && (
                              <div className="mt-0.5 opacity-90 text-[10px] leading-tight whitespace-normal break-words" title={pos.producto_descripcion}>
                                {pos.producto_descripcion}
                              </div>
                            )}
                            <div className="mt-2 opacity-95 text-xs space-y-0.5">
                              <div className="flex justify-between">
                                <span>Bultos:</span>
                                <span className="font-semibold">{pos.total_bultos}</span>
                              </div>
                              {pos.total_peso_adicional > 0 && (
                                <div className="flex justify-between">
                                  <span>Peso adj. (kg):</span>
                                  <span className="font-semibold">{Number(pos.total_peso_adicional).toFixed(2)}</span>
                                </div>
                              )}
                              <div className="flex justify-between">
                                <span>Total KG:</span>
                                <span className="font-semibold">{Number(pos.total_kg).toFixed(2)}</span>
                              </div>
                            </div>
                            {esBloqueada && (
                              <div className="mt-1.5 opacity-95 text-xs font-medium flex items-center gap-1">
                                <Lock className="w-3.5 h-3.5" />
                                Bloqueada
                              </div>
                            )}
                          </>
                        )}
                        {pos.estado === 'Disponible' && (
                          <div className="mt-2 opacity-95 text-xs font-medium flex items-center gap-1">
                            {esBloqueada && <Lock className="w-3.5 h-3.5" />}
                            {esBloqueada ? 'Bloqueada' : 'Disponible'}
                          </div>
                        )}
                        </button>
                        {!modoMover && pos.estado !== 'Disponible' && !esBloqueada && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (!posicionCompletaEnDespacho && !posicionParcialEnDespacho) setModalDespacho({ open: true, posicionId: pos.id })
                            }}
                            disabled={posicionCompletaEnDespacho || posicionParcialEnDespacho}
                            className={`absolute top-1 right-1 p-1.5 rounded shadow border ${
                              (posicionCompletaEnDespacho || posicionParcialEnDespacho)
                                ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 cursor-not-allowed'
                                : 'bg-white/90 dark:bg-gray-800/90 text-primary-600 hover:bg-white dark:hover:bg-gray-800 border-gray-200 dark:border-gray-600'
                            }`}
                            title={
                              posicionCompletaEnDespacho
                                ? 'Esta posición ya fue agregada completamente a un despacho'
                                : posicionParcialEnDespacho
                                ? 'Esta posición tiene saldo parcial en despacho. Agregue solo líneas pendientes.'
                                : 'Agregar toda la posición al despacho'
                            }
                          >
                            <Truck className="w-4 h-4" />
                          </button>
                        )}
                        {!modoMover && pos.estado !== 'Disponible' && !esBloqueada && (posicionCompletaEnDespacho || posicionParcialEnDespacho) && (
                          <div className={`absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                            posicionCompletaEnDespacho
                              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                              : 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                          }`}>
                            {posicionCompletaEnDespacho ? 'Agregado' : `Parcial (${despachadosItems}/${totalItems})`}
                          </div>
                        )}
                      </div>
                    </td>
                  )
                })}
                {Array.from({ length: maxColumnas - (fila.posiciones || []).length }, (_, i) => (
                  <td key={`empty-${fila.nivel_id}-${i}`} className="border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/30" />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Leyenda de Estados</h3>
        <div className="flex flex-wrap gap-6 text-sm">
          <span className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
            <span className="w-5 h-5 rounded bg-green-500 border-2 border-green-600 dark:border-green-500 shadow-sm" /> 
            <span><strong>Verde:</strong> Disponible</span>
          </span>
          <span className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
            <span className="w-5 h-5 rounded bg-red-500 border-2 border-red-600 dark:border-red-500 shadow-sm" /> 
            <span><strong>Rojo:</strong> Ocupado (un solo producto/lote)</span>
          </span>
          <span className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
            <span className="w-5 h-5 rounded bg-amber-500 border-2 border-amber-600 dark:border-amber-500 shadow-sm" /> 
            <span><strong>Naranja/Amarillo:</strong> Mixto (varios productos o lotes)</span>
          </span>
          <span className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
            <span className="w-5 h-5 rounded bg-blue-600 border-2 border-blue-700 dark:bg-blue-700 dark:border-blue-500 shadow-sm" />
            <span><strong>Azul:</strong> Agregado a despacho (posición completa)</span>
          </span>
          <span className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
            <span className="w-5 h-5 rounded bg-sky-500 border-2 border-sky-600 dark:bg-sky-600 dark:border-sky-400 shadow-sm" />
            <span><strong>Azul claro:</strong> Parcial en despacho</span>
          </span>
          <span className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
            <span className="w-5 h-5 rounded bg-slate-500 border-2 border-slate-600 dark:border-slate-500 shadow-sm flex items-center justify-center">
              <Lock className="w-3 h-3 text-white" />
            </span> 
            <span><strong>Gris (candado):</strong> Bloqueada (no se puede agregar ni mover)</span>
          </span>
        </div>
      </div>

      {matrizSegura.length === 0 && (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          No hay niveles o posiciones en este carril.
        </div>
      )}

      <Modal isOpen={modalDespacho.open} onClose={() => setModalDespacho({ open: false, posicionId: null })} title="Agregar posición al despacho" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">Se agregarán todos los productos de esta posición al despacho seleccionado.</p>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Despacho (estado Registrado)</label>
            <select value={despachoSeleccionado} onChange={(e) => setDespachoSeleccionado(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white">
              <option value="">Seleccione un despacho</option>
              {despachosRegistrados.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.tipo_salida} · {d.cliente_destino || 'Sin cliente'} · {d.referencia_salida} ({d.total_bultos} bultos)
                </option>
              ))}
            </select>
          </div>
          {productosRequeridosDespacho.activa && (
            <div className="text-xs px-2.5 py-2 rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200">
              OP {productosRequeridosDespacho.ordenProduccion || '-'}: solo codigos requeridos ({Array.from(productosRequeridosDespacho.codigos).join(', ')}).
            </div>
          )}
          {despachoSeleccionado && (
            <div className="text-xs px-2.5 py-2 rounded border border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-900/20 text-sky-800 dark:text-sky-200">
              {productosRequeridosDespacho.activa ? (
                <>
                  Vista previa: se agregarán <strong>{resumenAgregarPosicion.requeridos}</strong> línea(s)
                  {resumenAgregarPosicion.omitidos > 0 && (
                    <> y se omitirán <strong>{resumenAgregarPosicion.omitidos}</strong> no requerida(s): {resumenAgregarPosicion.codigosOmitidos.join(', ')}.</>
                  )}
                </>
              ) : (
                <>
                  Vista previa: se agregarán <strong>{resumenAgregarPosicion.requeridos}</strong> línea(s) de la posición.
                </>
              )}
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setModalDespacho({ open: false, posicionId: null })} className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 font-medium">Cancelar</button>
            <button type="button" onClick={confirmarAgregarPosicionAlDespacho} disabled={!despachoSeleccionado || agregandoADespacho} className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg font-medium disabled:opacity-50">
              {agregandoADespacho ? 'Agregando...' : 'Agregar toda la posición'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Panel de destino: mover posición a otro carril/almacén (colapsable) */}
      {enTransito && (
        <>
          {/* Pestaña para abrir panel cuando está cerrado */}
          {!panelDestinoAbierto && (
            <button
              type="button"
              onClick={() => setPanelDestinoAbierto(true)}
              className="fixed top-1/2 right-0 -translate-y-1/2 z-30 flex items-center gap-1 py-4 pl-2 pr-2 rounded-l-lg shadow-lg border border-r-0 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              title="Abrir panel de destino"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="text-xs font-medium whitespace-nowrap [writing-mode:vertical-rl] rotate-180">Destino</span>
            </button>
          )}
          <div
            className={`fixed inset-y-0 right-0 z-30 w-full max-w-sm bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 shadow-xl flex flex-col transition-transform duration-300 ease-out ${panelDestinoAbierto ? 'translate-x-0' : 'translate-x-full'}`}
          >
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Move className="w-5 h-5 text-primary-600 flex-shrink-0" />
                  Mover a otra posición
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Posición {enTransito.numeroPosicion} · {enTransito.almacenNombre} → {enTransito.carrilNombre}
                </p>
                {enTransito.productoResumen && (
                  <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5 truncate" title={enTransito.productoResumen}>
                    {enTransito.productoResumen}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setPanelDestinoAbierto(false)}
                className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 dark:hover:text-gray-200 flex-shrink-0"
                title="Ocultar panel para poder arrastrar en la cuadrícula"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Navegue por Almacén → Carril → Nivel → Posición y pulse &quot;Mover aquí&quot; en la posición exacta de destino.</p>
              <ul className="space-y-1">
                {almacenesDrawer.map((alm) => (
                  <li key={alm.id} className="rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleAlmacenDrawer(alm.id)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    >
                      {almacenesExpandidos.has(alm.id) ? (
                        <ChevronDown className="w-4 h-4 flex-shrink-0 text-gray-500" />
                      ) : (
                        <ChevronRight className="w-4 h-4 flex-shrink-0 text-gray-500" />
                      )}
                      {alm.nombre}
                    </button>
                    {almacenesExpandidos.has(alm.id) && (
                      <ul className="border-t border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/30 py-1">
                        {(carrilesPorAlmacen[alm.id] || []).map((c) => {
                          const carrilKey = `${alm.id}_${c.id}`
                          const carrilNombreStr = c.nombre || `Carril ${c.numero_carril}`
                          const datosCarril = matrizPorCarril[carrilKey]
                          return (
                            <li key={c.id} className="border-b border-gray-100 dark:border-gray-700/50 last:border-b-0">
                              <button
                                type="button"
                                onClick={() => toggleCarrilDrawer(alm.id, alm.nombre, c.id, carrilNombreStr)}
                                className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50"
                              >
                                {carrilesExpandidos.has(carrilKey) ? (
                                  <ChevronDown className="w-4 h-4 flex-shrink-0 text-gray-500" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 flex-shrink-0 text-gray-500" />
                                )}
                                {carrilNombreStr}
                              </button>
                              {carrilesExpandidos.has(carrilKey) && datosCarril && (
                                <ul className="bg-gray-100/50 dark:bg-gray-900/50 py-1 pl-4 pr-2">
                                  {(datosCarril.matriz || []).map((fila) => (
                                    <li key={fila.nivel_id} className="mb-2 last:mb-0">
                                      <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 py-1">
                                        Nivel {fila.numero_nivel}
                                      </div>
                                      <ul className="space-y-1">
                                        {(fila.posiciones || []).map((p) => {
                                          const esOrigen = p.id === enTransito.posicionId && c.id === carrilId
                                          const loadingKey = `${c.id}_${p.id}`
                                          return (
                                            <li
                                              key={p.id}
                                              className="flex items-center justify-between gap-2 py-1.5 px-2 rounded bg-white dark:bg-gray-800/80 border border-gray-200 dark:border-gray-600"
                                            >
                                              <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
                                                Posición {p.numero_posicion}
                                                {p.estado && (
                                                  <span className={`ml-1 text-xs ${p.bloqueada ? 'text-gray-400' : p.estado === 'Disponible' ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                                    · {p.bloqueada ? 'Bloqueada' : p.estado}
                                                  </span>
                                                )}
                                              </span>
                                              <button
                                                type="button"
                                                onClick={() => handleMoverAquiPosicion(alm.id, alm.nombre, c.id, carrilNombreStr, fila.nivel_id, p.id, fila.numero_nivel, p.numero_posicion)}
                                                disabled={moverAquiLoading !== null || p.bloqueada || esOrigen}
                                                className="px-2 py-1 rounded text-xs font-medium bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                                                title={p.bloqueada ? 'Posición bloqueada' : esOrigen ? 'Es la posición de origen' : `Mover aquí (N${fila.numero_nivel} P${p.numero_posicion})`}
                                              >
                                                {moverAquiLoading === loadingKey ? '...' : 'Mover aquí'}
                                              </button>
                                            </li>
                                          )
                                        })}
                                      </ul>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default NivelPosicion
