import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Truck, Plus, Loader2, Info, Edit, Trash2, Search, ChevronRight, ChevronDown, LayoutList, MapPin } from 'lucide-react'
import Modal from '../../components/Modal'
import PaginationBar from '../../components/PaginationBar'
import ExportDropdown from '../../components/ExportDropdown'
import { despachosApi } from '../../api/despachos'
import { stockApi } from '../../api/stock'
import { almacenesApi } from '../../api/almacenes'
import { clientesApi } from '../../api/clientes'
import { especiesApi } from '../../api/especies'
import { productosApi } from '../../api/productos'
import { useConfig } from '../../contexts/ConfigContext'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'

const TIPOS_SALIDA = [
  'Embarque',
  'Venta Local',
  'Reempaque',
  'Reproceso',
  'Etiquetado',
  'Muestreo',
  'Otros',
]

const CAMPOS_POR_TIPO = {
  Embarque: ['cliente_origen_id', 'fecha_salida', 'orden_produccion', 'cliente_destino', 'pais_destino', 'contenedor', 'guia_salida', 'observaciones'],
  'Venta Local': ['cliente_origen_id', 'fecha_salida', 'destino', 'contenedor', 'guia_salida', 'observaciones'],
  Reempaque: ['cliente_origen_id', 'guia_salida', 'observaciones'],
  Reproceso: ['cliente_origen_id', 'guia_salida', 'observaciones'],
  Etiquetado: ['cliente_origen_id', 'guia_salida', 'observaciones'],
  Muestreo: ['cliente_origen_id', 'guia_salida', 'observaciones'],
  Otros: ['cliente_origen_id', 'fecha_salida', 'guia_salida', 'observaciones'],
}

const ETIQUETAS = {
  cliente_origen_id: 'Cliente de origen',
  fecha_salida: 'Fecha de salida',
  orden_produccion: 'Orden de producción',
  cliente_destino: 'Cliente de destino',
  pais_destino: 'País de destino',
  destino: 'Destino',
  contenedor: 'Contenedor',
  guia_salida: 'Guía de salida',
  observaciones: 'Observaciones',
}

