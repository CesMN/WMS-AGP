import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, MapPin, Plus, Edit, Trash2, Move, Package, Lock, Unlock, Truck } from 'lucide-react'
import { almacenesApi } from '../../api/almacenes'
import { despachosApi } from '../../api/despachos'
import Modal from '../../components/Modal'
import toast from 'react-hot-toast'
import FormularioIngreso from './FormularioIngreso'
import ModalMoverProducto from './ModalMoverProducto'

const ESTADO_COLORS = {
  Disponible: 'bg-green-500 dark:bg-green-600',
  Ocupado: 'bg-red-500 dark:bg-red-600',
  Mix: 'bg-amber-500 dark:bg-amber-600',
}

const ESTADO_BADGE_COLORS = {
  Disponible: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
  Ocupado: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
  Mix: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300',
}

const Posicion = () => {
  const { almacenId, carrilId, posicionId } = useParams()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [posicionData, setPosicionData] = useState(null)
  const [showFormulario, setShowFormulario] = useState(false)
  const [stockEditando, setStockEditando] = useState(null)
  const [stockMoviendo, setStockMoviendo] = useState(null)
  const [togglingBloqueo, setTogglingBloqueo] = useState(false)
  const [modalDespacho, setModalDespacho] = useState({ open: false, stockItem: null })
  const [despachosRegistrados, setDespachosRegistrados] = useState([])
  const [despachoSeleccionado, setDespachoSeleccionado] = useState('')
  const [agregandoADespacho, setAgregandoADespacho] = useState(false)
  const [productosRequeridosDespacho, setProductosRequeridosDespacho] = useState({ activa: false, codigos: new Set(), ordenProduccion: '' })
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [modalMoverVarios, setModalMoverVarios] = useState({ open: false, items: [] })
  const [moverVariosLoading, setMoverVariosLoading] = useState(false)
  const [moverVariosDestino, setMoverVariosDestino] = useState({ almacen_id: '', carril_id: '', nivel_id: '', posicion_id: '' })
  const [almacenes, setAlmacenes] = useState([])
  const [carrilesMover, setCarrilesMover] = useState([])
  const [nivelesMover, setNivelesMover] = useState([])
  const [posicionesMover, setPosicionesMover] = useState([])
  const [loadingDestino, setLoadingDestino] = useState(false)
  const [eliminandoVarios, setEliminandoVarios] = useState(false)

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
  const claveGrupoStock = (item) => [
    item?.producto_codigo || '',
    item?.lote || '',
    item?.referencia || '',
    item?.fecha_ingreso ? String(item.fecha_ingreso).slice(0, 10) : '',
  ].join('|')

  useEffect(() => {
    if (almacenId && carrilId && posicionId) {
      cargaDatos()
    }
  }, [almacenId, carrilId, posicionId])

  const cargaDatos = async () => {
    try {
      setLoading(true)
      const { data } = await almacenesApi.obtenerPosicion(almacenId, carrilId, posicionId)
      setPosicionData(data)
    } catch (e) {
      toast.error('Error al cargar datos de la posición')
      setPosicionData(null)
    } finally {
      setLoading(false)
    }
  }

  const regresar = () => navigate(`/almacenes/${almacenId}/carriles/${carrilId}/niveles`)

  const handleAgregar = () => {
    setStockEditando(null)
    setShowFormulario(true)
  }

  const handleEditar = (stock) => {
    setStockEditando(stock)
    setShowFormulario(true)
  }

  const handleEliminar = async (stock) => {
    if (!window.confirm(`¿Está seguro de eliminar este producto de la posición?`)) {
      return
    }

    try {
      await almacenesApi.eliminarStock(almacenId, carrilId, posicionId, stock.id)
      toast.success('Producto eliminado correctamente')
      cargaDatos()
    } catch (error) {
      const message = error.response?.data?.message || 'Error al eliminar el producto'
      toast.error(message)
    }
  }

  const handleMover = (stock) => {
    setStockMoviendo(stock)
  }

  const handleFormularioClose = () => {
    setShowFormulario(false)
    setStockEditando(null)
  }

  const handleFormularioSuccess = () => {
    cargaDatos()
  }

  const handleMoverClose = () => {
    setStockMoviendo(null)
  }

  const handleMoverSuccess = () => {
    cargaDatos()
    setSelectedIds(new Set())
  }

  const toggleSeleccion = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSeleccionTodos = () => {
    if (selectedIds.size === stock.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(stock.map((s) => s.id).filter(Boolean)))
  }

  const handleEliminarVarios = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    if (!window.confirm(`¿Eliminar ${ids.length} producto(s) seleccionado(s) de la posición?`)) return
    try {
      setEliminandoVarios(true)
      for (const id of ids) {
        await almacenesApi.eliminarStock(almacenId, carrilId, posicionId, id)
      }
      toast.success(`${ids.length} producto(s) eliminado(s) correctamente`)
      setSelectedIds(new Set())
      cargaDatos()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al eliminar uno o más productos')
    } finally {
      setEliminandoVarios(false)
    }
  }

  const handleMoverVariosAbrir = () => {
    const items = stock.filter((s) => s?.id && selectedIds.has(s.id))
    if (items.length === 0) return
    setModalMoverVarios({ open: true, items })
    setMoverVariosDestino({ almacen_id: '', carril_id: '', nivel_id: '', posicion_id: '' })
    setCarrilesMover([])
    setNivelesMover([])
    setPosicionesMover([])
  }

  const cargaAlmacenesMover = async () => {
    try {
      setLoadingDestino(true)
      const { data } = await almacenesApi.listar()
      setAlmacenes(Array.isArray(data) ? data : [])
    } catch (e) {
      toast.error('Error al cargar almacenes')
    } finally {
      setLoadingDestino(false)
    }
  }

  const cargaCarrilesMover = async (aid) => {
    if (!aid) { setCarrilesMover([]); return }
    try {
      setLoadingDestino(true)
      const { data } = await almacenesApi.carriles(aid)
      setCarrilesMover(Array.isArray(data) ? data : [])
      setNivelesMover([])
      setPosicionesMover([])
      setMoverVariosDestino((p) => ({ ...p, carril_id: '', nivel_id: '', posicion_id: '' }))
    } catch (e) {
      toast.error('Error al cargar carriles')
    } finally {
      setLoadingDestino(false)
    }
  }

  const cargaNivelesPosicionesMover = async (aid, cid) => {
    if (!aid || !cid) { setNivelesMover([]); setPosicionesMover([]); return }
    try {
      setLoadingDestino(true)
      const { data } = await almacenesApi.nivelesPosiciones(aid, cid)
      const matriz = data?.matriz ?? []
      const nivelesUnicos = []
      const map = new Map()
      matriz.forEach((fila) => {
        if (!map.has(fila.nivel_id)) {
          map.set(fila.nivel_id, true)
          nivelesUnicos.push({ id: fila.nivel_id, numero_nivel: fila.numero_nivel, posiciones: fila.posiciones || [] })
        }
      })
      setNivelesMover(nivelesUnicos)
      setPosicionesMover([])
      setMoverVariosDestino((p) => ({ ...p, nivel_id: '', posicion_id: '' }))
    } catch (e) {
      toast.error('Error al cargar niveles y posiciones')
    } finally {
      setLoadingDestino(false)
    }
  }

  useEffect(() => {
    if (modalMoverVarios.open) {
      cargaAlmacenesMover()
    }
  }, [modalMoverVarios.open])

  const onAlmacenChangeMover = (e) => {
    const aid = e.target.value
    setMoverVariosDestino({ almacen_id: aid, carril_id: '', nivel_id: '', posicion_id: '' })
    setCarrilesMover([])
    setNivelesMover([])
    setPosicionesMover([])
    if (aid) cargaCarrilesMover(aid)
  }

  const onCarrilChangeMover = (e) => {
    const cid = e.target.value
    setMoverVariosDestino((p) => ({ ...p, carril_id: cid, nivel_id: '', posicion_id: '' }))
    setNivelesMover([])
    setPosicionesMover([])
    if (moverVariosDestino.almacen_id && cid) cargaNivelesPosicionesMover(moverVariosDestino.almacen_id, cid)
  }

  const onNivelChangeMover = (e) => {
    const nivelId = e.target.value
    const nivel = nivelesMover.find((n) => n.id === nivelId)
    setMoverVariosDestino((p) => ({ ...p, nivel_id: nivelId, posicion_id: '' }))
    setPosicionesMover(nivel?.posiciones || [])
  }

  const handleMoverVariosSubmit = async (e) => {
    e.preventDefault()
    const { almacen_id, carril_id, nivel_id, posicion_id } = moverVariosDestino
    if (!almacen_id || !carril_id || !nivel_id || !posicion_id) {
      toast.error('Seleccione almacén, carril, nivel y posición de destino')
      return
    }
    if (posicionId && posicion_id === posicionId) {
      toast.error('El destino debe ser una posición distinta a la actual')
      return
    }
    const items = modalMoverVarios.items
    try {
      setMoverVariosLoading(true)
      for (const item of items) {
        await almacenesApi.moverStock(almacenId, carrilId, posicionId, item.id, {
          nuevo_almacen_id: almacen_id,
          nuevo_carril_id: carril_id,
          nuevo_nivel_id: nivel_id,
          nuevo_posicion_id: posicion_id,
          cantidad_bultos: Number(item.cantidad_bultos) || 1,
          peso_adicional: Number(item.peso_adicional) || 0,
          motivo: 'Movimiento múltiple',
        })
      }
      toast.success(`${items.length} producto(s) movido(s) correctamente`)
      setModalMoverVarios({ open: false, items: [] })
      setSelectedIds(new Set())
      cargaDatos()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al mover uno o más productos')
    } finally {
      setMoverVariosLoading(false)
    }
  }

  useEffect(() => {
    const cargarDespachos = () => {
      despachosApi.listar({ estado: 'Registrado', limit: 100 })
        .then((r) => setDespachosRegistrados(r.data?.data ?? r.data ?? []))
        .catch(() => setDespachosRegistrados([]))
    }
    if (modalDespacho.open) {
      setDespachoSeleccionado('')
    }
    cargarDespachos()
    window.addEventListener('despachos-actualizados', cargarDespachos)
    return () => window.removeEventListener('despachos-actualizados', cargarDespachos)
  }, [modalDespacho.open])

  useEffect(() => {
    let cancel = false
    if (!despachoSeleccionado) {
      setProductosRequeridosDespacho({ activa: false, codigos: new Set(), ordenProduccion: '' })
      return
    }
    despachosApi.obtenerProductosRequeridos(despachoSeleccionado)
      .then(({ data }) => {
        if (cancel) return
        const codigos = new Set((data?.productos || []).map((p) => String(p.codigo || '').trim()).filter(Boolean))
        if (!data?.activa) {
          try {
            localStorage.removeItem('despacho_activo_requeridos_id')
          } catch (_) { /* noop */ }
          setProductosRequeridosDespacho({ activa: false, codigos: new Set(), ordenProduccion: '' })
          return
        }
        setProductosRequeridosDespacho({
          activa: true,
          codigos,
          ordenProduccion: String(data?.orden_produccion || '').trim(),
        })
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

  const confirmarAgregarProductoAlDespacho = async () => {
    if (!despachoSeleccionado || !modalDespacho.stockItem) return
    const item = modalDespacho.stockItem
    if (productosRequeridosDespacho.activa) {
      const codigo = String(item?.producto_codigo || '').trim()
      if (!productosRequeridosDespacho.codigos.has(codigo)) {
        toast.error(`Producto no requerido por la OP ${productosRequeridosDespacho.ordenProduccion || ''}. Solo se permiten: ${Array.from(productosRequeridosDespacho.codigos).join(', ')}`)
        return
      }
    }
    try {
      setAgregandoADespacho(true)
      await despachosApi.agregarLineas(despachoSeleccionado, [{
        stock_posicion_id: item.id,
        cantidad_bultos: item.cantidad_bultos,
        peso_adicional: Number(item.peso_adicional) || 0,
      }])
      toast.success('Producto agregado al despacho')
      setModalDespacho({ open: false, stockItem: null })
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al agregar al despacho')
    } finally {
      setAgregandoADespacho(false)
    }
  }

  const handleToggleBloqueo = async () => {
    const nuevaBloqueada = !posicionData?.posicion?.bloqueada
    if (!window.confirm(nuevaBloqueada ? '¿Bloquear esta posición? No se podrán agregar ni mover productos.' : '¿Desbloquear esta posición?')) {
      return
    }
    try {
      setTogglingBloqueo(true)
      await almacenesApi.actualizarPosicion(almacenId, carrilId, posicionId, { bloqueada: nuevaBloqueada })
      toast.success(nuevaBloqueada ? 'Posición bloqueada' : 'Posición desbloqueada')
      cargaDatos()
    } catch (e) {
      toast.error(e.response?.data?.message || 'Error al actualizar la posición')
    } finally {
      setTogglingBloqueo(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-600 border-t-transparent" />
      </div>
    )
  }

  if (!posicionData || !posicionData.posicion) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        No se pudo cargar la información de la posición.
      </div>
    )
  }

  const posicion = posicionData.posicion || {}
  const stock = Array.isArray(posicionData.stock) ? posicionData.stock.filter(Boolean) : []
  const resumen = posicionData.resumen && typeof posicionData.resumen === 'object' ? posicionData.resumen : { total_bultos: 0, total_kg: 0 }
  const stockVisual = stock.flatMap((item) => {
    const totalB = Number(item?.cantidad_bultos) || 0
    const despB = Number(bultosEnDespachoPorStock.get(item?.id) || 0)
    if (despB > 0 && despB < totalB) {
      const proporcion = totalB > 0 ? despB / totalB : 0
      const totalKgItem = Number(item?.total_kg) || 0
      const kgDesp = totalKgItem > 0 ? (totalKgItem * proporcion) : 0
      const kgSaldo = Math.max(0, totalKgItem - kgDesp)
      return [
        {
          ...item,
          __rowKey: String(item.id),
          __esDespachoParcial: true,
          cantidad_bultos: despB,
          total_kg: kgDesp,
        },
        {
          ...item,
          __rowKey: `${item.id}__saldo`,
          __virtualSaldo: true,
          cantidad_bultos: totalB - despB,
          total_kg: kgSaldo,
        },
      ]
    }
    return [{ ...item, __rowKey: String(item.id) }]
  })
  const gruposConDespacho = new Set(
    stock
      .filter((it) => idsEnDespacho.has(it?.id))
      .map((it) => claveGrupoStock(it))
  )

  return (
    <div className="min-w-0 max-w-full">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:flex-wrap xl:items-center gap-3 xl:gap-4 mb-5 sm:mb-6">
        <button
          type="button"
          onClick={regresar}
          className="inline-flex items-center justify-center gap-2 min-h-[44px] w-full xl:w-auto px-4 py-2.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 shrink-0"
        >
          <ArrowLeft className="w-4 h-4 shrink-0" />
          Regresar
        </button>
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <MapPin className="w-7 h-7 sm:w-8 sm:h-8 text-primary-600 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm text-gray-500 dark:text-gray-400">Vista posición</p>
            <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white leading-tight">
              Almacén: <span className="text-primary-600 dark:text-primary-400">{posicion.almacen?.nombre ?? '-'}</span>{' '}
              <span className="text-gray-400 font-normal">&gt;</span> Carril:{' '}
              <span className="text-primary-600 dark:text-primary-400">Carril {posicion.carril?.numero_carril ?? '-'}</span>{' '}
              <span className="text-gray-400 font-normal">&gt;</span> Posición:{' '}
              <span className="text-primary-600 dark:text-primary-400">{posicion.nombre ?? '-'}</span>
            </h1>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full xl:w-auto shrink-0">
          <button
            type="button"
            onClick={handleToggleBloqueo}
            disabled={togglingBloqueo}
            className={`inline-flex items-center justify-center gap-2 min-h-[44px] flex-1 sm:flex-none px-4 py-2.5 rounded-lg font-medium transition-colors ${
              posicion.bloqueada
                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
            }`}
            title={posicion.bloqueada ? 'Desbloquear posición' : 'Bloquear posición (no se podrá agregar ni mover)'}
          >
            {posicion.bloqueada ? <Unlock className="w-5 h-5 shrink-0" /> : <Lock className="w-5 h-5 shrink-0" />}
            {togglingBloqueo ? '...' : (posicion.bloqueada ? 'Desbloquear' : 'Bloquear')}
          </button>
          <button
            type="button"
            onClick={handleAgregar}
            disabled={posicion.bloqueada}
            className="inline-flex items-center justify-center gap-2 min-h-[44px] flex-1 sm:flex-none px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={posicion.bloqueada ? 'Posición bloqueada' : undefined}
          >
            <Plus className="w-5 h-5 shrink-0" />
            Agregar producto
          </button>
        </div>
      </div>

      {/* Información de la Posición */}
      <div className="mb-6 p-5 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 rounded-xl border border-gray-200 dark:border-gray-600 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
            Información de la Posición
          </h2>
          <div className="flex items-center gap-2">
            {posicion.bloqueada && (
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 flex items-center gap-1">
                <Lock className="w-3.5 h-3.5" />
                Bloqueada
              </span>
            )}
            <span
              className={`px-3 py-1 rounded-full text-xs font-semibold ${ESTADO_BADGE_COLORS[posicion.estado] || ESTADO_BADGE_COLORS.Disponible}`}
            >
              {posicion.estado}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-500 dark:text-gray-400">Nivel:</span>
            <span className="ml-2 font-medium text-gray-900 dark:text-white">
              {posicion.nivel?.numero_nivel ?? '-'}
            </span>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Carril:</span>
            <span className="ml-2 font-medium text-gray-900 dark:text-white">
              {posicion.carril?.numero_carril ?? '-'}
            </span>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Posición:</span>
            <span className="ml-2 font-medium text-gray-900 dark:text-white">
              {posicion.numero_posicion ?? '-'}
            </span>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Nombre:</span>
            <span className="ml-2 font-medium text-gray-900 dark:text-white">{posicion.nombre}</span>
          </div>
        </div>
      </div>

      {/* Tabla de Productos */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Package className="w-5 h-5" />
            Productos en la Posición ({stockVisual.length})
          </h2>
          {stock.length > 0 && !posicion.bloqueada && (
            <div className="flex items-center gap-2">
              {selectedIds.size > 0 && (
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {selectedIds.size} seleccionado(s)
                </span>
              )}
              <button
                type="button"
                onClick={handleMoverVariosAbrir}
                disabled={selectedIds.size === 0 || posicion.bloqueada}
                className="inline-flex items-center justify-center gap-2 min-h-[40px] sm:min-h-0 px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                title="Mover productos seleccionados a otra posición"
              >
                <Move className="w-4 h-4 shrink-0" />
                Mover seleccionados
              </button>
              <button
                type="button"
                onClick={handleEliminarVarios}
                disabled={selectedIds.size === 0 || eliminandoVarios}
                className="inline-flex items-center justify-center gap-2 min-h-[40px] sm:min-h-0 px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                title="Eliminar productos seleccionados"
              >
                <Trash2 className="w-4 h-4" />
                {eliminandoVarios ? 'Eliminando...' : 'Eliminar seleccionados'}
              </button>
            </div>
          )}
        </div>

        {stock.length === 0 ? (
          <div className="p-12 text-center text-gray-500 dark:text-gray-400">
            <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No hay productos en esta posición.</p>
            <p className="text-sm mt-2">Haga clic en "Agregar Producto" para comenzar.</p>
          </div>
        ) : (
          <div className="wms-table-scroll">
            <table className="w-full min-w-[56rem]">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  {!posicion.bloqueada && (
                    <th className="px-4 py-3 text-center w-12">
                      <input
                        type="checkbox"
                        checked={stock.length > 0 && selectedIds.size === stock.length}
                        onChange={toggleSeleccionTodos}
                        className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                        title="Seleccionar todos"
                      />
                    </th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Producto
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Descripción
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Presentación
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Lote
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Referencia
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Fecha
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Bultos
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Peso adj. (kg)
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Total KG
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {stockVisual.map((item, idx) => (
                  (() => {
                    const despB = Number(bultosEnDespachoPorStock.get(item?.id) || 0)
                    const filaVirtual = !!item.__virtualSaldo
                    const enDespacho = !filaVirtual && despB >= (Number(item?.cantidad_bultos) || 0)
                    const enGrupoParcial = filaVirtual || (!enDespacho && gruposConDespacho.has(claveGrupoStock(item)))
                    return (
                  <tr
                    key={item?.__rowKey ?? item?.id ?? `stock-${idx}`}
                    className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${selectedIds.has(item?.id) ? 'bg-primary-50 dark:bg-primary-900/20' : ''} ${enDespacho ? 'bg-blue-50 dark:bg-blue-900/10' : ''} ${enGrupoParcial ? 'bg-amber-50 dark:bg-amber-900/10' : ''}`}
                  >
                    {!posicion.bloqueada && (
                      <td className="px-4 py-3 text-center w-12">
                        <input
                          type="checkbox"
                          checked={!filaVirtual && selectedIds.has(item?.id)}
                          onChange={() => !filaVirtual && toggleSeleccion(item?.id)}
                          disabled={filaVirtual}
                          className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">
                          {item?.producto_codigo ?? '-'}
                        </div>
                        {enDespacho && (
                          <div className="mt-1 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                            Ya agregado a despacho
                          </div>
                        )}
                        {enGrupoParcial && (
                          <div className="mt-1 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                            {filaVirtual ? 'Parcial (saldo pendiente)' : 'Parcial'}
                          </div>
                        )}
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {item?.producto_nombre ?? '-'}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 max-w-[200px]">
                      {item?.producto_descripcion || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                      {item?.producto_presentacion || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                      {item?.lote || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                      {item?.referencia ?? '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                      {item?.fecha_ingreso ? new Date(item.fecha_ingreso).toLocaleDateString('es-ES') : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 dark:text-white">
                      {item?.cantidad_bultos ?? 0}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-600 dark:text-gray-400">
                      {Number(item?.peso_adicional || 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 dark:text-white">
                      {((Number(item?.total_kg ?? 0) > 0 ? Number(item?.total_kg) : Number(item?.total_kg ?? 0) + Number(item?.peso_adicional || 0))).toFixed(2)} KG
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => !filaVirtual && handleEditar(item)}
                          disabled={filaVirtual}
                          className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => !posicion.bloqueada && handleMover(item)}
                          disabled={posicion.bloqueada}
                          className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center p-2 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title={posicion.bloqueada ? 'Posición bloqueada' : 'Mover'}
                        >
                          <Move className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => !filaVirtual && handleEliminar(item)}
                          disabled={filaVirtual}
                          className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        {!posicion.bloqueada && (
                          <button
                            type="button"
                            onClick={() => !enDespacho && setModalDespacho({ open: true, stockItem: item })}
                            disabled={enDespacho}
                            className={`min-h-[40px] min-w-[40px] inline-flex items-center justify-center p-2 rounded-lg transition-colors ${
                              enDespacho
                                ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/30 cursor-not-allowed'
                                : 'text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20'
                            }`}
                            title={enDespacho ? 'Este producto ya fue agregado a un despacho' : 'Agregar al despacho'}
                          >
                            <Truck className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                    )
                  })()
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Resumen de Posición */}
      {stock.length > 0 && (
        <div className="p-5 bg-gradient-to-r from-primary-50 to-primary-100 dark:from-primary-900/20 dark:to-primary-800/20 rounded-xl border border-primary-200 dark:border-primary-800">
          <h2 className="text-lg font-semibold text-primary-800 dark:text-primary-300 mb-4">
            Resumen de la Posición
          </h2>
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-primary-200 dark:border-primary-700">
              <div className="text-sm text-primary-600 dark:text-primary-400 mb-1">
                Total de Bultos
              </div>
              <div className="text-3xl font-bold text-primary-900 dark:text-primary-200">
                {Number(resumen.total_bultos ?? 0).toLocaleString()}
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-primary-200 dark:border-primary-700">
              <div className="text-sm text-primary-600 dark:text-primary-400 mb-1">
                Total en Kilogramos
              </div>
              <div className="text-3xl font-bold text-primary-900 dark:text-primary-200">
                {Number(resumen.total_kg ?? 0).toFixed(2)} KG
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modales */}
      <FormularioIngreso
        isOpen={showFormulario}
        onClose={handleFormularioClose}
        almacenId={almacenId}
        carrilId={carrilId}
        posicionId={posicionId}
        stockEdit={stockEditando}
        onSuccess={handleFormularioSuccess}
      />

      {stockMoviendo && (
        <ModalMoverProducto
          isOpen={!!stockMoviendo}
          onClose={handleMoverClose}
          almacenId={almacenId}
          carrilId={carrilId}
          posicionId={posicionId}
          stockId={stockMoviendo.id}
          stockItem={stockMoviendo}
          onSuccess={handleMoverSuccess}
        />
      )}

      <Modal isOpen={modalDespacho.open} onClose={() => setModalDespacho({ open: false, stockItem: null })} title="Agregar producto al despacho" size="sm">
        <div className="space-y-4">
          {modalDespacho.stockItem && (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Producto: <strong>{modalDespacho.stockItem.producto_codigo}</strong> · {modalDespacho.stockItem.cantidad_bultos} bultos · {(Number(modalDespacho.stockItem.total_kg) > 0 ? Number(modalDespacho.stockItem.total_kg) : Number(modalDespacho.stockItem.total_kg) + Number(modalDespacho.stockItem.peso_adicional || 0)).toFixed(2)} kg
            </p>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Despacho (estado Registrado)</label>
            <select value={despachoSeleccionado} onChange={(e) => setDespachoSeleccionado(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white">
              <option value="">Seleccione un despacho</option>
              {despachosRegistrados.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.tipo_salida} · {d.cliente_destino || 'Sin cliente'} · {d.referencia_salida}
                </option>
              ))}
            </select>
          </div>
          {productosRequeridosDespacho.activa && (
            <div className="text-xs px-2.5 py-2 rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200">
              OP {productosRequeridosDespacho.ordenProduccion || '-'}: solo codigos requeridos ({Array.from(productosRequeridosDespacho.codigos).join(', ')}).
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setModalDespacho({ open: false, stockItem: null })} className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 font-medium">Cancelar</button>
            <button type="button" onClick={confirmarAgregarProductoAlDespacho} disabled={!despachoSeleccionado || agregandoADespacho} className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg font-medium disabled:opacity-50">
              {agregandoADespacho ? 'Agregando...' : 'Agregar al despacho'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Mover varios productos */}
      <Modal
        isOpen={modalMoverVarios.open}
        onClose={() => !moverVariosLoading && setModalMoverVarios({ open: false, items: [] })}
        title={`Mover ${modalMoverVarios.items.length} producto(s)`}
        size="md"
      >
        <form onSubmit={handleMoverVariosSubmit} className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Se moverá la totalidad de cada producto seleccionado a la misma posición de destino.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Almacén destino <span className="text-red-500">*</span></label>
            <select
              value={moverVariosDestino.almacen_id}
              onChange={onAlmacenChangeMover}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
              disabled={moverVariosLoading || loadingDestino}
            >
              <option value="">Seleccione almacén</option>
              {almacenes.map((a) => (
                <option key={a.id} value={a.id}>{a.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Carril destino <span className="text-red-500">*</span></label>
            <select
              value={moverVariosDestino.carril_id}
              onChange={onCarrilChangeMover}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
              disabled={moverVariosLoading || loadingDestino || !moverVariosDestino.almacen_id}
            >
              <option value="">Seleccione carril</option>
              {carrilesMover.map((c) => (
                <option key={c.id} value={c.id}>Carril {c.numero_carril}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nivel destino <span className="text-red-500">*</span></label>
            <select
              value={moverVariosDestino.nivel_id}
              onChange={onNivelChangeMover}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
              disabled={moverVariosLoading || loadingDestino || !moverVariosDestino.carril_id}
            >
              <option value="">Seleccione nivel</option>
              {nivelesMover.map((n) => (
                <option key={n.id} value={n.id}>Nivel {n.numero_nivel}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Posición destino <span className="text-red-500">*</span></label>
            <select
              value={moverVariosDestino.posicion_id}
              onChange={(e) => setMoverVariosDestino((p) => ({ ...p, posicion_id: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
              disabled={moverVariosLoading || loadingDestino || !moverVariosDestino.nivel_id}
            >
              <option value="">Seleccione posición</option>
              {posicionesMover.map((p) => (
                <option key={p.id} value={p.id}>Posición {p.numero_posicion}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => !moverVariosLoading && setModalMoverVarios({ open: false, items: [] })}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={moverVariosLoading || loadingDestino || !moverVariosDestino.almacen_id || !moverVariosDestino.carril_id || !moverVariosDestino.nivel_id || !moverVariosDestino.posicion_id}
              className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg font-medium disabled:opacity-50"
            >
              {moverVariosLoading ? 'Moviendo...' : 'Mover todos'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

export default Posicion
