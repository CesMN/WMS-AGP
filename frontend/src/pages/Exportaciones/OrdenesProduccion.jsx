import React, { useState, useEffect } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Ship, Edit, Trash2, Loader2, ChevronDown, ChevronUp, Package, ExternalLink } from 'lucide-react'
import Modal from '../../components/Modal'
import PaginationBar from '../../components/PaginationBar'
import { ordenesExportacionApi } from '../../api/ordenes-exportacion'
import { clientesExportacionApi } from '../../api/clientes-exportacion'
import { clientesApi } from '../../api/clientes'
import { especiesApi } from '../../api/especies'
import { productosApi } from '../../api/productos'
import { stockApi } from '../../api/stock'
import { useConfig } from '../../contexts/ConfigContext'
import { useAuth } from '../../contexts/AuthContext'
import { traducirLoteAFecha } from '../../utils/traducirLoteAFecha'
import toast from 'react-hot-toast'
import OrdenesProduccionHeader from './ordenesProduccion/components/OrdenesProduccionHeader'
import OrdenesProduccionFilters from './ordenesProduccion/components/OrdenesProduccionFilters'
import OrdenFormModal from './ordenesProduccion/components/OrdenFormModal'
import OrdenDistribucionModal from './ordenesProduccion/components/OrdenDistribucionModal'
import {
  LB_A_KG,
  getAsignadoStockBultos,
  normalizarBultosMedio,
  nuevoRowKey,
  bultosToKg,
  contenedorRequisitoCoincideStockReal,
} from './ordenesProduccion/helpers'