const Despachos = () => {
  const { user } = useAuth()
  const { registrosPorPagina } = useConfig()
  const location = useLocation()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [lista, setLista] = useState([])
  const [totalRegistros, setTotalRegistros] = useState(0)
  const [offset, setOffset] = useState(0)
  const [clientes, setClientes] = useState([])
  const [especies, setEspecies] = useState([])
  const [productos, setProductos] = useState([])
  const [filtroFechaDesde, setFiltroFechaDesde] = useState('')
  const [filtroFechaHasta, setFiltroFechaHasta] = useState('')
  const [filtroCliente, setFiltroCliente] = useState('')
  const [filtroEspecie, setFiltroEspecie] = useState('')
  const [filtroProducto, setFiltroProducto] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [modalForm, setModalForm] = useState(false)
  const [modalDetalle, setModalDetalle] = useState(null)
  const [detalle, setDetalle] = useState(null)
  const [vistaLineasDetalle, setVistaLineasDetalle] = useState('resumida')
  const [expandidosGruposDetalle, setExpandidosGruposDetalle] = useState(new Set())
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [cambiandoEstado, setCambiandoEstado] = useState(null)
  const [reabriendo, setReabriendo] = useState(null)

  const [refreshKey, setRefreshKey] = useState(0)
  const [tipoSalida, setTipoSalida] = useState('Embarque')
  const [form, setForm] = useState({
    cliente_origen_id: '',
    fecha_salida: new Date().toISOString().slice(0, 10),
    orden_produccion: '',
    cliente_destino: '',
    pais_destino: '',
    destino: '',
    contenedor: '',
    guia_salida: '',
    observaciones: '',
  })
  const [stockLineas, setStockLineas] = useState([])
  const [filtroStockCliente, setFiltroStockCliente] = useState('')
  const [filtroStockEspecie, setFiltroStockEspecie] = useState('')
  const [filtroStockAlmacen, setFiltroStockAlmacen] = useState('')
  const [filtroStockCarril, setFiltroStockCarril] = useState('')
  const [almacenesList, setAlmacenesList] = useState([])
  const [carrilesList, setCarrilesList] = useState([])
  const [busquedaStock, setBusquedaStock] = useState('')
  const [seleccionados, setSeleccionados] = useState({})
  const [lineasDespacho, setLineasDespacho] = useState([])
  const [agregarADespachoId, setAgregarADespachoId] = useState(null)
  const [stockParaAgregar, setStockParaAgregar] = useState([])
  const [seleccionadosAgregar, setSeleccionadosAgregar] = useState({})
  const [quitarLineaLoading, setQuitarLineaLoading] = useState(null)
  const [lineasEdit, setLineasEdit] = useState({})
  const [guardandoCambios, setGuardandoCambios] = useState(false)

  useEffect(() => {
    Promise.all([
      clientesApi.listar({ limit: 500 }),
      especiesApi.listar({ limit: 500 }),
      productosApi.listar({ limit: 500 }),
    ])
      .then(([c, e, p]) => {
        setClientes(c.data?.data ?? c.data ?? [])
        setEspecies(e.data?.data ?? e.data ?? [])
        setProductos(p.data?.data ?? p.data ?? [])
      })
      .catch(() => toast.error('Error al cargar filtros (clientes, especies, productos)'))
  }, [])

  useEffect(() => {
    setOffset(0)
  }, [filtroFechaDesde, filtroFechaHasta, filtroCliente, filtroEspecie, filtroProducto, filtroEstado])

  useEffect(() => {
    let cancelled = false
    const limit = registrosPorPagina || 50
    const params = { limit, offset: Number(offset) }
    if (filtroFechaDesde) params.fecha_desde = filtroFechaDesde
    if (filtroFechaHasta) params.fecha_hasta = filtroFechaHasta
    if (filtroCliente?.trim()) params.cliente_destino = filtroCliente.trim()
    if (filtroEspecie) params.especie_id = filtroEspecie
    if (filtroProducto) params.producto_id = filtroProducto
    if (filtroEstado) params.estado = filtroEstado
    setLoading(true)
    despachosApi
      .listar(params)
      .then(({ data }) => {
        if (cancelled) return
        setLista(data?.data ?? data ?? [])
        setTotalRegistros(data?.total ?? (data?.data ?? data)?.length ?? 0)
      })
      .catch(() => {
        if (!cancelled) {
          toast.error('Error al cargar despachos')
          setLista([])
          setTotalRegistros(0)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [filtroFechaDesde, filtroFechaHasta, filtroCliente, filtroEspecie, filtroProducto, filtroEstado, offset, registrosPorPagina, refreshKey])

  const recargarDetalle = () => {
    if (modalDetalle) {
      despachosApi.obtener(modalDetalle).then((r) => setDetalle(r.data)).catch(() => setDetalle(null))
    }
  }

  useEffect(() => {
    if (modalDetalle) {
      despachosApi.obtener(modalDetalle).then((r) => setDetalle(r.data)).catch(() => setDetalle(null))
    } else setDetalle(null)
  }, [modalDetalle])

  useEffect(() => {
    const id = location.state?.openDespachoId
    if (id) {
      setModalDetalle(id)
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.state?.openDespachoId])

  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.id) setModalDetalle(e.detail.id)
    }
    window.addEventListener('abrir-detalle-despacho', handler)
    return () => window.removeEventListener('abrir-detalle-despacho', handler)
  }, [])

  useEffect(() => {
    if (detalle?.lineas) {
      setLineasEdit(detalle.lineas.reduce((acc, l) => ({
        ...acc,
        [l.id]: { cantidad_bultos: l.cantidad_bultos, peso_adicional: Number(l.peso_adicional) || 0 },
      }), {}))
    } else setLineasEdit({})
  }, [detalle?.lineas])

  useEffect(() => {
    almacenesApi.listar().then((r) => setAlmacenesList(r.data?.data ?? r.data ?? [])).catch(() => setAlmacenesList([]))
  }, [])

  useEffect(() => {
    if (filtroStockAlmacen) {
      almacenesApi.carriles(filtroStockAlmacen).then((r) => setCarrilesList(r.data?.data ?? r.data ?? [])).catch(() => setCarrilesList([]))
    } else {
      setCarrilesList([])
      setFiltroStockCarril('')
    }
  }, [filtroStockAlmacen])

  useEffect(() => {
    if (modalForm) {
      cargaStockLineas()
    }
  }, [modalForm, filtroStockCliente, filtroStockEspecie, filtroStockAlmacen, filtroStockCarril, busquedaStock])

  useEffect(() => {
    if (agregarADespachoId) {
      const params = {}
      if (filtroStockCliente) params.cliente_id = filtroStockCliente
      if (filtroStockEspecie) params.especie_id = filtroStockEspecie
      if (filtroStockAlmacen) params.almacen_id = filtroStockAlmacen
      if (filtroStockCarril) params.carril_id = filtroStockCarril
      if (busquedaStock?.trim()) params.q = busquedaStock.trim()
      stockApi.lineas(params).then((r) => setStockParaAgregar(r.data || [])).catch(() => setStockParaAgregar([]))
      setSeleccionadosAgregar({})
    }
  }, [agregarADespachoId, filtroStockCliente, filtroStockEspecie, filtroStockAlmacen, filtroStockCarril, busquedaStock])

  const cargaStockLineas = () => {
    const params = {}
    if (filtroStockCliente) params.cliente_id = filtroStockCliente
    if (filtroStockEspecie) params.especie_id = filtroStockEspecie
    if (filtroStockAlmacen) params.almacen_id = filtroStockAlmacen
    if (filtroStockCarril) params.carril_id = filtroStockCarril
    if (busquedaStock?.trim()) params.q = busquedaStock.trim()
    stockApi.lineas(params).then((r) => setStockLineas(r.data)).catch(() => setStockLineas([]))
  }

  const abrirCrear = () => {
    setEditId(null)
    setTipoSalida('Embarque')
    setForm({
      cliente_origen_id: '',
      fecha_salida: new Date().toISOString().slice(0, 10),
      orden_produccion: '',
      cliente_destino: '',
      pais_destino: '',
      destino: '',
      contenedor: '',
      guia_salida: '',
      observaciones: '',
    })
    setLineasDespacho([])
    setSeleccionados({})
    setModalForm(true)
  }

  const abrirEditar = async (id) => {
    const d = await despachosApi.obtener(id).then((r) => r.data)
    setEditId(id)
    setTipoSalida(d.tipo_salida)
    setForm({
      cliente_origen_id: d.cliente_origen_id || '',
      fecha_salida: d.fecha_salida ? d.fecha_salida.slice(0, 10) : '',
      orden_produccion: d.orden_produccion || '',
      cliente_destino: d.cliente_destino || '',
      pais_destino: d.pais_destino || '',
      destino: d.destino || '',
      contenedor: d.contenedor || '',
      guia_salida: d.guia_salida || '',
      observaciones: d.observaciones || '',
    })
    setLineasDespacho((d.lineas || []).map((l) => ({
      stock_posicion_id: l.stock_posicion_id,
      cantidad_bultos: l.cantidad_bultos,
      maxBultos: l.cantidad_bultos,
      total_kg: l.total_kg,
      stock_total_kg: l.stock_total_kg,
      saldo_kg: l.peso_adicional ?? 0,
      formato: l.formato,
      unidad_medida: l.unidad_medida || 'KG',
      codigo: l.producto_codigo,
      producto_nombre: l.producto_nombre,
      descripcion: l.producto_descripcion,
      ubicacion: l.ubicacion,
      lote: l.lote,
    })))
    setSeleccionados({})
    setModalForm(true)
  }

  const agregarSeleccionados = () => {
    const ids = Object.keys(seleccionados).filter((id) => seleccionados[id])
    const aAgregar = stockLineasVisible.filter((s) => ids.includes(s.stock_posicion_id) && !lineasDespacho.some((l) => l.stock_posicion_id === s.stock_posicion_id))
    setLineasDespacho((prev) => [...prev, ...aAgregar.map((s) => ({ ...s, cantidad_bultos: s.cantidad_bultos, maxBultos: s.cantidad_bultos, saldo_kg: s.peso_adicional ?? 0, stock_total_kg: s.total_kg }))])
    setSeleccionados({})
  }

  const quitarLinea = (stockPosicionId) => {
    setLineasDespacho((prev) => prev.filter((l) => l.stock_posicion_id !== stockPosicionId))
  }

  const cambiarCantidadLinea = (stockPosicionId, valor) => {
    const num = Math.max(0, parseInt(valor, 10) || 0)
    setLineasDespacho((prev) =>
      prev.map((l) => {
        if (l.stock_posicion_id !== stockPosicionId) return l
        const max = l.maxBultos ?? 999999
        return { ...l, cantidad_bultos: Math.min(num, max) }
      })
    )
  }

  const maxSaldoKg = (l) => {
    const stockTotal = Number(l.stock_total_kg ?? l.total_kg) || 0
    const kgBultos = kgBultosLinea(l)
    return Math.max(0, stockTotal - kgBultos)
  }

  const cambiarSaldoLinea = (stockPosicionId, valor) => {
    const num = Math.max(0, parseFloat(valor) || 0)
    setLineasDespacho((prev) =>
      prev.map((l) => {
        if (l.stock_posicion_id !== stockPosicionId) return l
        const maxS = maxSaldoKg(l)
        return { ...l, saldo_kg: Math.min(num, maxS) }
      })
    )
  }

  const enviarForm = async (e) => {
    e.preventDefault()
    const lineasPayload = lineasDespacho
      .map((l) => ({
        stock_posicion_id: l.stock_posicion_id,
        cantidad_bultos: Math.max(0, parseInt(l.cantidad_bultos, 10) || 0),
        peso_adicional: Number(l.saldo_kg) || 0,
      }))
      .filter((l) => l.cantidad_bultos > 0 || l.peso_adicional > 0)

    if (editId) {
      if (lineasPayload.length === 0) {
        toast.error('Cada línea debe tener al menos bultos o saldo (kg)')
        return
      }
    }

    const payload = {
      tipo_salida: tipoSalida,
      ...form,
      lineas: editId ? lineasPayload : [],
    }
    try {
      setSaving(true)
      if (editId) {
        await despachosApi.actualizar(editId, payload)
        toast.success('Despacho actualizado')
        setModalForm(false)
        setRefreshKey((k) => k + 1)
      } else {
        const { data } = await despachosApi.crear(payload)
        toast.success('Despacho creado. Agregue productos desde Almacenes (vista posición/nivel) o desde el detalle.')
        setModalForm(false)
        setRefreshKey((k) => k + 1)
        if (data?.id) setModalDetalle(data.id)
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const eliminar = async (id) => {
    if (!window.confirm('¿Eliminar este despacho?')) return
    try {
      await despachosApi.eliminar(id)
      toast.success('Despacho eliminado')
      setRefreshKey((k) => k + 1)
    } catch (err) {
      toast.error(err.response?.data?.message || 'No se puede eliminar')
    }
  }

  const marcarDespachado = async (id) => {
    if (!window.confirm('Al marcar como Despachado se descontará el stock. ¿Continuar?')) return
    try {
      setCambiandoEstado(id)
      await despachosApi.cambiarEstado(id, 'Despachado')
      toast.success('Los datos fueron registrados exitosamente')
      setRefreshKey((k) => k + 1)
      if (modalDetalle === id) {
        recargarDetalle()
        setModalDetalle(null)
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al cambiar estado')
    } finally {
      setCambiandoEstado(null)
    }
  }

  const reabrirDespacho = async (id) => {
    if (!window.confirm('¿Reabrir este despacho? Se devolverá el stock y podrá editarlo de nuevo. Solo un administrador puede hacer esto.')) return
    try {
      setReabriendo(id)
      await despachosApi.reabrir(id)
      toast.success('Despacho reabierto. Puede editar y volver a dar salida.')
      setRefreshKey((k) => k + 1)
      if (modalDetalle === id) {
        recargarDetalle()
      }
      window.dispatchEvent(new CustomEvent('despachos-actualizados'))
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al reabrir')
    } finally {
      setReabriendo(null)
    }
  }

  const quitarLineaDetalle = async (lineaId) => {
    if (!modalDetalle || !window.confirm('¿Quitar esta línea del despacho?')) return
    try {
      setQuitarLineaLoading(lineaId)
      await despachosApi.quitarLinea(modalDetalle, lineaId)
      toast.success('Línea quitada')
      recargarDetalle()
      setRefreshKey((k) => k + 1)
      window.dispatchEvent(new CustomEvent('despachos-actualizados'))
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al quitar la línea')
    } finally {
      setQuitarLineaLoading(null)
    }
  }

  const maxBultosLinea = (l) => (l.stock_cantidad_bultos != null ? Number(l.stock_cantidad_bultos) : 999999)
  const maxAdicionalLinea = (l) => {
    const stock = Number(l.stock_total_kg) || 0
    const formato = Number(l.formato) || 0
    const unidad = (l.unidad_medida || 'KG').toUpperCase()
    const bultos = Number(lineasEdit[l.id]?.cantidad_bultos ?? l.cantidad_bultos) || 0
    let kgBultos = bultos * formato
    if (unidad === 'LB') kgBultos = kgBultos / 2.2046
    return Math.max(0, stock - kgBultos)
  }

  const totalKgLineaDesdeEdit = (l, bultos, adicionalKg) => {
    const formato = Number(l.formato) || 0
    const unidad = (l.unidad_medida || 'KG').toUpperCase()
    let kgBultos = (Number(bultos) || 0) * formato
    if (unidad === 'LB') kgBultos = kgBultos / 2.2046
    return kgBultos + (Number(adicionalKg) || 0)
  }

  const guardarCambiosDetalle = async () => {
    if (!modalDetalle || !detalle?.lineas?.length) return
    const lineasPayload = detalle.lineas.map((l) => {
      const edit = lineasEdit[l.id]
      return {
        id: l.id,
        cantidad_bultos: edit != null ? (parseInt(edit.cantidad_bultos, 10) || 0) : (Number(l.cantidad_bultos) || 0),
        peso_adicional: edit != null ? (parseFloat(edit.peso_adicional) || 0) : (Number(l.peso_adicional) || 0),
      }
    })
    try {
      setGuardandoCambios(true)
      await despachosApi.actualizarLineas(modalDetalle, lineasPayload)
      toast.success('Cambios guardados correctamente')
      recargarDetalle()
      setRefreshKey((k) => k + 1)
      window.dispatchEvent(new CustomEvent('despachos-actualizados'))
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al guardar los cambios')
    } finally {
      setGuardandoCambios(false)
    }
  }

  const totalesDetalle = detalle?.lineas?.length
    ? detalle.lineas.reduce(
        (acc, l) => {
          const edit = lineasEdit[l.id]
          const bultos = edit != null ? (parseInt(edit.cantidad_bultos, 10) || 0) : (Number(l.cantidad_bultos) || 0)
          const adicional = edit != null ? (parseFloat(edit.peso_adicional) || 0) : (Number(l.peso_adicional) || 0)
          const totalKg = edit != null ? totalKgLineaDesdeEdit(l, edit.cantidad_bultos, edit.peso_adicional) : (Number(l.total_kg) || 0)
          return {
            bultos: acc.bultos + bultos,
            adicional: acc.adicional + adicional,
            total_kg: acc.total_kg + totalKg,
          }
        },
        { bultos: 0, adicional: 0, total_kg: 0 }
      )
    : { bultos: 0, adicional: 0, total_kg: 0 }

  const tieneCambiosSinGuardar = (detalle?.lineas || []).some((l) => {
    const edit = lineasEdit[l.id]
    if (edit == null) return false
    const origB = Number(l.cantidad_bultos) || 0
    const origA = Number(l.peso_adicional) || 0
    const editB = parseInt(edit.cantidad_bultos, 10) || 0
    const editA = parseFloat(edit.peso_adicional) || 0
    return origB !== editB || Math.abs(origA - editA) > 0.001
  })

  const confirmarAgregarProductos = async () => {
    if (!agregarADespachoId) return
    const ids = Object.keys(seleccionadosAgregar).filter((id) => seleccionadosAgregar[id])
    const yaEnDespacho = new Set((detalle?.lineas || []).map((l) => l.stock_posicion_id))
    const aAgregar = (stockParaAgregar || []).filter((s) => ids.includes(s.stock_posicion_id) && !yaEnDespacho.has(s.stock_posicion_id))
    const lineasPayload = aAgregar.map((s) => ({
      stock_posicion_id: s.stock_posicion_id,
      cantidad_bultos: Math.max(0, parseInt(s.cantidad_bultos, 10) || 0),
      peso_adicional: Number(s.peso_adicional) || 0,
    })).filter((l) => l.cantidad_bultos > 0 || l.peso_adicional > 0)
    if (lineasPayload.length === 0) {
      toast.error('Seleccione al menos un producto que no esté ya en el despacho')
      return
    }
    try {
      setSaving(true)
      await despachosApi.agregarLineas(agregarADespachoId, lineasPayload)
      toast.success('Productos agregados al despacho')
      setAgregarADespachoId(null)
      recargarDetalle()
      setRefreshKey((k) => k + 1)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al agregar productos')
    } finally {
      setSaving(false)
    }
  }

  const formatFecha = (f) => (f ? new Date(f).toLocaleDateString('es-ES') : '-')
  const FACTOR_LB_A_KG = 2.2046
  const kgBultosLinea = (l) => {
    const bultos = Number(l.cantidad_bultos) || 0
    const formato = Number(l.formato)
    const unidad = (l.unidad_medida || 'KG').toUpperCase()
    if (!formato) {
      const tot = Number(l.total_kg) || 0
      const maxB = Number(l.maxBultos) || 1
      return maxB > 0 ? (bultos / maxB) * tot : 0
    }
    let kg = bultos * formato
    if (unidad === 'LB') kg = kg / FACTOR_LB_A_KG
    return kg
  }
  const kgPorLinea = (l) => kgBultosLinea(l) + (Number(l.saldo_kg) || 0)
  const totalBultosLineas = lineasDespacho.reduce((s, l) => s + (Number(l.cantidad_bultos) || 0), 0)
  const totalKgLineas = lineasDespacho.reduce((s, l) => s + kgPorLinea(l), 0)

  // Productos almacenados: stock real; si la posición está en despacho → restar bultos y kg a dar salida.
  // Mostrar fila si queda algo: bultos restantes > 0 o kg restantes > 0 (ej. 0 bultos + saldo).
  const stockLineasVisible = stockLineas
    .map((s) => {
      const enDespacho = lineasDespacho.find((l) => l.stock_posicion_id === s.stock_posicion_id)
      const bultosEnDespacho = enDespacho ? Number(enDespacho.cantidad_bultos) : 0
      const stockBultos = Number(s.cantidad_bultos)
      const stockKg = Number(s.total_kg) || 0
      const totalSalidaKg = enDespacho ? kgPorLinea(enDespacho) : 0
      const totalKgRestante = Math.max(0, stockKg - totalSalidaKg)
      const bultosRestantes = stockBultos - bultosEnDespacho
      if (bultosRestantes <= 0 && totalKgRestante <= 0) return null
      const parcial = enDespacho != null
      if (!parcial) {
        return { ...s, cantidad_bultos: s.cantidad_bultos, total_kg: s.total_kg, parcial: false }
      }
      return {
        ...s,
        cantidad_bultos: bultosRestantes,
        total_kg: totalKgRestante,
        parcial: true,
      }
    })
    .filter(Boolean)

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <Truck className="w-8 h-8 text-primary-600" />
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Salidas</p>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Despachos</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportDropdown
            getExportConfig={() => {
              const listParams = { limit: 10000, offset: 0, fecha_desde: filtroFechaDesde || undefined, fecha_hasta: filtroFechaHasta || undefined, cliente_destino: filtroCliente?.trim() || undefined, especie_id: filtroEspecie || undefined, producto_id: filtroProducto || undefined, estado: filtroEstado || undefined }
              return {
                title: 'Despachos',
                filtersSummary: [filtroFechaDesde && 'Desde', filtroFechaHasta && 'Hasta', filtroCliente && 'Cliente', filtroEspecie && 'Especie', filtroProducto && 'Producto', filtroEstado && 'Estado'].filter(Boolean).join(', ') || 'Ninguno',
                columns: [
                  { key: 'tipo_salida', label: 'Tipo' },
                  { key: 'fecha_salida', label: 'Fecha' },
                  { key: 'cliente_destino', label: 'Cliente destino' },
                  { key: 'estado', label: 'Estado' },
                  { key: 'usuario_nombre', label: 'Usuario' },
                  { key: 'total_bultos', label: 'Bultos' },
                  { key: 'total_kg', label: 'Total KG' },
                ],
                fetchData: () => despachosApi.listar({ ...listParams }).then((r) => ({ data: r.data?.data ?? r.data ?? [] })),
                detailTitle: 'Líneas de despachos',
                detailColumns: [
                  { key: 'tipo_salida', label: 'Tipo despacho' },
                  { key: 'fecha_salida', label: 'Fecha' },
                  { key: 'cliente_destino', label: 'Cliente destino' },
                  { key: 'estado', label: 'Estado' },
                  { key: 'producto_codigo', label: 'Código producto' },
                  { key: 'producto_descripcion', label: 'Producto' },
                  { key: 'cantidad_bultos', label: 'Bultos' },
                  { key: 'total_kg', label: 'Total KG' },
                ],
                fetchDataWithDetail: async () => {
                  const { data } = await despachosApi.listar({ ...listParams, limit: 80 })
                  const list = data?.data ?? data ?? []
                  const full = await Promise.all(list.map((d) => despachosApi.obtener(d.id).then((r) => r.data)))
                  const detailRows = full.flatMap((d) => (d.lineas || []).map((lin) => ({
                    tipo_salida: d.tipo_salida,
                    fecha_salida: d.fecha_salida,
                    cliente_destino: d.cliente_destino,
                    estado: d.estado,
                    producto_codigo: lin.producto_codigo,
                    producto_descripcion: lin.producto_descripcion,
                    cantidad_bultos: lin.cantidad_bultos,
                    total_kg: lin.total_kg,
                  })))
                  return { data: list, detailRows }
                },
              }
            }}
          />
          <button type="button" onClick={abrirCrear} className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium">
            <Plus className="w-5 h-5" />
            Nuevo despacho
          </button>
        </div>
      </div>

      <div className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Filtros</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Fecha desde</label>
            <input type="date" value={filtroFechaDesde} onChange={(e) => setFiltroFechaDesde(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Fecha hasta</label>
            <input type="date" value={filtroFechaHasta} onChange={(e) => setFiltroFechaHasta(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Cliente</label>
            <input type="text" value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)} placeholder="Cliente destino" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Especie</label>
            <select value={filtroEspecie} onChange={(e) => setFiltroEspecie(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm">
              <option value="">Todas</option>
              {especies.map((e) => (
                <option key={e.id} value={e.id}>{e.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Producto</label>
            <select value={filtroProducto} onChange={(e) => setFiltroProducto(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm">
              <option value="">Todos</option>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>{p.codigo}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Estado</label>
            <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm">
              <option value="">Todos</option>
              <option value="Registrado">Registrado</option>
              <option value="Despachado">Despachado</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Fecha</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Referencia de salida</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Cliente</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Especie</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Productos</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Total bultos</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Total kg</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-48">Opciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary-600" /></td>
                </tr>
              ) : lista.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">No hay despachos.</td>
                </tr>
              ) : (
                lista.map((d) => (
                  <tr key={d.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{formatFecha(d.fecha_salida)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{d.referencia_salida}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{d.cliente_destino || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{d.especie_nombre}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 max-w-[220px]">
                      {(d.productos || []).map((p, i) => (
                        <div key={i} className="text-xs text-gray-900 dark:text-white">
                          <span className="font-medium">{p.codigo}</span>
                          {p.descripcion ? ` - ${p.descripcion.slice(0, 40)}${p.descripcion.length > 40 ? '...' : ''}` : ''}
                          {p.lote ? ` (Lote: ${p.lote})` : ''}
                        </div>
                      ))}
                      {(!d.productos || d.productos.length === 0) && '-'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">{d.total_bultos}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">{Number(d.total_kg).toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-center gap-1">
                        <button type="button" onClick={() => setModalDetalle(d.id)} className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded" title="Ver detalles"><Info className="w-4 h-4" /></button>
                        {d.estado === 'Registrado' && (
                          <>
                            <button type="button" onClick={() => abrirEditar(d.id)} className="p-2 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded" title="Editar"><Edit className="w-4 h-4" /></button>
                            <button type="button" onClick={() => eliminar(d.id)} className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded" title="Eliminar"><Trash2 className="w-4 h-4" /></button>
                          </>
                        )}
                        <span className={`px-2 py-1 rounded text-xs font-medium ${d.estado === 'Despachado' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>
                          {d.estado}
                        </span>
                        {d.estado === 'Registrado' && (
                          <button type="button" onClick={() => marcarDespachado(d.id)} disabled={cambiandoEstado === d.id} className="px-2 py-1 bg-primary-600 text-white rounded text-xs font-medium hover:bg-primary-700 disabled:opacity-50">
                            {cambiandoEstado === d.id ? '...' : 'Marcar Despachado'}
                          </button>
                        )}
                        {d.estado === 'Despachado' && user?.rol === 'Admin' && (
                          <button type="button" onClick={() => reabrirDespacho(d.id)} disabled={reabriendo === d.id} className="px-2 py-1 bg-amber-600 text-white rounded text-xs font-medium hover:bg-amber-700 disabled:opacity-50" title="Reabrir para editar (solo Admin)">
                            {reabriendo === d.id ? '...' : 'Reabrir'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && lista.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
            <PaginationBar
              total={totalRegistros}
              limit={registrosPorPagina || 50}
              offset={offset}
              onPageChange={setOffset}
            />
          </div>
        )}
      </div>

      {/* Modal Crear/Editar */}
      <Modal isOpen={modalForm} onClose={() => setModalForm(false)} title={editId ? 'Editar despacho' : 'Nuevo despacho'} size="xl">
        <form onSubmit={enviarForm} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo de salida</label>
            <select value={tipoSalida} onChange={(e) => setTipoSalida(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white" required>
              {TIPOS_SALIDA.map((t) => (<option key={t} value={t}>{t}</option>))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {(CAMPOS_POR_TIPO[tipoSalida] || []).map((campo) => (
              <div key={campo} className={campo === 'observaciones' ? 'col-span-2' : ''}>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{ETIQUETAS[campo]}</label>
                {campo === 'observaciones' ? (
                  <textarea value={form[campo] || ''} onChange={(e) => setForm((f) => ({ ...f, [campo]: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white" rows={2} />
                ) : campo === 'fecha_salida' ? (
                  <input type="date" value={form[campo] || ''} onChange={(e) => setForm((f) => ({ ...f, [campo]: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white" />
                ) : campo === 'cliente_origen_id' ? (
                  <select value={form[campo] || ''} onChange={(e) => setForm((f) => ({ ...f, [campo]: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white">
                    <option value="">Seleccione cliente de origen</option>
                    {clientes.map((c) => (<option key={c.id} value={c.id}>{c.nombre}</option>))}
                  </select>
                ) : (
                  <input type="text" value={form[campo] || ''} onChange={(e) => setForm((f) => ({ ...f, [campo]: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white" />
                )}
              </div>
            ))}
          </div>

          {editId && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Productos almacenados (seleccione y agregue)</h3>
            <div className="flex flex-wrap gap-2 mb-2">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="text" value={busquedaStock} onChange={(e) => setBusquedaStock(e.target.value)} placeholder="Código o descripción..." className="w-full pl-8 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm placeholder-gray-500 dark:placeholder-gray-400" />
              </div>
              <select value={filtroStockCliente} onChange={(e) => setFiltroStockCliente(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm">
                <option value="">Cliente</option>
                {clientes.map((c) => (<option key={c.id} value={c.id}>{c.nombre}</option>))}
              </select>
              <select value={filtroStockEspecie} onChange={(e) => setFiltroStockEspecie(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm">
                <option value="">Especie</option>
                {especies.map((e) => (<option key={e.id} value={e.id}>{e.nombre}</option>))}
              </select>
              <select value={filtroStockAlmacen} onChange={(e) => setFiltroStockAlmacen(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm">
                <option value="">Almacén</option>
                {almacenesList.map((a) => (<option key={a.id} value={a.id}>{a.nombre}</option>))}
              </select>
              <select value={filtroStockCarril} onChange={(e) => setFiltroStockCarril(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm" disabled={!filtroStockAlmacen}>
                <option value="">Carril</option>
                {carrilesList.map((c) => (<option key={c.id} value={c.id}>{c.nombre || `Carril ${c.numero_carril ?? ''}`}</option>))}
              </select>
              <button type="button" onClick={agregarSeleccionados} className="px-3 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700">Agregar seleccionados</button>
            </div>
            <div className="overflow-x-auto max-h-48 border border-gray-200 dark:border-gray-600 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/50 sticky top-0">
                  <tr>
                    <th className="px-2 py-2 w-10">
                      <input
                        type="checkbox"
                        checked={stockLineasVisible.length > 0 && stockLineasVisible.filter((s) => !lineasDespacho.some((l) => l.stock_posicion_id === s.stock_posicion_id)).every((s) => seleccionados[s.stock_posicion_id])}
                        onChange={(e) => setSeleccionados(stockLineasVisible.filter((s) => !lineasDespacho.some((l) => l.stock_posicion_id === s.stock_posicion_id)).reduce((acc, s) => ({ ...acc, [s.stock_posicion_id]: e.target.checked }), {}))}
                      />
                    </th>
                    <th className="px-2 py-2 text-left">Código</th>
                    <th className="px-2 py-2 text-left">Lote</th>
                    <th className="px-2 py-2 text-left">Cliente</th>
                    <th className="px-2 py-2 text-left">Especie</th>
                    <th className="px-2 py-2 text-left">Producto</th>
                    <th className="px-2 py-2 text-left max-w-[120px]">Descripción</th>
                    <th className="px-2 py-2 text-left">Presentación</th>
                    <th className="px-2 py-2 text-right">Bultos</th>
                    <th className="px-2 py-2 text-right">KG</th>
                    <th className="px-2 py-2 text-left">Ubicación</th>
                  </tr>
                </thead>
                <tbody>
                  {stockLineasVisible.map((s) => {
                    const yaEnDespacho = lineasDespacho.some((l) => l.stock_posicion_id === s.stock_posicion_id)
                    return (
                      <tr
                        key={s.stock_posicion_id}
                        className={`border-t border-gray-200 dark:border-gray-700 ${s.parcial ? 'bg-amber-50 dark:bg-amber-900/20' : ''}`}
                      >
                        <td className="px-2 py-1">
                          <input
                            type="checkbox"
                            disabled={yaEnDespacho}
                            checked={!!seleccionados[s.stock_posicion_id]}
                            onChange={(e) => setSeleccionados((prev) => ({ ...prev, [s.stock_posicion_id]: e.target.checked }))}
                          />
                        </td>
                        <td className="px-2 py-1 text-gray-900 dark:text-white">{s.codigo}</td>
                        <td className="px-2 py-1 text-gray-600 dark:text-gray-400">{s.lote || '-'}</td>
                        <td className="px-2 py-1 text-gray-900 dark:text-white">{s.cliente_nombre}</td>
                        <td className="px-2 py-1 text-gray-900 dark:text-white">{s.especie_nombre}</td>
                        <td className="px-2 py-1 text-gray-900 dark:text-white">{s.producto_nombre}</td>
                        <td className="px-2 py-1 max-w-[120px] truncate text-gray-700 dark:text-gray-300" title={s.descripcion}>{s.descripcion || '-'}</td>
                        <td className="px-2 py-1 text-gray-900 dark:text-white">{s.presentacion || '-'}</td>
                        <td className="px-2 py-1 text-right text-gray-900 dark:text-white">{s.cantidad_bultos}{s.parcial && <span className="text-amber-600 dark:text-amber-400 text-xs ml-1">(restante)</span>}</td>
                        <td className="px-2 py-1 text-right text-gray-900 dark:text-white">{Number(s.total_kg).toFixed(2)}</td>
                        <td className="px-2 py-1 text-xs text-gray-600 dark:text-gray-400">{s.ubicacion}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
          )}

          {editId && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Productos a dar salida</h3>
            <div className="overflow-x-auto max-h-40 border border-gray-200 dark:border-gray-600 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/50">
                  <tr>
                    <th className="px-2 py-2 text-left">Código</th>
                    <th className="px-2 py-2 text-left">Lote</th>
                    <th className="px-2 py-2 text-left">Producto</th>
                    <th className="px-2 py-2 text-left">Descripción</th>
                    <th className="px-2 py-2 text-left">Ubicación</th>
                    <th className="px-2 py-2 text-right">Bultos</th>
                    <th className="px-2 py-2 text-right">Saldo (kg)</th>
                    <th className="px-2 py-2 text-right">Total salida (kg)</th>
                    <th className="px-2 py-2 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {lineasDespacho.map((l) => (
                    <tr key={l.stock_posicion_id} className="border-t border-gray-200 dark:border-gray-700">
                      <td className="px-2 py-1 text-gray-900 dark:text-white">{l.codigo}</td>
                      <td className="px-2 py-1 text-gray-600 dark:text-gray-400">{l.lote || '-'}</td>
                      <td className="px-2 py-1 text-gray-900 dark:text-white">{l.producto_nombre}</td>
                      <td className="px-2 py-1 max-w-[150px] truncate text-gray-700 dark:text-gray-300">{l.descripcion || '-'}</td>
                      <td className="px-2 py-1 text-xs text-gray-600 dark:text-gray-400">{l.ubicacion || '-'}</td>
                      <td className="px-2 py-1 text-right">
                        <input type="number" min={0} max={l.maxBultos ?? 9999} step={1} value={typeof l.cantidad_bultos === 'number' ? l.cantidad_bultos : (l.cantidad_bultos ?? 0)} onChange={(e) => cambiarCantidadLinea(l.stock_posicion_id, e.target.value)} className="w-16 px-1 py-0.5 border rounded dark:bg-gray-700 dark:text-white text-right" title="Bultos enteros (0 si solo da salida al saldo)" />
                      </td>
                      <td className="px-2 py-1 text-right">
                        <input type="number" min={0} max={maxSaldoKg(l)} step="0.01" value={l.saldo_kg ?? 0} onChange={(e) => cambiarSaldoLinea(l.stock_posicion_id, e.target.value)} className="w-20 px-1 py-0.5 border rounded dark:bg-gray-700 dark:text-white text-right" title={`Kg adicional (máx. ${maxSaldoKg(l).toFixed(2)} kg según stock)`} />
                      </td>
                      <td className="px-2 py-1 text-right font-medium text-gray-900 dark:text-white">{kgPorLinea(l).toFixed(2)}</td>
                      <td className="px-2 py-1"><button type="button" onClick={() => quitarLinea(l.stock_posicion_id)} className="text-red-600 text-xs hover:underline">Quitar</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 flex flex-wrap gap-4 py-2 px-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-300">Elementos agregados: <strong className="text-gray-900 dark:text-white">{lineasDespacho.length}</strong></span>
              <span className="font-medium text-gray-700 dark:text-gray-300">Total bultos: <strong className="text-gray-900 dark:text-white">{totalBultosLineas}</strong></span>
              <span className="font-medium text-gray-700 dark:text-gray-300">Total kg: <strong className="text-gray-900 dark:text-white">{totalKgLineas.toFixed(2)}</strong></span>
            </div>
          </div>
          )}

          <div className="flex gap-3 pt-4">
            <button type="button" onClick={() => setModalForm(false)} className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 font-medium">Cancelar</button>
            <button type="submit" disabled={saving || (!!editId && lineasDespacho.length === 0)} className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg font-medium disabled:opacity-50 flex items-center justify-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {editId ? 'Guardar cambios' : 'Guardar despacho'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Ver detalle */}
      <Modal isOpen={!!modalDetalle} onClose={() => { setModalDetalle(null); setVistaLineasDetalle('resumida'); setExpandidosGruposDetalle(new Set()) }} title="Detalle del despacho" size="xl">
        {detalle ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-500 dark:text-gray-400">Fecha:</span> <span className="font-medium text-gray-900 dark:text-white">{formatFecha(detalle.fecha_salida)}</span></div>
              <div><span className="text-gray-500 dark:text-gray-400">Tipo:</span> <span className="font-medium text-gray-900 dark:text-white">{detalle.tipo_salida}</span></div>
              <div><span className="text-gray-500 dark:text-gray-400">Referencia:</span> <span className="font-medium text-gray-900 dark:text-white">{detalle.guia_salida || '-'}</span></div>
              <div><span className="text-gray-500 dark:text-gray-400">Estado:</span> <span className="font-medium text-gray-900 dark:text-white">{detalle.estado}</span></div>
              <div><span className="text-gray-500 dark:text-gray-400">Cliente destino:</span> <span className="font-medium text-gray-900 dark:text-white">{detalle.cliente_destino || '-'}</span></div>
              <div><span className="text-gray-500 dark:text-gray-400">Usuario:</span> <span className="font-medium text-gray-900 dark:text-white">{detalle.usuario_nombre}</span></div>
              {detalle.observaciones && <div className="col-span-2"><span className="text-gray-500 dark:text-gray-400">Observaciones:</span> <span className="font-medium text-gray-900 dark:text-white">{detalle.observaciones}</span></div>}
            </div>
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Líneas</h3>
                <button
                  type="button"
                  onClick={() => setVistaLineasDetalle((v) => (v === 'resumida' ? 'ubicacion' : 'resumida'))}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-primary-100 dark:hover:bg-primary-900/30"
                >
                  {vistaLineasDetalle === 'resumida' ? <MapPin className="w-4 h-4" /> : <LayoutList className="w-4 h-4" />}
                  {vistaLineasDetalle === 'resumida' ? 'Ver por ubicación' : 'Ver resumido por producto y lote'}
                </button>
              </div>
              <div className="mb-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-600 flex flex-wrap gap-4 text-sm">
                <span className="font-medium text-gray-700 dark:text-gray-300">Total bultos: <strong className="text-gray-900 dark:text-white">{detalle.estado === 'Despachado' && detalle.total_bultos_despacho != null ? detalle.total_bultos_despacho : totalesDetalle.bultos}</strong></span>
                <span className="font-medium text-gray-700 dark:text-gray-300">Total adicional (kg): <strong className="text-gray-900 dark:text-white">{(detalle.estado === 'Despachado' && detalle.total_adicional_despacho != null ? detalle.total_adicional_despacho : totalesDetalle.adicional).toFixed(2)}</strong></span>
                <span className="font-medium text-gray-700 dark:text-gray-300">Total kg a despachar: <strong className="text-gray-900 dark:text-white">{(detalle.estado === 'Despachado' && detalle.total_kg_despacho != null ? detalle.total_kg_despacho : totalesDetalle.total_kg).toFixed(2)}</strong></span>
              </div>
              {(detalle.lineas || []).length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 py-3">Sin productos. Agregue desde Almacenes (vista posición/nivel) o con el botón inferior.</p>
              ) : vistaLineasDetalle === 'resumida' ? (
                (() => {
                  const lineas = detalle.lineas || []
                  const byKey = {}
                  lineas.forEach((l) => {
                    const key = `${l.producto_codigo || ''}|${l.lote ?? ''}`
                    if (!byKey[key]) {
                      byKey[key] = { codigo: l.producto_codigo, descripcion: l.producto_descripcion, lote: l.lote ?? '', lineas: [] }
                    }
                    byKey[key].lineas.push(l)
                  })
                  const grupos = Object.entries(byKey).map(([key, g]) => ({
                    key,
                    ...g,
                    totalBultos: g.lineas.reduce((s, l) => s + (Number(lineasEdit[l.id]?.cantidad_bultos ?? l.cantidad_bultos) || 0), 0),
                    totalAdicional: g.lineas.reduce((s, l) => s + (Number(lineasEdit[l.id]?.peso_adicional ?? l.peso_adicional) || 0), 0),
                    totalKg: g.lineas.reduce((s, l) => {
                      const edit = lineasEdit[l.id]
                      const b = edit != null ? edit.cantidad_bultos : l.cantidad_bultos
                      const a = edit != null ? edit.peso_adicional : (l.peso_adicional ?? 0)
                      return s + (edit != null ? totalKgLineaDesdeEdit(l, b, a) : (Number(l.total_kg) || 0))
                    }, 0),
                  }))
                  return (
                    <div className="space-y-2">
                      {grupos.map((gr) => {
                        const expandido = expandidosGruposDetalle.has(gr.key)
                        const toggle = () => setExpandidosGruposDetalle((prev) => { const n = new Set(prev); if (n.has(gr.key)) n.delete(gr.key); else n.add(gr.key); return n })
                        return (
                          <div key={gr.key} className="rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 overflow-hidden">
                            <button type="button" onClick={toggle} className="w-full flex items-center justify-between gap-2 p-3 text-left hover:bg-gray-100 dark:hover:bg-gray-700/50">
                              <span className="flex items-center gap-2 font-medium text-gray-900 dark:text-white">
                                {expandido ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                {gr.codigo}{gr.descripcion ? ` — ${gr.descripcion}` : ''} {gr.lote ? `· Lote: ${gr.lote}` : ''}
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
                                      <th className="px-3 py-1.5 text-left text-xs">Ubicación</th>
                                      <th className="px-3 py-1.5 text-right text-xs">Bultos</th>
                                      <th className="px-3 py-1.5 text-right text-xs">Peso adj.</th>
                                      <th className="px-3 py-1.5 text-right text-xs">Total kg</th>
                                      {detalle.estado === 'Registrado' && <th className="px-3 py-1.5 w-20 text-xs">Acciones</th>}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {gr.lineas.map((l) => {
                                      const edit = lineasEdit[l.id]
                                      const bultosVal = edit ? edit.cantidad_bultos : l.cantidad_bultos
                                      const adicionalVal = edit != null ? edit.peso_adicional : (l.peso_adicional ?? 0)
                                      const totalKgMostrar = edit != null ? totalKgLineaDesdeEdit(l, bultosVal, adicionalVal) : (Number(l.total_kg) || 0)
                                      return (
                                        <tr key={l.id} className="border-t border-gray-100 dark:border-gray-700">
                                          <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-xs">{l.ubicacion}</td>
                                          <td className="px-3 py-1.5 text-right">
                                            {detalle.estado === 'Registrado' ? (
                                              <input type="number" min={0} max={maxBultosLinea(l)} value={bultosVal} onChange={(e) => setLineasEdit((prev) => ({ ...prev, [l.id]: { ...prev[l.id], cantidad_bultos: e.target.value, peso_adicional: prev[l.id]?.peso_adicional ?? adicionalVal } }))} className="w-14 px-1 py-0.5 border rounded bg-white dark:bg-gray-700 text-right text-xs" />
                                            ) : <span>{l.cantidad_bultos}</span>}
                                          </td>
                                          <td className="px-3 py-1.5 text-right">
                                            {detalle.estado === 'Registrado' ? (
                                              <input type="number" min={0} max={maxAdicionalLinea(l)} step="0.01" value={adicionalVal} onChange={(e) => setLineasEdit((prev) => ({ ...prev, [l.id]: { ...prev[l.id], cantidad_bultos: prev[l.id]?.cantidad_bultos ?? bultosVal, peso_adicional: e.target.value } }))} className="w-16 px-1 py-0.5 border rounded bg-white dark:bg-gray-700 text-right text-xs" />
                                            ) : <span>{Number(l.peso_adicional || 0).toFixed(2)}</span>}
                                          </td>
                                          <td className="px-3 py-1.5 text-right font-medium">{Number(totalKgMostrar).toFixed(2)}</td>
                                          {detalle.estado === 'Registrado' && (
                                            <td className="px-3 py-1.5">
                                              <button type="button" onClick={() => quitarLineaDetalle(l.id)} disabled={quitarLineaLoading === l.id} className="text-red-600 dark:text-red-400 hover:underline text-xs">Quitar</button>
                                            </td>
                                          )}
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })()
              ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-600">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-900/50">
                      <tr>
                        <th className="px-3 py-2 text-left">Producto</th>
                        <th className="px-3 py-2 text-left">Lote</th>
                        <th className="px-3 py-2 text-right">Bultos</th>
                        <th className="px-3 py-2 text-right">Peso adj. (kg)</th>
                        <th className="px-3 py-2 text-right">Total (kg)</th>
                        <th className="px-3 py-2 text-left">Ubicación</th>
                        {detalle.estado === 'Registrado' && <th className="px-3 py-2 w-28">Acciones</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {(detalle.lineas || []).map((l) => {
                        const edit = lineasEdit[l.id]
                        const bultosVal = edit ? edit.cantidad_bultos : l.cantidad_bultos
                        const adicionalVal = edit != null ? edit.peso_adicional : (l.peso_adicional ?? 0)
                        const totalKgMostrar = edit != null
                          ? totalKgLineaDesdeEdit(l, bultosVal, adicionalVal)
                          : (l.formato !== undefined && l.formato !== null
                            ? totalKgLineaDesdeEdit(l, l.cantidad_bultos, l.peso_adicional ?? 0)
                            : (Number(l.total_kg) || 0))
                        return (
                          <tr key={l.id}>
                            <td className="px-3 py-2"><span className="font-medium text-gray-900 dark:text-white">{l.producto_codigo}</span>
                            {l.producto_descripcion && <span className="text-gray-700 dark:text-gray-300"> - {l.producto_descripcion}</span>}</td>
                            <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{l.lote || '-'}</td>
                            <td className="px-3 py-2 text-right">
                              {detalle.estado === 'Registrado' ? (
                                <input
                                  type="number"
                                  min={0}
                                  max={maxBultosLinea(l)}
                                  value={bultosVal}
                                  onChange={(e) => setLineasEdit((prev) => ({ ...prev, [l.id]: { ...prev[l.id], cantidad_bultos: e.target.value, peso_adicional: prev[l.id]?.peso_adicional ?? adicionalVal } }))}
                                  className="w-16 px-1 py-0.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-right text-sm"
                                />
                              ) : (
                                <span className="text-gray-900 dark:text-white">{l.cantidad_bultos}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {detalle.estado === 'Registrado' ? (
                                <input
                                  type="number"
                                  min={0}
                                  max={maxAdicionalLinea(l)}
                                  step="0.01"
                                  value={adicionalVal}
                                  onChange={(e) => setLineasEdit((prev) => ({ ...prev, [l.id]: { ...prev[l.id], cantidad_bultos: prev[l.id]?.cantidad_bultos ?? bultosVal, peso_adicional: e.target.value } }))}
                                  className="w-20 px-1 py-0.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-right text-sm"
                                />
                              ) : (
                                <span className="text-gray-700 dark:text-gray-300">{Number(l.peso_adicional || 0).toFixed(2)}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-white">{Number(totalKgMostrar).toFixed(2)}</td>
                            <td className="px-3 py-2 text-gray-600 dark:text-gray-400 text-xs">{l.ubicacion}</td>
                            {detalle.estado === 'Registrado' && (
                              <td className="px-3 py-2">
                                <button type="button" onClick={() => quitarLineaDetalle(l.id)} disabled={quitarLineaLoading === l.id} className="text-red-600 dark:text-red-400 hover:underline text-xs disabled:opacity-50">
                                  {quitarLineaLoading === l.id ? '...' : 'Quitar'}
                                </button>
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {detalle.estado === 'Registrado' && (
              <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                <button type="button" onClick={guardarCambiosDetalle} disabled={guardandoCambios || (detalle.lineas || []).length === 0} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
                  {guardandoCambios ? 'Guardando...' : 'Guardar cambios'}
                </button>
                <button type="button" onClick={() => setAgregarADespachoId(modalDetalle)} className="px-4 py-2 bg-gray-600 dark:bg-gray-500 text-white rounded-lg text-sm font-medium hover:bg-gray-700 dark:hover:bg-gray-600">
                  Agregar productos
                </button>
                <button type="button" onClick={() => marcarDespachado(modalDetalle)} disabled={cambiandoEstado === modalDetalle || (detalle.lineas || []).length === 0 || tieneCambiosSinGuardar} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50" title={tieneCambiosSinGuardar ? 'Guardar los cambios de cantidades antes de dar salida' : ''}>
                  {cambiandoEstado === modalDetalle ? '...' : 'Dar salida'}
                </button>
              </div>
            )}
            {detalle.estado === 'Despachado' && user?.rol === 'Admin' && (
              <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                <button type="button" onClick={() => reabrirDespacho(modalDetalle)} disabled={reabriendo === modalDetalle} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50" title="Reabrir para editar (solo Admin)">
                  {reabriendo === modalDetalle ? 'Reabriendo...' : 'Reabrir despacho'}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-primary-600 animate-spin" /></div>
        )}
      </Modal>

      {/* Modal Agregar productos al despacho */}
      <Modal isOpen={!!agregarADespachoId} onClose={() => setAgregarADespachoId(null)} title="Agregar productos al despacho" size="xl">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" value={busquedaStock} onChange={(e) => setBusquedaStock(e.target.value)} placeholder="Código o descripción..." className="w-full pl-8 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm placeholder-gray-500 dark:placeholder-gray-400" />
            </div>
            <select value={filtroStockCliente} onChange={(e) => setFiltroStockCliente(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm">
              <option value="">Cliente</option>
              {clientes.map((c) => (<option key={c.id} value={c.id}>{c.nombre}</option>))}
            </select>
            <select value={filtroStockEspecie} onChange={(e) => setFiltroStockEspecie(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm">
              <option value="">Especie</option>
              {especies.map((e) => (<option key={e.id} value={e.id}>{e.nombre}</option>))}
            </select>
            <select value={filtroStockAlmacen} onChange={(e) => setFiltroStockAlmacen(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm" title="Filtrar por almacén">
              <option value="">Almacén</option>
              {almacenesList.map((a) => (<option key={a.id} value={a.id}>{a.nombre}</option>))}
            </select>
            <select value={filtroStockCarril} onChange={(e) => setFiltroStockCarril(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm" title="Filtrar por carril" disabled={!filtroStockAlmacen}>
              <option value="">Carril</option>
              {carrilesList.map((c) => (<option key={c.id} value={c.id}>{c.nombre || `Carril ${c.numero_carril ?? c.numero_carril}`}</option>))}
            </select>
          </div>
          <div className="overflow-x-auto max-h-64 border border-gray-200 dark:border-gray-600 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50 sticky top-0">
                <tr>
                  <th className="px-2 py-2 w-10">
                    <input
                      type="checkbox"
                      checked={(stockParaAgregar || []).filter((s) => !(detalle?.lineas || []).some((l) => l.stock_posicion_id === s.stock_posicion_id)).length > 0 && (stockParaAgregar || []).filter((s) => !(detalle?.lineas || []).some((l) => l.stock_posicion_id === s.stock_posicion_id)).every((s) => seleccionadosAgregar[s.stock_posicion_id])}
                      onChange={(e) => {
                        const disponibles = (stockParaAgregar || []).filter((s) => !(detalle?.lineas || []).some((l) => l.stock_posicion_id === s.stock_posicion_id))
                        setSeleccionadosAgregar(disponibles.reduce((acc, s) => ({ ...acc, [s.stock_posicion_id]: e.target.checked }), {}))
                      }}
                    />
                  </th>
                  <th className="px-2 py-2 text-left text-gray-700 dark:text-gray-300">Código</th>
                  <th className="px-2 py-2 text-left text-gray-700 dark:text-gray-300">Lote</th>
                  <th className="px-2 py-2 text-left text-gray-700 dark:text-gray-300">Producto</th>
                  <th className="px-2 py-2 text-left text-gray-700 dark:text-gray-300">Descripción</th>
                  <th className="px-2 py-2 text-left text-gray-700 dark:text-gray-300">Presentación</th>
                  <th className="px-2 py-2 text-right text-gray-700 dark:text-gray-300">Bultos</th>
                  <th className="px-2 py-2 text-right text-gray-700 dark:text-gray-300">Peso adj. (kg)</th>
                  <th className="px-2 py-2 text-right text-gray-700 dark:text-gray-300">KG</th>
                  <th className="px-2 py-2 text-left text-gray-700 dark:text-gray-300">Ubicación</th>
                </tr>
              </thead>
              <tbody>
                {(stockParaAgregar || []).map((s) => {
                  const lineaEnDespacho = (detalle?.lineas || []).find((l) => l.stock_posicion_id === s.stock_posicion_id)
                  const parcial = !!lineaEnDespacho
                  const bultosRestante = parcial ? Math.max(0, (Number(s.cantidad_bultos) || 0) - (Number(lineaEnDespacho.cantidad_bultos) || 0)) : (Number(s.cantidad_bultos) || 0)
                  const kgRestante = parcial ? Math.max(0, (Number(s.total_kg) || 0) - (Number(lineaEnDespacho.total_kg) || 0)) : (Number(s.total_kg) || 0)
                  const pesoAdjRestante = parcial ? Math.max(0, (Number(s.peso_adicional) || 0) - (Number(lineaEnDespacho.peso_adicional) || 0)) : (Number(s.peso_adicional) || 0)
                  return (
                    <tr
                      key={s.stock_posicion_id}
                      className={`border-t border-gray-200 dark:border-gray-700 ${parcial ? 'bg-amber-50 dark:bg-amber-900/20' : ''}`}
                    >
                      <td className="px-2 py-1">
                        {parcial ? (
                          <span className="text-amber-600 dark:text-amber-400 text-xs" title="Parte en despacho; edite la cantidad en el detalle para agregar más">—</span>
                        ) : (
                          <input type="checkbox" checked={!!seleccionadosAgregar[s.stock_posicion_id]} onChange={(e) => setSeleccionadosAgregar((prev) => ({ ...prev, [s.stock_posicion_id]: e.target.checked }))} />
                        )}
                      </td>
                      <td className="px-2 py-1 font-medium text-gray-900 dark:text-white">{s.codigo}</td>
                      <td className="px-2 py-1 text-gray-600 dark:text-gray-400">{s.lote || '-'}</td>
                      <td className="px-2 py-1 text-gray-900 dark:text-white">{s.producto_nombre || s.descripcion || '-'}</td>
                      <td className="px-2 py-1 text-gray-600 dark:text-gray-400 max-w-[180px] truncate" title={s.descripcion || ''}>{s.descripcion || '-'}</td>
                      <td className="px-2 py-1 text-gray-600 dark:text-gray-400">{s.presentacion || '-'}</td>
                      <td className="px-2 py-1 text-right text-gray-900 dark:text-white">
                        {parcial ? <span>{bultosRestante} <span className="text-amber-600 dark:text-amber-400 text-xs">(restante)</span></span> : s.cantidad_bultos}
                      </td>
                      <td className="px-2 py-1 text-right text-gray-900 dark:text-white">
                        {parcial ? <span>{pesoAdjRestante.toFixed(2)} <span className="text-amber-600 dark:text-amber-400 text-xs">(restante)</span></span> : Number(s.peso_adicional || 0).toFixed(2)}
                      </td>
                      <td className="px-2 py-1 text-right text-gray-900 dark:text-white">
                        {parcial ? <span>{kgRestante.toFixed(2)} <span className="text-amber-600 dark:text-amber-400 text-xs">(restante)</span></span> : Number(s.total_kg).toFixed(2)}
                      </td>
                      <td className="px-2 py-1 text-xs text-gray-600 dark:text-gray-400">{s.ubicacion}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setAgregarADespachoId(null)} className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 font-medium">Cancelar</button>
            <button type="button" onClick={confirmarAgregarProductos} disabled={saving} className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg font-medium disabled:opacity-50 flex items-center justify-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Agregar seleccionados al despacho
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default Despachos