const OrdenesProduccion = () => {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user, isAdmin } = useAuth()
  const soloLectura = pathname.startsWith('/produccion/ordenes-exportacion')
  const { registrosPorPagina, lotRepublicanoAnos } = useConfig()
  const [list, setList] = useState([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [clientesExportacion, setClientesExportacion] = useState([])
  const [clientesProduccion, setClientesProduccion] = useState([])
  const [especies, setEspecies] = useState([])
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroClienteExportacion, setFiltroClienteExportacion] = useState('')
  const [filtroClienteProduccion, setFiltroClienteProduccion] = useState('')
  const [filtroEspecie, setFiltroEspecie] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    numero_op: '',
    fecha_envio_op: new Date().toISOString().slice(0, 10),
    prioridad: 1,
    cliente_exportacion_id: '',
    cliente_id: '',
    especie_id: '',
    destino: '',
    estado: 'Pendiente',
    lineas: [],
    cantidad_contenedores: 1,
  })
  const [productosCliente, setProductosCliente] = useState([])
  const [stockPorProducto, setStockPorProducto] = useState({})
  const [errors, setErrors] = useState({})
  const [openProductoLine, setOpenProductoLine] = useState(null)
  const [productSearchText, setProductSearchText] = useState('')
  const [expandedOrdenId, setExpandedOrdenId] = useState(null)
  const [detalleComparativa, setDetalleComparativa] = useState(null)
  const [loadingComparativa, setLoadingComparativa] = useState(false)
  const [imputarCantidad, setImputarCantidad] = useState({})
  const [imputandoLineaId, setImputandoLineaId] = useState(null)
  const [completandoOrdenId, setCompletandoOrdenId] = useState(null)
  const [disponiblePorProducto, setDisponiblePorProducto] = useState({})
  const [detalleOrdenModalOpen, setDetalleOrdenModalOpen] = useState(false)
  const [detalleOrdenModalOrdenId, setDetalleOrdenModalOrdenId] = useState(null)
  const [detalleOrdenFull, setDetalleOrdenFull] = useState(null)
  const [loadingDetalleLinea, setLoadingDetalleLinea] = useState(false)
  const [distribDraft, setDistribDraft] = useState({})
  /** Bultos desde stock (imputados OP) repartidos por celda; mismas claves que distribDraft */
  const [distribStockDraft, setDistribStockDraft] = useState({})
  /** Por contenedor: filas { rowKey, lineaId } definidas por el usuario */
  const [distribContenedorRows, setDistribContenedorRows] = useState({})
  const [guardandoDistribId, setGuardandoDistribId] = useState(null)
  const [completandoExportId, setCompletandoExportId] = useState(null)
  const [revirtiendoExportId, setRevirtiendoExportId] = useState(null)
  const [desvinculandoAsignacionId, setDesvinculandoAsignacionId] = useState(null)
  const [embarqueModalOpen, setEmbarqueModalOpen] = useState(false)
  const [embarqueModalLoading, setEmbarqueModalLoading] = useState(false)
  const [embarqueModalData, setEmbarqueModalData] = useState(null)

  useEffect(() => {
    let cancelled = false
    const limit = registrosPorPagina || 50
    setLoading(true)
    const params = { limit, offset: Number(offset) }
    if (filtroEstado) params.estado = filtroEstado
    if (filtroClienteExportacion) params.cliente_exportacion_id = filtroClienteExportacion
    if (filtroClienteProduccion) params.cliente_id = filtroClienteProduccion
    if (filtroEspecie) params.especie_id = filtroEspecie
    ordenesExportacionApi
      .listar(params)
      .then(({ data }) => {
        if (cancelled) return
        setList(data?.data ?? data ?? [])
        setTotal(data?.total ?? 0)
      })
      .catch(() => {
        if (!cancelled) {
          toast.error('Error al cargar órdenes')
          setList([])
          setTotal(0)
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [offset, registrosPorPagina, refreshKey, filtroEstado, filtroClienteExportacion, filtroClienteProduccion, filtroEspecie])

  const expandId = searchParams.get('expand')
  useEffect(() => {
    if (!expandId || !list.length || loading) return
    const item = list.find((o) => o.id === expandId)
    if (!item) return
    let cancelled = false
    setExpandedOrdenId(expandId)
    setLoadingComparativa(true)
    setDetalleComparativa(null)
    loadComparativaData(item)
      .then(() => { if (!cancelled) setSearchParams((prev) => { const p = new URLSearchParams(prev); p.delete('expand'); return p }) })
      .catch(() => { if (!cancelled) setExpandedOrdenId(null) })
      .finally(() => { if (!cancelled) setLoadingComparativa(false) })
    return () => { cancelled = true }
  }, [expandId, list, loading])

  useEffect(() => {
    clientesExportacionApi.listar({ limit: 500 }).then(({ data }) => {
      setClientesExportacion(data?.data ?? data ?? [])
    }).catch(() => setClientesExportacion([]))
    clientesApi.listar({ limit: 500 }).then(({ data }) => {
      setClientesProduccion(data?.data ?? data ?? [])
    }).catch(() => setClientesProduccion([]))
    especiesApi.listar({ limit: 500 }).then(({ data }) => {
      setEspecies(data?.data ?? data ?? [])
    }).catch(() => setEspecies([]))
  }, [])

  const refreshLista = () => setRefreshKey((k) => k + 1)

  const loadProductosYStock = (clienteId, especieId) => {
    if (!clienteId) {
      setProductosCliente([])
      setStockPorProducto({})
      return
    }
    const params = { cliente_id: clienteId, limit: 500 }
    if (especieId) params.especie_id = especieId
    productosApi.listar(params).then(({ data }) => {
      setProductosCliente(data?.data ?? data ?? [])
    }).catch(() => setProductosCliente([]))
    stockApi.listar(params).then(({ data }) => {
      const items = data?.data ?? data ?? []
      const map = {}
      items.forEach((r) => {
        map[r.producto_id] = { bultos: Number(r.total_bultos) || 0, kg: Number(r.total_kg) || 0 }
      })
      setStockPorProducto(map)
    }).catch(() => setStockPorProducto({}))
  }

  const openCrear = () => {
    setEditando(null)
    setFormData({
      numero_op: '',
      fecha_envio_op: new Date().toISOString().slice(0, 10),
      prioridad: 1,
      cliente_exportacion_id: '',
      cliente_id: '',
      especie_id: '',
      destino: '',
      estado: 'Pendiente',
      lineas: [],
      cantidad_contenedores: 1,
    })
    setProductosCliente([])
    setStockPorProducto({})
    setErrors({})
    setModalOpen(true)
  }

  const openEditar = (item) => {
    ordenesExportacionApi.obtener(item.id).then(({ data }) => {
      setEditando(data)
      setFormData({
        numero_op: data.numero_op || '',
        fecha_envio_op: data.fecha_envio_op?.slice?.(0, 10) || new Date().toISOString().slice(0, 10),
        prioridad: Math.max(1, Number(data.prioridad) || 1),
        cliente_exportacion_id: data.cliente_exportacion_id || '',
        cliente_id: data.cliente_id || '',
        especie_id: data.especie_id || '',
        destino: data.destino || '',
        estado: data.estado || 'Pendiente',
        lineas: (data.lineas || []).map((l) => ({
          id: l.id,
          producto_id: l.producto_id,
          producto_codigo: l.producto_codigo,
          producto_nombre: l.producto_descripcion,
          cantidad_solicitada: l.cantidad_solicitada,
          cantidad_cargada: l.cantidad_cargada ?? 0,
        })),
        cantidad_contenedores: Math.max(1, Number(data.cantidad_contenedores) || 1),
      })
      loadProductosYStock(data.cliente_id, data.especie_id)
      setErrors({})
      setModalOpen(true)
    }).catch(() => toast.error('Error al cargar orden'))
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    if (name === 'cantidad_contenedores') {
      const v = parseInt(value, 10)
      setFormData((prev) => ({
        ...prev,
        cantidad_contenedores: Number.isFinite(v) ? Math.min(702, Math.max(1, v)) : 1,
      }))
      return
    }
    setFormData((prev) => ({ ...prev, [name]: value }))
    if (name === 'cliente_id' || name === 'especie_id') {
      const cid = name === 'cliente_id' ? value : formData.cliente_id
      const eid = name === 'especie_id' ? value : formData.especie_id
      loadProductosYStock(cid, eid)
      if (name === 'cliente_id') setFormData((prev) => ({ ...prev, [name]: value, lineas: [] }))
    }
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }))
  }

  const addLinea = () => {
    if (!formData.cliente_id) {
      toast.error('Seleccione primero el cliente de producción')
      return
    }
    setFormData((prev) => ({
      ...prev,
      lineas: [...prev.lineas, { producto_id: '', cantidad_solicitada: 0, cantidad_cargada: 0 }],
    }))
  }

  const updateLinea = (index, field, value) => {
    setFormData((prev) => {
      const lineas = [...prev.lineas]
      if (!lineas[index]) return prev
      lineas[index] = { ...lineas[index], [field]: value }
      return { ...prev, lineas }
    })
  }

  const removeLinea = (index) => {
    setFormData((prev) => ({
      ...prev,
      lineas: prev.lineas.filter((_, i) => i !== index),
    }))
  }

  const validate = () => {
    const newErrors = {}
    if (!formData.numero_op?.trim()) newErrors.numero_op = 'N° OP es requerido'
    if (!formData.fecha_envio_op) newErrors.fecha_envio_op = 'Fecha envío OP es requerida'
    if (formData.lineas.length === 0) newErrors.lineas = 'Agregue al menos un producto a la orden'
    const sinProducto = formData.lineas.some((l) => !l.producto_id || Number(l.cantidad_solicitada) <= 0)
    if (sinProducto) newErrors.lineas = newErrors.lineas || 'Cada línea debe tener producto y cantidad solicitada > 0'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    const payload = {
      numero_op: formData.numero_op.trim(),
      fecha_envio_op: formData.fecha_envio_op,
      prioridad: Math.max(1, parseInt(formData.prioridad, 10) || 1),
      cliente_exportacion_id: formData.cliente_exportacion_id || null,
      cliente_id: formData.cliente_id || null,
      especie_id: formData.especie_id || null,
      destino: formData.destino?.trim() || null,
      estado: formData.estado,
      cantidad_contenedores: Math.min(702, Math.max(1, parseInt(formData.cantidad_contenedores, 10) || 1)),
      lineas: formData.lineas
        .filter((l) => l.producto_id && Number(l.cantidad_solicitada) > 0)
        .map((l) => ({
          producto_id: l.producto_id,
          cantidad_solicitada: Number(l.cantidad_solicitada),
          cantidad_cargada: Number(l.cantidad_cargada) || 0,
        })),
    }
    try {
      setSaving(true)
      if (editando) {
        await ordenesExportacionApi.actualizar(editando.id, payload)
        toast.success('Orden actualizada')
        const conExceso = (payload.lineas || []).some((l) => (Number(l.cantidad_cargada) || 0) > (Number(l.cantidad_solicitada) || 0))
        if (conExceso) toast('Atención: hay líneas con cantidad cargada mayor a la solicitada.', { icon: '⚠️' })
      } else {
        await ordenesExportacionApi.crear(payload)
        toast.success('Orden creada')
      }
      setModalOpen(false)
      refreshLista()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const handleEliminar = async (item) => {
    if (!window.confirm(`¿Eliminar orden "${item.numero_op}"?`)) return
    try {
      await ordenesExportacionApi.eliminar(item.id)
      toast.success('Orden eliminada')
      refreshLista()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al eliminar')
    }
  }

  const handleCompletarOrden = async (item) => {
    const ref = window.prompt('Ingrese la referencia de embarque (obligatoria para completar la OP):', '')
    if (ref == null) return
    const referencia = String(ref).trim()
    if (!referencia) {
      toast.error('La referencia de embarque es obligatoria')
      return
    }
    try {
      setCompletandoOrdenId(item.id)
      await ordenesExportacionApi.completar(item.id, { referencia_embarque: referencia })
      toast.success('OP completada')
      refreshLista()
      if (expandedOrdenId === item.id) await loadComparativaData(item)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al completar OP')
    } finally {
      setCompletandoOrdenId(null)
    }
  }

  const loadComparativaData = async (ordenItem) => {
    const [ordenRes, stockRes, dispRes] = await Promise.all([
      ordenesExportacionApi.obtener(ordenItem.id),
      ordenItem.cliente_id ? stockApi.listar({ cliente_id: ordenItem.cliente_id, limit: 500 }) : Promise.resolve({ data: { data: [] } }),
      ordenesExportacionApi.disponibilidadProductos(ordenItem.id),
    ])
    const orden = ordenRes.data
    const stockList = stockRes.data?.data ?? stockRes.data ?? []
    const stockMap = {}
    stockList.forEach((r) => {
      stockMap[r.producto_id] = { bultos: Number(r.total_bultos) || 0, kg: Number(r.total_kg) || 0 }
    })
    const dispRows = dispRes.data?.data ?? []
    const dispMap = {}
    dispRows.forEach((r) => {
      dispMap[r.producto_id] = {
        total: Number(r.stock_bultos_total) || 0,
        reservado: Number(r.reservado_bultos) || 0,
        disponible: Number(r.disponible_bultos) || 0,
      }
    })
    setDisponiblePorProducto(dispMap)
    setDetalleComparativa({ orden, stockMap })
  }

  const toggleComparativa = async (item) => {
    if (expandedOrdenId === item.id) {
      setExpandedOrdenId(null)
      setDetalleComparativa(null)
      return
    }
    setExpandedOrdenId(item.id)
    setLoadingComparativa(true)
    setDetalleComparativa(null)
    try {
      await loadComparativaData(item)
    } catch (err) {
      toast.error('Error al cargar comparativa')
      setExpandedOrdenId(null)
    } finally {
      setLoadingComparativa(false)
    }
  }

  const syncDistribDraftFromOrden = (ord) => {
    const draft = {}
    const stockDraft = {}
    const rows = {}
    for (const c of ord.contenedores || []) {
      draft[c.id] = {}
      stockDraft[c.id] = {}
      rows[c.id] = []
      for (const row of c.contenido || []) {
        if (row.asignacion_id) continue
        const rowKey = row.id ? `cid_${row.id}` : `L_${row.linea_id}`
        rows[c.id].push({ rowKey, lineaId: row.linea_id })
        draft[c.id][rowKey] = String(Number(row.cantidad_bultos || 0))
        const st = Number(row.cantidad_bultos_stock ?? 0)
        stockDraft[c.id][rowKey] = st === 0 ? '' : String(st)
      }
    }
    setDistribDraft(draft)
    setDistribStockDraft(stockDraft)
    setDistribContenedorRows(rows)
  }

  const openDetalleOrden = async (ordenId) => {
    setDetalleOrdenModalOpen(true)
    setDetalleOrdenModalOrdenId(ordenId)
    setLoadingDetalleLinea(true)
    setDetalleOrdenFull(null)
    setDistribDraft({})
    setDistribStockDraft({})
    setDistribContenedorRows({})
    try {
      const { data: ord } = await ordenesExportacionApi.obtener(ordenId)
      setDetalleOrdenFull(ord)
      syncDistribDraftFromOrden(ord)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al cargar distribución')
      setDetalleOrdenModalOpen(false)
      setDetalleOrdenModalOrdenId(null)
    } finally {
      setLoadingDetalleLinea(false)
    }
  }

  const puedeVerDetalleEmbarque = (row) =>
    Number(row?.contenedores_despachados) > 0 ||
    Number(row?.despachos_embarque) > 0 ||
    String(row?.estado || '').trim() === 'Embarcado'

  const openEmbarqueDetalle = async (item) => {
    if (!puedeVerDetalleEmbarque(item)) return
    setEmbarqueModalOpen(true)
    setEmbarqueModalLoading(true)
    setEmbarqueModalData(null)
    try {
      const { data } = await ordenesExportacionApi.embarqueDetalle(item.id)
      setEmbarqueModalData(data)
    } catch (err) {
      toast.error(err.response?.data?.message || 'No se pudo cargar el detalle de embarque')
      setEmbarqueModalOpen(false)
    } finally {
      setEmbarqueModalLoading(false)
    }
  }

  const imputarBultosDesdeStock = async (ordenItem, lin, maxImputar) => {
    const raw = imputarCantidad[lin.id]
    const n = Number(String(raw ?? '').replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0) {
      toast.error('Indique una cantidad mayor a 0')
      return
    }
    const aplicar = normalizarBultosMedio(Math.min(n, maxImputar))
    if (aplicar <= 0) {
      toast.error('Cantidad no disponible o no aplicable')
      return
    }
    setImputandoLineaId(lin.id)
    try {
      const res = await ordenesExportacionApi.imputarDesdeStock(ordenItem.id, lin.id, {
        cantidad_bultos: aplicar,
      })
      toast.success(res.data?.mensaje || 'Cantidad imputada')
      setImputarCantidad((prev) => ({ ...prev, [lin.id]: '' }))
      refreshLista()
      await loadComparativaData(ordenItem)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al imputar')
    } finally {
      setImputandoLineaId(null)
    }
  }

  const guardarTodaDistribucion = async (ordenItem) => {
    if (!ordenItem?.id || !detalleOrdenFull?.contenedores?.length) return
    try {
      setGuardandoDistribId('ALL')
      for (const cont of detalleOrdenFull.contenedores) {
        const items = []
        for (const r of distribContenedorRows[cont.id] || []) {
          if (!r.lineaId) continue
          const n = Number(distribDraft[cont.id]?.[r.rowKey])
          if (!Number.isFinite(n) || n <= 0) continue
          const ns = Number(distribStockDraft[cont.id]?.[r.rowKey])
          const stockVal = Number.isFinite(ns) && ns >= 0 ? ns : 0
          items.push({ linea_id: r.lineaId, cantidad_bultos: n, cantidad_bultos_stock: stockVal })
        }
        await ordenesExportacionApi.guardarDistribucionContenedor(ordenItem.id, cont.id, { items })
      }
      toast.success('Distribución de la OP guardada')
      let { data: ord } = await ordenesExportacionApi.obtener(ordenItem.id)
      if (ord.distribucion_balance_ok) {
        for (const c of ord.contenedores || []) {
          if (c.despachado_at) continue
          const sum = (c.contenido || []).reduce((s, x) => s + Number(x.cantidad_bultos || 0), 0)
          if (sum > 0) {
            try {
              await ordenesExportacionApi.marcarContenedorListoExportar(ordenItem.id, c.id, { listo: true })
            } catch (_) {
              /* ignorar */
            }
          }
        }
        const r2 = await ordenesExportacionApi.obtener(ordenItem.id)
        ord = r2.data
      }
      setDetalleOrdenFull(ord)
      syncDistribDraftFromOrden(ord)
      refreshLista()
      if (detalleComparativa?.orden?.id === ordenItem.id) await loadComparativaData(ordenItem)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al guardar distribución')
    } finally {
      setGuardandoDistribId(null)
    }
  }

  const handleDesvincularLoteModal = async (lineaId, asignacionId) => {
    if (!detalleOrdenFull?.id) return
    if (!window.confirm('¿Desvincular este lote de la OP? Se reducirá la cantidad cargada en la línea.')) return
    setDesvinculandoAsignacionId(asignacionId)
    try {
      await ordenesExportacionApi.desvincularAsignacion(detalleOrdenFull.id, lineaId, asignacionId)
      toast.success('Lote desvinculado')
      const { data: ord } = await ordenesExportacionApi.obtener(detalleOrdenFull.id)
      setDetalleOrdenFull(ord)
      syncDistribDraftFromOrden(ord)
      const listItem = list.find((o) => o.id === detalleOrdenFull.id)
      if (listItem) await loadComparativaData(listItem)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al desvincular')
    } finally {
      setDesvinculandoAsignacionId(null)
    }
  }

  const agregarFilaContenedor = (contId) => {
    const cont = (detalleOrdenFull?.contenedores || []).find((c) => c.id === contId)
    if (cont?.listo_para_exportar || cont?.despachado_at) return
    const nk = nuevoRowKey()
    setDistribContenedorRows((prev) => ({
      ...prev,
      [contId]: [...(prev[contId] || []), { rowKey: nk, lineaId: null }],
    }))
    setDistribDraft((prev) => ({
      ...prev,
      [contId]: { ...(prev[contId] || {}), [nk]: '' },
    }))
    setDistribStockDraft((prev) => ({
      ...prev,
      [contId]: { ...(prev[contId] || {}), [nk]: '' },
    }))
  }

  const quitarFilaContenedor = (contId, rowKey) => {
    const cont = (detalleOrdenFull?.contenedores || []).find((c) => c.id === contId)
    if (cont?.listo_para_exportar || cont?.despachado_at) return
    setDistribContenedorRows((prev) => ({
      ...prev,
      [contId]: (prev[contId] || []).filter((r) => r.rowKey !== rowKey),
    }))
    setDistribDraft((prev) => {
      const d = { ...(prev[contId] || {}) }
      delete d[rowKey]
      return { ...prev, [contId]: d }
    })
    setDistribStockDraft((prev) => {
      const d = { ...(prev[contId] || {}) }
      delete d[rowKey]
      return { ...prev, [contId]: d }
    })
  }

  const revertirExportacionContenedor = async (ordenItem, cont) => {
    if (!ordenItem?.id || !cont?.id) return
    if (
      !window.confirm(
        '¿Revertir la referencia registrada de este contenedor?\n\nSi había un despacho de embarque pendiente (no cerrado) generado desde Listos para despacho, se eliminará. Si el embarque ya consta como despachado, debe revertirlo primero en el módulo Despachos.\n\nSolo administrador.'
      )
    )
      return
    try {
      setRevirtiendoExportId(cont.id)
      await ordenesExportacionApi.revertirExportacionContenedor(ordenItem.id, cont.id)
      toast.success('Referencia revertida')
      const { data: ord } = await ordenesExportacionApi.obtener(ordenItem.id)
      setDetalleOrdenFull(ord)
      syncDistribDraftFromOrden(ord)
      refreshLista()
      if (detalleComparativa?.orden?.id === ordenItem.id) await loadComparativaData(ordenItem)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al revertir')
    } finally {
      setRevirtiendoExportId(null)
    }
  }

  const completarExportarContenedor = async (ordenItem, cont) => {
    if (!contenedorRequisitoCoincideStockReal(cont.id, distribContenedorRows, distribDraft, distribStockDraft)) {
      toast.error('Alinee requisito y stock real en cada fila del contenedor antes de registrar la referencia')
      return
    }
    const ref = window.prompt('Referencia de embarque (sin letra del contenedor), ej. SVF001-26:')
    if (ref == null) return
    const v = String(ref).trim()
    if (!v) {
      toast.error('La referencia es obligatoria')
      return
    }
    try {
      setCompletandoExportId(cont.id)
      const res = await ordenesExportacionApi.completarExportarContenedor(ordenItem.id, cont.id, {
        referencia_exportacion: v,
      })
      toast.success(
        res.data?.message ||
          (res.data?.codigo_exportacion
            ? `Listo para despacho — ${res.data.codigo_exportacion} (referencia registrada).`
            : 'Referencia registrada')
      )
      const { data: ord } = await ordenesExportacionApi.obtener(ordenItem.id)
      setDetalleOrdenFull(ord)
      syncDistribDraftFromOrden(ord)
      refreshLista()
      if (detalleComparativa?.orden?.id === ordenItem.id) await loadComparativaData(ordenItem)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al registrar la referencia')
    } finally {
      setCompletandoExportId(null)
    }
  }

  if (loading && list.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-10 h-10 animate-spin text-primary-600" />
      </div>
    )
  }

  return (
    <div className="min-w-0 max-w-full">
      <OrdenesProduccionHeader soloLectura={soloLectura} onNuevaOrden={openCrear} />
      <OrdenesProduccionFilters
        filtroEstado={filtroEstado}
        setFiltroEstado={setFiltroEstado}
        filtroClienteExportacion={filtroClienteExportacion}
        setFiltroClienteExportacion={setFiltroClienteExportacion}
        filtroClienteProduccion={filtroClienteProduccion}
        setFiltroClienteProduccion={setFiltroClienteProduccion}
        filtroEspecie={filtroEspecie}
        setFiltroEspecie={setFiltroEspecie}
        clientesExportacion={clientesExportacion}
        clientesProduccion={clientesProduccion}
        especies={especies}
      />

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
        <div className="wms-table-scroll">
          <table className="min-w-[56rem] w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">N° OP</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Prioridad</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Fecha envío</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Cliente exportación</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Cliente producción</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Producto(s)</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Especie</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Destino</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Estado</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {list.map((item) => {
                const requeridosCont = Math.max(1, Number(item.cantidad_contenedores) || 1)
                const completadosCont = Number(item.contenedores_despachados) || 0
                const pendientesCont = Math.max(0, requeridosCont - completadosCont)
                const estadoVisual = item.estado === 'Embarcado'
                  ? 'Embarcado'
                  : (completadosCont >= requeridosCont ? 'Completo' : (item.estado || 'En producción'))
                const opBloqueadaEdicion = pendientesCont === 0
                return (
                <React.Fragment key={item.id}>
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                      <button
                        type="button"
                        onClick={() => toggleComparativa(item)}
                        className="inline-flex items-center gap-1.5 min-h-[40px] sm:min-h-0 px-1 py-1 -mx-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 text-left"
                        title="Ver comparativa pedido vs stock"
                      >
                        {expandedOrdenId === item.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        <span>{item.numero_op}</span>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm text-center">
                      <span
                        className={`inline-flex items-center justify-center min-w-8 px-2 py-0.5 rounded ${
                          Number(item.prioridad) >= 8
                            ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
                            : Number(item.prioridad) >= 4
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                        }`}
                        title={
                          Number(item.prioridad) >= 8
                            ? 'Prioridad alta'
                            : Number(item.prioridad) >= 4
                              ? 'Prioridad media'
                              : 'Prioridad baja'
                        }
                      >
                        {Math.max(1, Number(item.prioridad) || 1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{item.fecha_envio_op ? (item.fecha_envio_op.slice(0, 10) || item.fecha_envio_op) : '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{item.cliente_exportacion_nombre || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{item.cliente_produccion_nombre || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{item.productos_op || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{item.especie_nombre || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{item.destino || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        estadoVisual === 'Completo' || estadoVisual === 'Embarcado'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : estadoVisual === 'En producción'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                      }`}>
                        {estadoVisual}
                    </span>
                  </td>
                  <td className="px-3 sm:px-4 py-3 text-right align-top min-w-[9rem] sm:min-w-0">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap max-w-[12rem] sm:max-w-none ml-auto">
                        {puedeVerDetalleEmbarque(item) && (
                          <button
                            type="button"
                            onClick={() => openEmbarqueDetalle(item)}
                            className="inline-flex items-center justify-center gap-1 min-h-[40px] sm:min-h-0 px-2.5 py-2 sm:py-1 text-xs font-medium rounded-lg border border-sky-400/80 dark:border-sky-500 text-sky-800 dark:text-sky-200 bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 dark:hover:bg-sky-900/50 w-full sm:w-auto"
                            title="Despachos, guías de salida, contenedores y lotes (disponible con al menos un embarque registrado)"
                          >
                            <Ship className="w-3.5 h-3.5 shrink-0" />
                            Detalles
                          </button>
                        )}
                        {soloLectura ? (
                          <button
                            onClick={() => navigate(`/exportaciones/ordenes-produccion?expand=${item.id}`)}
                            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center p-2 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg"
                            title="Ir a esta OP en Exportaciones"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>
                        ) : (
                          <>
                            {estadoVisual !== 'Completo' && estadoVisual !== 'Embarcado' && (
                              <button
                                onClick={() => handleCompletarOrden(item)}
                                disabled={completandoOrdenId === item.id}
                                className="w-full sm:w-auto min-h-[40px] sm:min-h-0 px-3 py-2 sm:py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50"
                                title="Completar OP (requiere referencia de embarque)"
                              >
                                {completandoOrdenId === item.id ? '...' : 'Completar OP'}
                              </button>
                            )}
                            <button
                              onClick={() => openEditar(item)}
                              disabled={opBloqueadaEdicion}
                              className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
                              title={opBloqueadaEdicion ? 'La OP completa y enviada a Listos para despacho no se puede editar' : 'Editar'}
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleEliminar(item)}
                              disabled={opBloqueadaEdicion}
                              className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
                              title={opBloqueadaEdicion ? 'La OP completa y enviada a Listos para despacho no se puede eliminar' : 'Eliminar'}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expandedOrdenId === item.id && (
                    <tr key={`${item.id}-detalle`} className="bg-gray-50 dark:bg-gray-800/70">
                      <td colSpan={10} className="px-4 py-3 border-t border-b border-gray-200 dark:border-gray-600 align-top">
                        {loadingComparativa ? (
                          <div className="flex items-center gap-2 py-4 text-gray-500 dark:text-gray-400">
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span>Cargando comparativa...</span>
                          </div>
                        ) : detalleComparativa && detalleComparativa.orden.id === item.id ? (
                          <div className="text-sm">
                            <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center gap-x-4 gap-y-1 px-2 py-2 sm:py-1.5 rounded-lg bg-slate-100/90 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-600 text-[11px] text-slate-700 dark:text-slate-300">
                              <span className="font-medium text-slate-600 dark:text-slate-400">Contenedores:</span>
                              <span>Requeridos {requeridosCont}</span>
                              <span className="text-sky-700 dark:text-sky-400" title="Contenedores completados (referencia registrada)">
                                Completados {completadosCont}
                              </span>
                              <span className="text-amber-700 dark:text-amber-400" title="Contenedores pendientes por completar">
                                Pendientes {pendientesCont}
                              </span>
                              <button
                                type="button"
                                onClick={() => openDetalleOrden(item.id)}
                                className="sm:ml-auto w-full sm:w-auto min-h-[36px] sm:min-h-0 px-3 py-2 sm:py-0.5 text-[11px] font-medium bg-slate-600 hover:bg-slate-700 text-white rounded-md"
                                title="Distribución por contenedores (toda la OP)"
                              >
                                Detalles
                              </button>
                            </div>
                            <p className="font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-2 text-sm">
                              <Package className="w-4 h-4 shrink-0" />
                              Comparativa pedido vs stock (kg)
                            </p>
                            <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-1.5">
                              Bultos → kg (factor LB {LB_A_KG}).
                            </p>
                            <div className="wms-table-scroll rounded-lg border border-gray-200 dark:border-gray-600">
                              <table className="min-w-[48rem] w-full text-xs sm:text-sm">
                                <thead className="bg-gray-100 dark:bg-gray-700">
                                  <tr>
                                    <th className="px-2 py-1.5 sm:px-3 sm:py-2 text-left font-medium text-gray-600 dark:text-gray-300">Producto</th>
                                    <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">Bultos sol.</th>
                                    <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">Solicitado (kg)</th>
                                    <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">Asignado a la OP (kg)</th>
                                    <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">Stock disp. (kg)</th>
                                    <th className="px-3 py-2 text-center font-medium text-gray-600 dark:text-gray-300">Estado</th>
                                    {!soloLectura && (
                                      <th className="px-3 py-2 text-center font-medium text-gray-600 dark:text-gray-300">Agregar desde stock</th>
                                    )}
                                    <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300 min-w-[11rem]">
                                      Listo para despacho
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                                  {(detalleComparativa.orden.lineas || []).map((lin) => {
                                    const stock = detalleComparativa.stockMap[lin.producto_id]
                                    const stockKg = stock ? stock.kg : 0
                                    const formato = lin.producto_formato != null ? Number(lin.producto_formato) : 0
                                    const um = (lin.producto_unidad_medida || 'KG').toUpperCase()
                                    const solBultos = Number(lin.cantidad_solicitada) || 0
                                    const asignadoPorAsignaciones = (detalleComparativa.orden.asignaciones_orden || [])
                                      .filter((a) => String(a.linea_id) === String(lin.id))
                                      .reduce((s, a) => s + (Number(a.cantidad_total) || 0), 0)
                                    const cargBultos = Math.max(getAsignadoStockBultos(lin), asignadoPorAsignaciones)
                                    const solKg = bultosToKg(solBultos, formato, um)
                                    const cargKg = bultosToKg(cargBultos, formato, um)
                                    // "Estado" debe reflejar cobertura de la OP (asignado/imputado),
                                    // no solo disponibilidad global de stock en almacén.
                                    const cubre = cargKg >= solKg
                                    const faltaCargarKg = Math.max(0, solKg - cargKg)
                                    const faltaCargarBultos = Math.max(0, solBultos - cargBultos)
                                    const excesoBultos = cargBultos > solBultos
                                    const lineaCompletada = !!lin.completado_at
                                    const bultosDespachados = Number(lin.bultos_despachados) || 0
                                    const epsCmp = 1e-6
                                    const listoDespachoCompleto = solBultos > 0 && bultosDespachados + epsCmp >= solBultos
                                    const listoDespachoParcial = bultosDespachados > 0 && !listoDespachoCompleto
                                    const dispProd = disponiblePorProducto[lin.producto_id] || { disponible: 0 }
                                    const stockBultosDisp = Number(dispProd.disponible) || 0
                                    const maxImputar = Math.min(faltaCargarBultos, stockBultosDisp)
                                    return (
                                      <tr key={lin.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                        <td className="px-3 py-2 text-gray-900 dark:text-white">
                                          {[lin.producto_codigo, lin.producto_descripcion || lin.producto_nombre, lin.producto_presentacion].filter(Boolean).join(' – ')}
                                          <span className="ml-1 text-gray-500 dark:text-gray-400 text-xs">({formato} {um}/bulto)</span>
                                        </td>
                                        <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{solBultos}</td>
                                        <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{solKg.toFixed(2)}</td>
                                        <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">
                                          {cargKg.toFixed(2)}
                                          {excesoBultos && <span className="block text-amber-600 dark:text-amber-400 text-xs">(exceso)</span>}
                                        </td>
                                        <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{stockKg.toFixed(2)}</td>
                                        <td className="px-3 py-2 text-center">
                                          {cubre ? (
                                            <span className="text-green-600 dark:text-green-400 font-medium">Cubre</span>
                                          ) : (
                                            <span className="text-amber-600 dark:text-amber-400">Falta stock</span>
                                          )}
                                          {faltaCargarKg > 0 && !lineaCompletada && (
                                            <span className="ml-1 text-gray-500 dark:text-gray-400 text-xs">(falta cargar {faltaCargarKg.toFixed(1)} kg)</span>
                                          )}
                                        </td>
                                        {!soloLectura && (
                                          <td className="px-3 py-2 align-top">
                                            {item.estado === 'Completo' || item.estado === 'Embarcado' ? (
                                              <span className="text-gray-400 text-xs">—</span>
                                            ) : lineaCompletada ? (
                                              <span className="text-gray-400 text-xs">—</span>
                                            ) : faltaCargarBultos <= 0 ? (
                                              stockBultosDisp > 0 ? (
                                                <span className="text-[10px] text-gray-500 dark:text-gray-400">
                                                  Stock disponible: {stockBultosDisp.toFixed(2)} bultos
                                                </span>
                                              ) : null
                                            ) : stockBultosDisp <= 0 || maxImputar <= 0 ? (
                                              <span className="text-gray-400 text-xs">—</span>
                                            ) : (
                                              <div className="flex flex-wrap items-center gap-1.5 min-w-[0] max-w-[200px]">
                                                <span className="text-[10px] text-gray-500 dark:text-gray-400 w-full">
                                                  Stock real: {stockBultosDisp.toFixed(2)} bultos (requiere OP: {faltaCargarBultos.toFixed(2)})
                                                </span>
                                                <span className="text-[10px] text-indigo-600 dark:text-indigo-400 w-full">
                                                  Máximo a imputar: {maxImputar.toFixed(2)} bultos
                                                </span>
                                                <input
                                                  type="number"
                                                  min={0}
                                                  max={normalizarBultosMedio(maxImputar)}
                                                  step="0.5"
                                                  placeholder="Bultos"
                                                  disabled={imputandoLineaId === lin.id}
                                                  value={imputarCantidad[lin.id] ?? ''}
                                                  onChange={(e) => {
                                                    const raw = e.target.value
                                                    if (raw === '') {
                                                      setImputarCantidad((prev) => ({ ...prev, [lin.id]: '' }))
                                                      return
                                                    }
                                                    const parsed = Number(String(raw).replace(',', '.'))
                                                    if (!Number.isFinite(parsed)) {
                                                      setImputarCantidad((prev) => ({ ...prev, [lin.id]: raw }))
                                                      return
                                                    }
                                                    const clamped = normalizarBultosMedio(Math.min(Math.max(0, parsed), maxImputar))
                                                    setImputarCantidad((prev) => ({
                                                      ...prev,
                                                      [lin.id]: clamped > 0 ? String(clamped) : '',
                                                    }))
                                                  }}
                                                  className="w-[72px] px-1.5 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded text-right dark:bg-gray-800 dark:text-white"
                                                />
                                                <button
                                                  type="button"
                                                  onClick={() => imputarBultosDesdeStock(item, lin, maxImputar)}
                                                  disabled={imputandoLineaId === lin.id}
                                                  className="px-2 py-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded disabled:opacity-50 shrink-0"
                                                >
                                                  {imputandoLineaId === lin.id ? '…' : 'Aplicar'}
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    setImputarCantidad((prev) => ({
                                                      ...prev,
                                                      [lin.id]: maxImputar > 0 ? String(normalizarBultosMedio(maxImputar)) : '',
                                                    }))
                                                  }
                                                  disabled={imputandoLineaId === lin.id || maxImputar <= 0}
                                                  className="text-[10px] text-indigo-600 dark:text-indigo-400 underline shrink-0"
                                                  title="Usar el máximo imputable"
                                                >
                                                  Máximo
                                                </button>
                                              </div>
                                            )}
                                          </td>
                                        )}
                                        <td className="px-3 py-2 text-left align-top">
                                          <div className="space-y-1 text-[11px] text-gray-700 dark:text-gray-300">
                                            <div>
                                              <span className="text-gray-500 dark:text-gray-400">Bultos listos para despacho: </span>
                                              <span className="tabular-nums font-medium">{bultosDespachados.toFixed(2)}</span>
                                              <span className="text-gray-400"> / {solBultos}</span>
                                            </div>
                                            <div>
                                              <span className="text-gray-500 dark:text-gray-400">Ref. embarque: </span>
                                              <span className="break-words">
                                                {lin.referencia_embarque?.trim() ? lin.referencia_embarque : '—'}
                                              </span>
                                            </div>
                                            <div>
                                              {listoDespachoCompleto ? (
                                                <span className="text-green-600 dark:text-green-400 font-semibold">
                                                  Listo para despacho (completo)
                                                </span>
                                              ) : listoDespachoParcial ? (
                                                <span className="text-amber-600 dark:text-amber-400 font-semibold">
                                                  Listo para despacho en curso
                                                </span>
                                              ) : (
                                                <span className="text-gray-500 dark:text-gray-400">
                                                  Pendiente: distribución y lista en «Listos para despacho»
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                            {(detalleComparativa.orden.lineas || []).length === 0 && (
                              <p className="text-gray-500 dark:text-gray-400 py-2">Sin líneas en esta orden.</p>
                            )}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {list.length > 0 && (
        <div className="mt-4">
          <PaginationBar total={total} limit={registrosPorPagina || 50} offset={offset} onPageChange={setOffset} />
        </div>
      )}
      {list.length === 0 && !loading && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center text-gray-500 dark:text-gray-400">
          No hay órdenes de producción. Cree una para registrar pedidos de clientes.
        </div>
      )}

      <OrdenFormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        editando={editando}
        formData={formData}
        errors={errors}
        handleChange={handleChange}
        handleSubmit={handleSubmit}
        saving={saving}
        clientesExportacion={clientesExportacion}
        clientesProduccion={clientesProduccion}
        especies={especies}
        addLinea={addLinea}
        removeLinea={removeLinea}
        updateLinea={updateLinea}
        productosCliente={productosCliente}
        stockPorProducto={stockPorProducto}
        openProductoLine={openProductoLine}
        setOpenProductoLine={setOpenProductoLine}
        productSearchText={productSearchText}
        setProductSearchText={setProductSearchText}
      />

      <OrdenDistribucionModal
        isOpen={detalleOrdenModalOpen}
        onClose={() => {
          setDetalleOrdenModalOpen(false)
          setDetalleOrdenModalOrdenId(null)
          setDetalleOrdenFull(null)
          setDistribDraft({})
          setDistribStockDraft({})
          setDistribContenedorRows({})
        }}
        loadingDetalleLinea={loadingDetalleLinea}
        detalleOrdenFull={detalleOrdenFull}
        soloLectura={soloLectura}
        isAdmin={isAdmin}
        distribContenedorRows={distribContenedorRows}
        setDistribContenedorRows={setDistribContenedorRows}
        distribDraft={distribDraft}
        setDistribDraft={setDistribDraft}
        distribStockDraft={distribStockDraft}
        setDistribStockDraft={setDistribStockDraft}
        guardandoDistribId={guardandoDistribId}
        revirtiendoExportId={revirtiendoExportId}
        completandoExportId={completandoExportId}
        desvinculandoAsignacionId={desvinculandoAsignacionId}
        handleDesvincularLoteModal={handleDesvincularLoteModal}
        revertirExportacionContenedor={revertirExportacionContenedor}
        completarExportarContenedor={completarExportarContenedor}
        agregarFilaContenedor={agregarFilaContenedor}
        quitarFilaContenedor={quitarFilaContenedor}
        guardarTodaDistribucion={guardarTodaDistribucion}
      />

      <Modal
        isOpen={embarqueModalOpen}
        onClose={() => {
          setEmbarqueModalOpen(false)
          setEmbarqueModalData(null)
        }}
        title={embarqueModalData?.orden?.numero_op ? `Detalle de embarque — ${embarqueModalData.orden.numero_op}` : 'Detalle de embarque'}
        size="xl"
      >
        {embarqueModalLoading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-14 text-gray-500 dark:text-gray-400">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
            <span className="text-sm">Cargando información de embarque…</span>
          </div>
        ) : !embarqueModalData?.orden ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">Sin datos.</p>
        ) : (
          <div className="space-y-5 text-sm max-h-[min(75dvh,720px)] overflow-y-auto overflow-x-hidden pr-1 -mr-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs border-b border-gray-200 dark:border-gray-600 pb-3">
              <div>
                <span className="text-gray-500 dark:text-gray-400">Cliente exportación</span>
                <p className="font-medium text-gray-900 dark:text-white">{embarqueModalData.orden.cliente_exportacion_nombre || '—'}</p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Cliente producción</span>
                <p className="font-medium text-gray-900 dark:text-white">{embarqueModalData.orden.cliente_produccion_nombre || '—'}</p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Destino</span>
                <p>{embarqueModalData.orden.destino || '—'}</p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Especie</span>
                <p>{embarqueModalData.orden.especie_nombre || '—'}</p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">N° OP</span>
                <p className="font-mono font-semibold text-gray-900 dark:text-white">{embarqueModalData.orden.numero_op || '—'}</p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Referencia embarque / exportación</span>
                <p className="font-mono break-words">
                  {embarqueModalData.orden.referencia_embarque_resuelta?.trim() ||
                    embarqueModalData.orden.referencia_exportacion_resuelta?.trim() ||
                    '—'}
                </p>
                {(embarqueModalData.orden.referencia_exportacion_resuelta &&
                  embarqueModalData.orden.referencia_embarque_resuelta &&
                  embarqueModalData.orden.referencia_exportacion_resuelta.trim() !==
                    embarqueModalData.orden.referencia_embarque_resuelta.trim()) && (
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    Prefijo exportación:{' '}
                    <span className="font-mono">{embarqueModalData.orden.referencia_exportacion_resuelta}</span>
                  </p>
                )}
              </div>
              {embarqueModalData.resumen_embarque_op && (
                <div className="sm:col-span-2 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-600 px-3 py-2 text-[11px] text-slate-700 dark:text-slate-300">
                  <span className="font-medium text-slate-600 dark:text-slate-400">Contenedores: </span>
                  despachados {embarqueModalData.resumen_embarque_op.contenedores_despachados} /{' '}
                  {embarqueModalData.resumen_embarque_op.contenedores_requeridos}
                  {embarqueModalData.resumen_embarque_op.contenedores_pendientes > 0 && (
                    <span className="text-amber-700 dark:text-amber-400">
                      {' '}
                      (pendientes {embarqueModalData.resumen_embarque_op.contenedores_pendientes})
                    </span>
                  )}
                </div>
              )}
            </div>

            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400 mb-2 flex items-center gap-2">
                <Ship className="w-4 h-4" />
                Despachos de salida (módulo Despachos)
              </h3>
              {(embarqueModalData.despachos || []).length === 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">No hay despachos tipo Embarque vinculados a esta OP por N° OP.</p>
              ) : (
                <div className="space-y-4">
                  {embarqueModalData.despachos.map((d) => (
                    <div
                      key={d.id}
                      className="rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden bg-white dark:bg-gray-800/50"
                    >
                      <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900/60 text-xs grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                        <div>
                          <span className="text-gray-500">Fecha salida</span>
                          <p className="font-medium">
                            {d.fecha_salida
                              ? String(d.fecha_salida).slice(0, 10)
                              : '—'}
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-500">N° guía de salida</span>
                          <p className="font-mono font-medium">{d.guia_salida?.trim() || '—'}</p>
                        </div>
                        <div>
                          <span className="text-gray-500">Contenedor (despacho)</span>
                          <p>{d.contenedor?.trim() || '—'}</p>
                        </div>
                        <div>
                          <span className="text-gray-500">Estado despacho</span>
                          <p>{d.estado || '—'}</p>
                        </div>
                        <div>
                          <span className="text-gray-500">Cliente destino</span>
                          <p>{d.cliente_destino?.trim() || '—'}</p>
                        </div>
                        <div>
                          <span className="text-gray-500">Destino / país</span>
                          <p>
                            {[d.destino, d.pais_destino].filter(Boolean).join(' · ') || '—'}
                          </p>
                        </div>
                        {d.cliente_origen_nombre && (
                          <div className="sm:col-span-2">
                            <span className="text-gray-500">Cliente origen</span>
                            <p>{d.cliente_origen_nombre}</p>
                          </div>
                        )}
                        {d.observaciones?.trim() && (
                          <div className="sm:col-span-2">
                            <span className="text-gray-500">Observaciones</span>
                            <p className="whitespace-pre-wrap text-gray-700 dark:text-gray-300">{d.observaciones}</p>
                          </div>
                        )}
                        <div className="sm:col-span-2 text-gray-500">
                          Registrado por {d.usuario_nombre || '—'} · {d.updated_at ? new Date(d.updated_at).toLocaleString('es-PE') : '—'}
                        </div>
                      </div>
                      {(d.lineas || []).length > 0 && (
                        <div className="wms-table-scroll">
                          <table className="min-w-[40rem] w-full text-xs">
                            <thead>
                              <tr className="bg-gray-100 dark:bg-gray-900/80 text-left">
                                <th className="px-2 py-1.5">Producto</th>
                                <th className="px-2 py-1.5">Lote</th>
                                <th className="px-2 py-1.5">Ubicación</th>
                                <th className="px-2 py-1.5 text-right">Bultos</th>
                                <th className="px-2 py-1.5 text-right">Kg</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                              {d.lineas.map((ln) => (
                                <tr key={ln.id}>
                                  <td className="px-2 py-1.5">
                                    <span className="font-mono font-medium">{ln.producto_codigo}</span>
                                    <div className="text-gray-600 dark:text-gray-400">
                                      {[ln.producto_nombre, ln.producto_descripcion].filter(Boolean).join(' — ')}
                                    </div>
                                  </td>
                                  <td className="px-2 py-1.5 font-mono">{ln.lote || '—'}</td>
                                  <td className="px-2 py-1.5 max-w-[220px] break-words">{ln.ubicacion || '—'}</td>
                                  <td className="px-2 py-1.5 text-right tabular-nums">{ln.cantidad_bultos != null ? Number(ln.cantidad_bultos).toLocaleString('es-PE') : '—'}</td>
                                  <td className="px-2 py-1.5 text-right tabular-nums">{ln.total_kg != null ? Number(ln.total_kg).toFixed(2) : '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {d.total_kg_despacho != null && (
                        <div className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700">
                          Totales movimiento: {Number(d.total_bultos_despacho || 0).toLocaleString('es-PE')} bultos ·{' '}
                          {Number(d.total_kg_despacho || 0).toFixed(2)} kg
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400 mb-2">
                Contenedores de la OP
              </h3>
              {(embarqueModalData.contenedores || []).length === 0 ? (
                <p className="text-xs text-gray-500">Sin contenedores registrados.</p>
              ) : (
                <div className="space-y-3">
                  {embarqueModalData.contenedores.map((c) => (
                    <div
                      key={c.id}
                      className="rounded-lg border border-gray-200 dark:border-gray-600 p-3 text-xs space-y-2"
                    >
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        <span>
                          <span className="text-gray-500">Código: </span>
                          <strong>{c.codigo_exportacion || c.codigo_interno || '—'}</strong>
                        </span>
                        <span>
                          <span className="text-gray-500">Despachado (físico): </span>
                          {c.despachado_at ? new Date(c.despachado_at).toLocaleString('es-PE') : '—'}
                        </span>
                        <span>
                          <span className="text-gray-500">Exportación doc.: </span>
                          {c.exportado_at ? new Date(c.exportado_at).toLocaleString('es-PE') : '—'}
                        </span>
                      </div>
                      {(c.contenido || []).length > 0 && (
                        <ul className="list-disc list-inside text-gray-700 dark:text-gray-300">
                          {c.contenido.map((row, idx) => (
                            <li key={idx}>
                              <span className="font-mono">{row.producto_codigo}</span>
                              {' — '}
                              {row.producto_descripcion || row.producto_nombre}
                              {': '}
                              <span className="tabular-nums font-medium">{Number(row.cantidad_bultos || 0).toLocaleString('es-PE')}</span>
                              {' bultos'}
                              {Number(row.cantidad_bultos_stock || 0) > 0 && (
                                <span className="text-gray-500"> (stock {Number(row.cantidad_bultos_stock).toLocaleString('es-PE')})</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400 mb-2">
                Lotes asignados a la OP
              </h3>
              {(embarqueModalData.lotes_asignados_op || []).length === 0 ? (
                <p className="text-xs text-gray-500">Sin asignaciones por lote.</p>
              ) : (
                <div className="wms-table-scroll rounded-lg border border-gray-200 dark:border-gray-600">
                  <table className="min-w-[40rem] w-full text-xs">
                    <thead className="bg-gray-50 dark:bg-gray-900/50">
                      <tr>
                        <th className="px-2 py-1.5 text-left">Producto</th>
                        <th className="px-2 py-1.5 text-left">Lote</th>
                        <th className="px-2 py-1.5 text-left">Fecha producción</th>
                        <th className="px-2 py-1.5 text-right">Bultos</th>
                        <th className="px-2 py-1.5 text-left">Origen</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {embarqueModalData.lotes_asignados_op.map((a, idx) => (
                        <tr key={idx}>
                          <td className="px-2 py-1.5">
                            <span className="font-mono">{a.producto_codigo}</span>
                            <div className="text-gray-600 dark:text-gray-400">{a.producto_nombre}</div>
                          </td>
                          <td className="px-2 py-1.5 font-mono">{a.lote?.trim() || '—'}</td>
                          <td className="px-2 py-1.5 tabular-nums">
                            {traducirLoteAFecha(a.lote, lotRepublicanoAnos) || '—'}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{Number(a.cantidad_bultos || 0).toLocaleString('es-PE')}</td>
                          <td className="px-2 py-1.5">{a.origen || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default OrdenesProduccion
