import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Fragment } from 'react'
import { Download, Plus, Loader2, Package, ChevronDown, ChevronRight, Eye, Pencil, Trash2, FileCheck, Clock, Truck, ClipboardCheck, FileText, FileSpreadsheet } from 'lucide-react'
import Modal from '../../components/Modal'
import ExportMatrixModal from '../../components/ExportMatrixModal'
import PaginationBar from '../../components/PaginationBar'
import { ingresosMpApi } from '../../api/ingresos-mp'
import { especiesApi } from '../../api/especies'
import { clientesApi } from '../../api/clientes'
import { useConfig } from '../../contexts/ConfigContext'
import { useAuth } from '../../contexts/AuthContext'
import { traducirLoteAFecha } from '../../utils/traducirLoteAFecha'
import {
  DESCARGA_WINCHAS_EXPORT_COLUMNS,
  buildDescargaLoteExportRows,
  exportDescargaLoteWinchasExcel,
  exportDescargaLoteWinchasPdf,
  exportDescargaWinchasExcel,
  exportDescargaWinchasPdf,
} from '../../utils/descargaMpExport'
import toast from 'react-hot-toast'

const DescargaMateriaPrima = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { registrosPorPagina, lotRepublicanoAnos, nombreEmpresa } = useConfig()
  const { isAdmin } = useAuth()
  const [list, setList] = useState([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [vehiculos, setVehiculos] = useState([])
  const [especies, setEspecies] = useState([])
  const [clientes, setClientes] = useState([])
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroLote, setFiltroLote] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [expandedWinchas, setExpandedWinchas] = useState(null)
  const [modalFase1Open, setModalFase1Open] = useState(false)
  const [modalWinchaOpen, setModalWinchaOpen] = useState(false)
  const [modalDetallesOpen, setModalDetallesOpen] = useState(false)
  const [detallesData, setDetallesData] = useState(null)
  const [editandoDescarga, setEditandoDescarga] = useState(null)
  const [descargaSeleccionada, setDescargaSeleccionada] = useState(null)
  const [editandoWincha, setEditandoWincha] = useState(null)
  const [saving, setSaving] = useState(false)
  const [openExportLote, setOpenExportLote] = useState(false)
  const [preparandoExportLote, setPreparandoExportLote] = useState(false)
  const [exportandoLote, setExportandoLote] = useState(null)
  const [exportLoteOrientation, setExportLoteOrientation] = useState('landscape')
  const [loteExportRows, setLoteExportRows] = useState([])
  const [loteExportDetalles, setLoteExportDetalles] = useState([])
  const [loteExportCodigo, setLoteExportCodigo] = useState('')
  const [formFase1, setFormFase1] = useState({
    vehiculo_lote_id: '',
    numero_guia_interna: '',
    fecha_descarga: new Date().toISOString().slice(0, 10),
    especie_id: '',
    cliente_id: '',
    ruc_proveedor: '',
    proveedor_razon_social: '',
    desembarcadero: '',
    origen: '',
    placas_vehiculo: '',
    ruc_transportista: '',
    datos_chofer: '',
  })
  const [formWincha, setFormWincha] = useState({
    numero_wincha: '',
    numero_guia_remitente: '',
    hora_inicio: '',
    hora_final: '',
    matricula_embarcacion: '',
    nombre_embarcacion: '',
    peso_kg: '',
    peso_por_caja: '',
    cajas: '',
    pesos_clasificacion: [],
  })
  const [errors, setErrors] = useState({})
  const [descargaDetalleParaWincha, setDescargaDetalleParaWincha] = useState(null)

  useEffect(() => {
    let cancelled = false
    ingresosMpApi.vehiculosListar({ limit: 500 }).then(({ data }) => {
      if (!cancelled) setVehiculos(data?.data ?? data ?? [])
    }).catch(() => { if (!cancelled) setVehiculos([]) })
    especiesApi.listar().then(({ data }) => {
      if (!cancelled) setEspecies(Array.isArray(data) ? data : data?.data ?? [])
    }).catch(() => { if (!cancelled) setEspecies([]) })
    clientesApi.listar().then(({ data }) => {
      if (!cancelled) setClientes(Array.isArray(data) ? data : data?.data ?? [])
    }).catch(() => { if (!cancelled) setClientes([]) })
    return () => { cancelled = true }
  }, [])

  const lotesOpciones = Array.from(
    new Map((vehiculos || []).map((v) => [v.lote_produccion_id, { id: v.lote_produccion_id, codigo: v.lote_codigo, estado: v.lote_estado }])).values()
  ).filter((l) => !!l.id)

  const lotesActivos = lotesOpciones.filter((l) => l.estado === 'Iniciado' || l.estado === 'En proceso')

  useEffect(() => {
    if (filtroLote) return
    if (lotesActivos.length === 0) return
    setFiltroLote(lotesActivos[0].id)
  }, [filtroLote, lotesActivos])

  useEffect(() => {
    let cancelled = false
    const limit = registrosPorPagina || 50
    setLoading(true)
    const params = { limit, offset: Number(offset) }
    if (filtroLote) params.lote_produccion_id = filtroLote
    if (filtroEstado) params.estado = filtroEstado
    ingresosMpApi
      .descargasListar(params)
      .then(({ data }) => {
        if (cancelled) return
        setList(data?.data ?? data ?? [])
        setTotal(data?.total ?? 0)
      })
      .catch(() => {
        if (!cancelled) {
          toast.error('Error al cargar descargas')
          setList([])
          setTotal(0)
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [offset, registrosPorPagina, refreshKey, filtroEstado, filtroLote])

  const descargaIdFromUrl = searchParams.get('descarga_id')
  useEffect(() => {
    if (!descargaIdFromUrl || list.length === 0) return
    const found = list.find((item) => String(item.id) === String(descargaIdFromUrl))
    if (found) {
      setExpandedId(descargaIdFromUrl)
      ingresosMpApi.descargaObtener(descargaIdFromUrl).then(({ data }) => setExpandedWinchas(data.winchas || [])).catch(() => setExpandedWinchas([]))
    }
  }, [descargaIdFromUrl, list])

  const vehiculoIdFromUrl = searchParams.get('vehiculo_id')
  useEffect(() => {
    if (!vehiculoIdFromUrl || !vehiculos.length) return
    const v = vehiculos.find((x) => x.id === vehiculoIdFromUrl)
    if (v) {
      setFormFase1((prev) => ({
        ...prev,
        vehiculo_lote_id: v.id,
        placas_vehiculo: v.placas || '',
        proveedor_razon_social: v.proveedor_nombre || '',
        ruc_proveedor: v.proveedor_ruc || '',
        especie_id: v.especie_id || '',
        cliente_id: v.cliente_id || '',
        origen: v.origen || '',
      }))
      setModalFase1Open(true)
      setSearchParams({}) 
    }
  }, [vehiculoIdFromUrl, vehiculos])

  const refreshLista = () => setRefreshKey((k) => k + 1)

  const openNuevaDescarga = () => {
    setEditandoDescarga(null)
    setFormFase1({
      vehiculo_lote_id: '',
      numero_guia_interna: '',
      fecha_descarga: new Date().toISOString().slice(0, 10),
      especie_id: '',
      cliente_id: '',
      ruc_proveedor: '',
      proveedor_razon_social: '',
      desembarcadero: '',
      origen: '',
      placas_vehiculo: '',
      ruc_transportista: '',
      datos_chofer: '',
    })
    setErrors({})
    setModalFase1Open(true)
  }

  const openAgregarWincha = async (descarga) => {
    setDescargaSeleccionada(descarga)
    setEditandoWincha(null)
    setFormWincha({
      numero_wincha: '',
      numero_guia_remitente: '',
      hora_inicio: '',
      hora_final: '',
      matricula_embarcacion: '',
      nombre_embarcacion: '',
      peso_kg: '',
      peso_por_caja: '',
      cajas: '',
      pesos_clasificacion: [],
    })
    setErrors({})
    setDescargaDetalleParaWincha(null)
    setModalWinchaOpen(true)
    try {
      const { data } = await ingresosMpApi.descargaObtener(descarga.id)
      setDescargaDetalleParaWincha(data)
      if (data.especie_tipo_descarga === 'clasificacion' && Array.isArray(data.especie_clasificaciones) && data.especie_clasificaciones.length > 0) {
        setFormWincha((prev) => ({
          ...prev,
          pesos_clasificacion: data.especie_clasificaciones.map((c) => ({ clasificacion_id: c.id, clasificacion_codigo: c.codigo, clasificacion_nombre: c.nombre ?? c.codigo, peso_kg: '' })),
        }))
      }
    } catch {
      toast.error('Error al cargar detalle de descarga')
    }
  }

  const openEditarWincha = async (wincha, descarga) => {
    setDescargaSeleccionada(descarga)
    setEditandoWincha(wincha)
    const toTime = (v) => {
      if (v == null) return ''
      if (typeof v === 'string' && v.length >= 5) return v.slice(0, 5)
      if (typeof v === 'object' && v.toTimeString) return v.toTimeString().slice(0, 5)
      return ''
    }
    setFormWincha({
      numero_wincha: wincha.numero_wincha || '',
      numero_guia_remitente: wincha.numero_guia_remitente || '',
      hora_inicio: toTime(wincha.hora_inicio),
      hora_final: toTime(wincha.hora_final),
      matricula_embarcacion: wincha.matricula_embarcacion || '',
      nombre_embarcacion: wincha.nombre_embarcacion || '',
      peso_kg: wincha.peso_kg ?? '',
      peso_por_caja: wincha.peso_por_caja ?? '',
      cajas: wincha.cajas ?? '',
      pesos_clasificacion: Array.isArray(wincha.pesos_clasificacion) && wincha.pesos_clasificacion.length > 0
        ? wincha.pesos_clasificacion.map((p) => ({ clasificacion_id: p.clasificacion_id, clasificacion_codigo: p.clasificacion_codigo, clasificacion_nombre: p.clasificacion_nombre ?? p.clasificacion_codigo, peso_kg: p.peso_kg != null ? p.peso_kg : '' }))
        : [],
    })
    setErrors({})
    setDescargaDetalleParaWincha(null)
    setModalWinchaOpen(true)
    try {
      const { data } = await ingresosMpApi.descargaObtener(descarga.id)
      setDescargaDetalleParaWincha(data)
      if (data.especie_tipo_descarga === 'clasificacion' && Array.isArray(data.especie_clasificaciones) && data.especie_clasificaciones.length > 0) {
        const existingByClasif = (Array.isArray(wincha.pesos_clasificacion) ? wincha.pesos_clasificacion : []).reduce((acc, p) => { acc[p.clasificacion_id] = p.peso_kg; return acc }, {})
        setFormWincha((prev) => ({
          ...prev,
          peso_por_caja: '',
          cajas: '',
          pesos_clasificacion: data.especie_clasificaciones.map((c) => ({
            clasificacion_id: c.id,
            clasificacion_codigo: c.codigo,
            clasificacion_nombre: c.nombre ?? c.codigo,
            peso_kg: existingByClasif[c.id] ?? '',
          })),
        }))
      }
    } catch {
      toast.error('Error al cargar detalle de descarga')
    }
  }

  const handleEliminarWincha = async (wincha, descarga) => {
    if (!window.confirm(`¿Eliminar la wincha "${wincha.numero_wincha || wincha.id}"?`)) return
    try {
      await ingresosMpApi.winchaEliminar(wincha.id)
      toast.success('Wincha eliminada')
      if (expandedId === descarga.id) {
        const { data } = await ingresosMpApi.descargaObtener(descarga.id)
        setExpandedWinchas(data.winchas || [])
      }
      if (modalDetallesOpen && detallesData && detallesData.id === descarga.id) {
        const { data } = await ingresosMpApi.descargaObtener(descarga.id)
        setDetallesData(data)
      }
      refreshLista()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al eliminar')
    }
  }

  const recargarWinchasExpandidas = async () => {
    if (expandedId) {
      try {
        const { data } = await ingresosMpApi.descargaObtener(expandedId)
        setExpandedWinchas(data.winchas || [])
      } catch { setExpandedWinchas([]) }
    }
  }

  const toggleExpand = async (item) => {
    if (expandedId === item.id) {
      setExpandedId(null)
      setExpandedWinchas(null)
      return
    }
    setExpandedId(item.id)
    try {
      const { data } = await ingresosMpApi.descargaObtener(item.id)
      setExpandedWinchas(data.winchas || [])
    } catch {
      setExpandedWinchas([])
    }
  }

  const openDetalles = async (item) => {
    try {
      const { data } = await ingresosMpApi.descargaObtener(item.id)
      setDetallesData(data)
      setModalDetallesOpen(true)
    } catch {
      toast.error('Error al cargar detalles')
    }
  }

  const openEditarDescarga = async (item) => {
    try {
      const { data } = await ingresosMpApi.descargaObtener(item.id)
      setFormFase1({
        vehiculo_lote_id: data.vehiculo_lote_id,
        numero_guia_interna: data.numero_guia_interna || '',
        fecha_descarga: data.fecha_descarga ? String(data.fecha_descarga).slice(0, 10) : new Date().toISOString().slice(0, 10),
        especie_id: data.especie_id || '',
        cliente_id: data.cliente_id || '',
        ruc_proveedor: data.ruc_proveedor || '',
        proveedor_razon_social: data.proveedor_razon_social || '',
        desembarcadero: data.desembarcadero || '',
        origen: data.origen || '',
        placas_vehiculo: data.placas_vehiculo || data.vehiculo_placas || '',
        ruc_transportista: data.ruc_transportista || '',
        datos_chofer: data.datos_chofer || '',
      })
      setEditandoDescarga(data)
      setErrors({})
      setModalFase1Open(true)
    } catch {
      toast.error('Error al cargar descarga')
    }
  }

  const handleEliminarDescarga = async (item) => {
    if (!window.confirm(`¿Eliminar la descarga con guía interna "${item.numero_guia_interna || item.id}"? Se eliminarán también las winchas asociadas.`)) return
    try {
      await ingresosMpApi.descargaEliminar(item.id)
      toast.success('Descarga eliminada')
      if (expandedId === item.id) setExpandedId(null)
      refreshLista()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al eliminar')
    }
  }

  const handleChangeFase1 = (e) => {
    const { name, value } = e.target
    setFormFase1((prev) => ({ ...prev, [name]: value }))
    if (name === 'vehiculo_lote_id') {
      const v = vehiculos.find((x) => x.id === value)
      if (v) setFormFase1((prev) => ({
        ...prev,
        placas_vehiculo: v.placas || '',
        proveedor_razon_social: v.proveedor_nombre || '',
        ruc_proveedor: v.proveedor_ruc || '',
        especie_id: v.especie_id || '',
        cliente_id: v.cliente_id || '',
        origen: v.origen || '',
      }))
    }
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }))
  }

  const handleChangeWincha = (e) => {
    const { name, value } = e.target
    setFormWincha((prev) => {
      const next = { ...prev, [name]: value }
      if (name === 'peso_kg' || name === 'peso_por_caja') {
        const p = name === 'peso_kg' ? Number(value) : Number(prev.peso_kg)
        const pc = name === 'peso_por_caja' ? Number(value) : Number(prev.peso_por_caja)
        if (p > 0 && pc > 0 && !Number.isNaN(p) && !Number.isNaN(pc)) {
          next.cajas = String(Math.round(p / pc))
        }
      }
      return next
    })
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }))
  }

  const setPesoClasificacion = (index, value) => {
    setFormWincha((prev) => ({
      ...prev,
      pesos_clasificacion: (prev.pesos_clasificacion || []).map((pc, i) => (i === index ? { ...pc, peso_kg: value } : pc)),
    }))
  }

  const buscarEmbarcacionPorMatricula = () => {
    const mat = formWincha.matricula_embarcacion?.trim()
    if (!mat) return
    ingresosMpApi
      .embarcacionPorMatricula(mat)
      .then(({ data }) => {
        if (data?.nombre) setFormWincha((prev) => ({ ...prev, nombre_embarcacion: data.nombre }))
      })
      .catch(() => {})
  }

  const validateFase1 = () => {
    const newErrors = {}
    if (!editandoDescarga && !formFase1.vehiculo_lote_id) newErrors.vehiculo_lote_id = 'Seleccione el vehículo'
    if (!formFase1.fecha_descarga) newErrors.fecha_descarga = 'Fecha de descarga es requerida'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmitFase1 = async (e) => {
    e.preventDefault()
    if (!validateFase1()) return
    try {
      setSaving(true)
      const payload = {
        numero_guia_interna: formFase1.numero_guia_interna || null,
        fecha_descarga: formFase1.fecha_descarga,
        especie_id: formFase1.especie_id || null,
        cliente_id: formFase1.cliente_id || null,
        ruc_proveedor: formFase1.ruc_proveedor || null,
        proveedor_razon_social: formFase1.proveedor_razon_social || null,
        desembarcadero: formFase1.desembarcadero || null,
        origen: formFase1.origen || null,
        placas_vehiculo: formFase1.placas_vehiculo || null,
        ruc_transportista: formFase1.ruc_transportista || null,
        datos_chofer: formFase1.datos_chofer || null,
      }
      if (editandoDescarga) {
        await ingresosMpApi.descargaActualizar(editandoDescarga.id, payload)
        toast.success('Descarga actualizada')
      } else {
        await ingresosMpApi.descargaCrear({
          vehiculo_lote_id: formFase1.vehiculo_lote_id,
          ...payload,
        })
        toast.success('Descarga registrada (estado: Descargando). Agregue winchas por embarcación.')
      }
      setModalFase1Open(false)
      setEditandoDescarga(null)
      refreshLista()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const handleSubmitWincha = async (e) => {
    e.preventDefault()
    if (!descargaSeleccionada) return
    try {
      setSaving(true)
      if (formWincha.matricula_embarcacion?.trim() && formWincha.nombre_embarcacion?.trim()) {
        try {
          await ingresosMpApi.embarcacionRegistrar({
            matricula: formWincha.matricula_embarcacion.trim(),
            nombre: formWincha.nombre_embarcacion.trim(),
          })
        } catch (_) { /* ya existe o error; continuar con guardar wincha */ }
      }
      const payload = {
        numero_wincha: formWincha.numero_wincha || null,
        numero_guia_remitente: formWincha.numero_guia_remitente || null,
        hora_inicio: formWincha.hora_inicio || null,
        hora_final: formWincha.hora_final || null,
        matricula_embarcacion: formWincha.matricula_embarcacion || null,
        nombre_embarcacion: formWincha.nombre_embarcacion || null,
        peso_kg: formWincha.peso_kg !== '' ? Number(formWincha.peso_kg) : null,
        peso_por_caja: descargaDetalleParaWincha?.especie_tipo_descarga === 'clasificacion' ? null : (formWincha.peso_por_caja !== '' ? Number(formWincha.peso_por_caja) : null),
        cajas: descargaDetalleParaWincha?.especie_tipo_descarga === 'clasificacion' ? null : (formWincha.cajas !== '' ? parseInt(formWincha.cajas, 10) : null),
      }
      if (descargaDetalleParaWincha?.especie_tipo_descarga === 'clasificacion' && Array.isArray(formWincha.pesos_clasificacion) && formWincha.pesos_clasificacion.length > 0) {
        payload.pesos_clasificacion = formWincha.pesos_clasificacion
          .filter((pc) => pc.clasificacion_id && (pc.peso_kg !== '' && pc.peso_kg != null))
          .map((pc) => ({ clasificacion_id: pc.clasificacion_id, peso_kg: Number(pc.peso_kg) }))
      }
      if (editandoWincha) {
        await ingresosMpApi.winchaActualizar(editandoWincha.id, payload)
        toast.success('Wincha actualizada')
      } else {
        await ingresosMpApi.winchaCrear(descargaSeleccionada.id, payload)
        toast.success('Wincha agregada')
      }
      setModalWinchaOpen(false)
      setDescargaSeleccionada(null)
      setEditandoWincha(null)
      await recargarWinchasExpandidas()
      if (modalDetallesOpen && detallesData) {
        const { data } = await ingresosMpApi.descargaObtener(detallesData.id)
        setDetallesData(data)
      }
      refreshLista()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al guardar wincha')
    } finally {
      setSaving(false)
    }
  }

  const marcarCompletado = async (descarga) => {
    try {
      await ingresosMpApi.descargaActualizar(descarga.id, { estado: 'Completado' })
      toast.success('Descarga marcada como completada')
      refreshLista()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error')
    }
  }

  const reabrirDescarga = async (descarga) => {
    if (!window.confirm('¿Reabrir esta descarga? Volverá a estado Descargando y podrá editarla. Solo un administrador puede hacer esto.')) return
    try {
      await ingresosMpApi.descargaActualizar(descarga.id, { estado: 'Descargando' })
      toast.success('Descarga reabierta')
      setModalDetallesOpen(false)
      setDetallesData(null)
      refreshLista()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al reabrir')
    }
  }

  const totalDescargadoVisibleKg = list.reduce((acc, item) => acc + (Number(item.total_descargado) || 0), 0)

  const loteExportColumns = DESCARGA_WINCHAS_EXPORT_COLUMNS.map((c) => ({ key: c.key, label: c.label }))

  const prepararExportResumenLote = async () => {
    if (!filtroLote) {
      toast.error('Seleccione un lote para exportar su resumen')
      return
    }
    setPreparandoExportLote(true)
    try {
      // Todo el lote: no se filtra por estado.
      const { data } = await ingresosMpApi.descargasListar({
        lote_produccion_id: filtroLote,
        limit: 500,
        offset: 0,
      })
      const descargas = data?.data ?? data ?? []
      if (!Array.isArray(descargas) || descargas.length === 0) {
        toast.error('No hay descargas en el lote seleccionado')
        return
      }
      const detalles = await Promise.all(
        descargas.map((d) => ingresosMpApi.descargaObtener(d.id).then((r) => r.data).catch(() => null))
      )
      const detailsOk = detalles.filter(Boolean)
      const rows = buildDescargaLoteExportRows(detailsOk)
      if (rows.length === 0) {
        toast.error('No hay winchas para exportar en el lote seleccionado')
        return
      }
      const lote = lotesOpciones.find((l) => String(l.id) === String(filtroLote))
      setLoteExportCodigo(lote?.codigo || '—')
      setLoteExportDetalles(detailsOk)
      setLoteExportRows(rows)
      setOpenExportLote(true)
    } catch {
      toast.error('Error al preparar exportación del lote')
    } finally {
      setPreparandoExportLote(false)
    }
  }

  const exportarLoteExcel = () => {
    if (!loteExportDetalles.length) return
    setExportandoLote('excel')
    try {
      exportDescargaLoteWinchasExcel(loteExportDetalles, { loteCodigo: loteExportCodigo })
      toast.success('Excel del lote descargado')
    } catch {
      toast.error('No se pudo exportar Excel del lote')
    } finally {
      setExportandoLote(null)
    }
  }

  const exportarLotePdf = () => {
    if (!loteExportDetalles.length) return
    setExportandoLote('pdf')
    try {
      exportDescargaLoteWinchasPdf(loteExportDetalles, {
        loteCodigo: loteExportCodigo,
        appName: nombreEmpresa,
        orientation: exportLoteOrientation,
      })
      toast.success('PDF del lote descargado')
    } catch {
      toast.error('No se pudo exportar PDF del lote')
    } finally {
      setExportandoLote(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-10 h-10 animate-spin text-primary-600" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Download className="w-8 h-8 text-[var(--color-primary,#2563eb)]" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Descarga de materia prima</h1>
        </div>
        <button
          onClick={openNuevaDescarga}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium"
        >
          <Plus className="w-5 h-5" />
          Nueva descarga (vehículo)
        </button>
      </div>

      <div className="mb-4 flex gap-2 items-center flex-wrap">
        <label className="text-sm text-gray-600 dark:text-gray-400">Lote:</label>
        <select
          value={filtroLote}
          onChange={(e) => setFiltroLote(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg bg-white text-gray-900"
        >
          <option value="">Todos</option>
          {lotesOpciones.map((l) => (
            <option key={l.id} value={l.id}>
              {l.codigo} ({l.estado || '—'})
            </option>
          ))}
        </select>
        <label className="text-sm text-gray-600 dark:text-gray-400">Estado:</label>
        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg bg-white text-gray-900"
        >
          <option value="">Todos</option>
          <option value="Descargando">Descargando</option>
          <option value="Completado">Completado</option>
        </select>
        <button
          type="button"
          onClick={prepararExportResumenLote}
          disabled={!filtroLote || preparandoExportLote}
          className="inline-flex items-center gap-2 px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          title="Exporta el resumen completo de winchas del lote seleccionado"
        >
          {preparandoExportLote ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Resumen lote (PDF/Excel)
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600 overflow-hidden shadow-sm">
        <div className="wms-table-scroll">
        <table className="min-w-[76rem] w-full divide-y divide-gray-200 dark:divide-gray-600">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="w-10 px-2 py-3"></th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Guía interna</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Fecha</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Cliente</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Especie</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Total descargado (kg)</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Placas</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Lote</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Estado</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Validación</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-600 bg-white dark:bg-gray-800">
            {list.map((item) => (
              <Fragment key={item.id}>
                <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <td className="px-2 py-2">
                    <button type="button" onClick={() => toggleExpand(item)} className="p-1 rounded text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 hover:text-gray-900 dark:hover:text-white" aria-label="Expandir">
                      {expandedId === item.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{item.numero_guia_interna || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{item.fecha_descarga ? String(item.fecha_descarga).slice(0, 10) : '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{item.cliente_nombre || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{item.especie_nombre || '—'}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">{item.total_descargado != null ? Number(item.total_descargado).toFixed(2) : '0.00'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{item.placas_vehiculo || item.vehiculo_placas || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{item.lote_codigo}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs rounded-full ${item.estado === 'Completado' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'}`}>
                      {item.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center" title={item.validated_at ? 'Descarga validada' : 'Pendiente de validación'}>
                    {item.validated_at ? (
                      <FileCheck className="w-5 h-5 text-green-600 dark:text-green-400 mx-auto" aria-label="Validado" />
                    ) : (
                      <Clock className="w-5 h-5 text-amber-500 dark:text-amber-400 mx-auto" aria-label="Pendiente" />
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex items-center gap-0.5">
                      {item.vehiculo_lote_id && (
                        <button onClick={() => navigate(`/ingresos-mp/vehiculos?vehiculo_id=${item.vehiculo_lote_id}`)} className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg" title="Ir a vehículo">
                          <Truck className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={() => navigate(`/ingresos-mp/validacion-descargas?descarga_id=${item.id}`)} className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg" title="Ir a validación">
                        <ClipboardCheck className="w-4 h-4" />
                      </button>
                      <button onClick={() => openDetalles(item)} className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg" title="Ver detalles">
                        <Eye className="w-4 h-4" />
                      </button>
                      {item.estado !== 'Completado' && (
                        <>
                          <button onClick={() => openEditarDescarga(item)} className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg" title="Editar">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleEliminarDescarga(item)} className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg" title="Eliminar">
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => openAgregarWincha(item)} className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg" title="Agregar wincha (embarcación)">
                            <Package className="w-4 h-4" />
                          </button>
                          <button onClick={() => marcarCompletado(item)} className="px-2 py-1 text-xs bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/60">Completar</button>
                        </>
                      )}
                      {item.estado === 'Completado' && isAdmin() && (
                        <button onClick={() => reabrirDescarga(item)} className="px-2 py-1 text-xs bg-amber-600 text-white rounded-lg hover:bg-amber-700" title="Reabrir descarga (solo Admin)">Reabrir</button>
                      )}
                    </span>
                  </td>
                </tr>
                {expandedId === item.id && (
                  <tr key={`${item.id}-winchas`}>
                    <td colSpan={11} className="px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-600">
                      <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Winchas ({Array.isArray(expandedWinchas) ? expandedWinchas.length : 0})</div>
                      {expandedWinchas && expandedWinchas.length > 0 ? (
                        <>
                          <table className="min-w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
                            <thead className="bg-gray-100 dark:bg-gray-700">
                              <tr>
                                <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-200">N° wincha</th>
                                <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-200">Guía remitente</th>
                                <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-200">Embarcación</th>
                                <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-200">Matrícula</th>
                                <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-200">Hora inicio / final</th>
                                <th className="px-3 py-2 text-right text-gray-700 dark:text-gray-200">Peso (kg)</th>
                                <th className="px-3 py-2 text-right text-gray-700 dark:text-gray-200">Cajas</th>
                                {item.estado !== 'Completado' && (
                                  <th className="px-3 py-2 text-right text-gray-700 dark:text-gray-200">Acciones</th>
                                )}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                              {expandedWinchas.map((w) => (
                                <tr key={w.id} className="border-t border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100">
                                  <td className="px-3 py-2">{w.numero_wincha || '—'}</td>
                                  <td className="px-3 py-2">{w.numero_guia_remitente || '—'}</td>
                                  <td className="px-3 py-2">{w.nombre_embarcacion || '—'}</td>
                                  <td className="px-3 py-2">{w.matricula_embarcacion || '—'}</td>
                                  <td className="px-3 py-2">{w.hora_inicio || '—'} / {w.hora_final || '—'}</td>
                                  <td className="px-3 py-2 text-right">{w.peso_kg != null ? w.peso_kg : '—'}</td>
                                  <td className="px-3 py-2 text-right">{w.cajas != null ? w.cajas : '—'}</td>
                                  {item.estado !== 'Completado' && (
                                    <td className="px-3 py-2 text-right">
                                      <span className="inline-flex items-center gap-0.5">
                                        <button type="button" onClick={() => openEditarWincha(w, item)} className="p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 rounded" title="Editar wincha">
                                          <Pencil className="w-4 h-4" />
                                        </button>
                                        <button type="button" onClick={() => handleEliminarWincha(w, item)} className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/20 rounded" title="Eliminar wincha">
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </span>
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-gray-100 dark:bg-gray-700 font-semibold text-gray-900 dark:text-gray-100">
                              <tr>
                                <td colSpan={5} className="px-3 py-2 text-right">Total:</td>
                                <td className="px-3 py-2 text-right">{expandedWinchas.reduce((s, w) => s + (Number(w.peso_kg) || 0), 0).toFixed(2)}</td>
                                <td className="px-3 py-2 text-right">{expandedWinchas.reduce((s, w) => s + (Number(w.cajas) || 0), 0)}</td>
                                {item.estado !== 'Completado' && <td></td>}
                              </tr>
                            </tfoot>
                          </table>
                        </>
                      ) : (
                        <p className="text-gray-500 dark:text-gray-400">Sin winchas registradas.</p>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {list.length > 0 && (
        <div className="mt-4 px-4 py-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-gray-500 dark:text-gray-400">
              Total descargado (filtro actual):
            </span>
            <span className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
              {totalDescargadoVisibleKg.toFixed(2)} kg
            </span>
          </div>
          <PaginationBar total={total} limit={registrosPorPagina || 50} offset={offset} onPageChange={setOffset} />
        </div>
      )}
      {list.length === 0 && !loading && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600 p-12 text-center text-gray-500 dark:text-gray-400">
          No hay descargas. Registre un vehículo en descarga desde «Nueva descarga».
        </div>
      )}

      <Modal isOpen={modalFase1Open} onClose={() => { setModalFase1Open(false); setEditandoDescarga(null) }} title={editandoDescarga ? 'Editar descarga' : 'Registrar descarga (vehículo)'} size="lg">
        <form onSubmit={handleSubmitFase1} className="space-y-4">
          {!editandoDescarga && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Vehículo (lote) *</label>
              <select name="vehiculo_lote_id" value={formFase1.vehiculo_lote_id} onChange={handleChangeFase1} className={`w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white ${errors.vehiculo_lote_id ? 'border-red-500' : 'border-gray-300'}`}>
                <option value="">Seleccione</option>
                {vehiculos.map((v) => (
                  <option key={v.id} value={v.id}>{v.placas} – {v.lote_codigo} (Orden: {v.numero_orden})</option>
                ))}
              </select>
              {errors.vehiculo_lote_id && <p className="mt-1 text-sm text-red-600">{errors.vehiculo_lote_id}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha descarga *</label>
              <input type="date" name="fecha_descarga" value={formFase1.fecha_descarga} onChange={handleChangeFase1} className={`w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white ${errors.fecha_descarga ? 'border-red-500' : 'border-gray-300'}`} />
              {errors.fecha_descarga && <p className="mt-1 text-sm text-red-600">{errors.fecha_descarga}</p>}
            </div>
          </div>
          )}
          {editandoDescarga && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha descarga *</label>
              <input type="date" name="fecha_descarga" value={formFase1.fecha_descarga} onChange={handleChangeFase1} className={`w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white ${errors.fecha_descarga ? 'border-red-500' : 'border-gray-300'}`} />
              {errors.fecha_descarga && <p className="mt-1 text-sm text-red-600">{errors.fecha_descarga}</p>}
            </div>
          </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">N° guía interna</label>
              <input name="numero_guia_interna" value={formFase1.numero_guia_interna} onChange={handleChangeFase1} className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Origen</label>
              <input name="origen" value={formFase1.origen} onChange={handleChangeFase1} className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Especie</label>
              <select name="especie_id" value={formFase1.especie_id} onChange={handleChangeFase1} className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg">
                <option value="">Seleccione</option>
                {especies.map((e) => (
                  <option key={e.id} value={e.id}>{e.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cliente</label>
              <select name="cliente_id" value={formFase1.cliente_id} onChange={handleChangeFase1} className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg">
                <option value="">Seleccione</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">RUC proveedor</label>
              <input name="ruc_proveedor" value={formFase1.ruc_proveedor} onChange={handleChangeFase1} className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Proveedor (razón social)</label>
              <input name="proveedor_razon_social" value={formFase1.proveedor_razon_social} onChange={handleChangeFase1} className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Desembarcadero</label>
              <input name="desembarcadero" value={formFase1.desembarcadero} onChange={handleChangeFase1} className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Origen</label>
              <input name="origen" value={formFase1.origen} onChange={handleChangeFase1} className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Placas vehículo</label>
              <input name="placas_vehiculo" value={formFase1.placas_vehiculo} onChange={handleChangeFase1} className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">RUC transportista</label>
              <input name="ruc_transportista" value={formFase1.ruc_transportista} onChange={handleChangeFase1} className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Datos del chofer</label>
            <textarea name="datos_chofer" value={formFase1.datos_chofer} onChange={handleChangeFase1} rows={2} className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg" />
          </div>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={() => setModalFase1Open(false)} className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Registrar descarga
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={modalWinchaOpen} onClose={() => { setModalWinchaOpen(false); setDescargaSeleccionada(null); setEditandoWincha(null) }} title={editandoWincha ? 'Editar wincha' : 'Agregar wincha (embarcación)'} size="md">
        {descargaSeleccionada && (
          <form onSubmit={handleSubmitWincha} className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">Vehículo: {descargaSeleccionada.placas_vehiculo || descargaSeleccionada.vehiculo_placas} – Guía: {descargaSeleccionada.numero_guia_interna || '—'}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">N° wincha</label>
                <input name="numero_wincha" value={formWincha.numero_wincha} onChange={handleChangeWincha} className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">N° guía remitente (por embarcación)</label>
                <input name="numero_guia_remitente" value={formWincha.numero_guia_remitente} onChange={handleChangeWincha} className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Matrícula embarcación</label>
                <input name="matricula_embarcacion" value={formWincha.matricula_embarcacion} onChange={handleChangeWincha} onBlur={buscarEmbarcacionPorMatricula} className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg" placeholder="Al salir se completa el nombre si está registrada" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre embarcación</label>
                <input name="nombre_embarcacion" value={formWincha.nombre_embarcacion} onChange={handleChangeWincha} className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Hora inicio</label>
                <input type="time" name="hora_inicio" value={formWincha.hora_inicio} onChange={handleChangeWincha} className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Hora final</label>
                <input type="time" name="hora_final" value={formWincha.hora_final} onChange={handleChangeWincha} className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Peso (kg)</label>
                <input type="number" step="any" name="peso_kg" value={formWincha.peso_kg} onChange={handleChangeWincha} className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Peso por caja</label>
                <input type="number" step="any" name="peso_por_caja" value={formWincha.peso_por_caja} onChange={handleChangeWincha} disabled={descargaDetalleParaWincha?.especie_tipo_descarga === 'clasificacion'} className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cajas</label>
                <input type="number" name="cajas" value={formWincha.cajas} onChange={handleChangeWincha} disabled={descargaDetalleParaWincha?.especie_tipo_descarga === 'clasificacion'} className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed" />
              </div>
            </div>
            {descargaDetalleParaWincha?.especie_tipo_descarga === 'clasificacion' && Array.isArray(formWincha.pesos_clasificacion) && formWincha.pesos_clasificacion.length > 0 && (
              <div className="rounded-lg border border-amber-200 dark:border-amber-800 p-3 bg-amber-50/50 dark:bg-amber-900/10">
                <h4 className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-2">Pesos por clasificación (kg)</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {formWincha.pesos_clasificacion.map((pc, index) => (
                    <div key={pc.clasificacion_id || index}>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">{pc.clasificacion_nombre || pc.clasificacion_codigo || `Clasificación ${index + 1}`}</label>
                      <input type="number" step="any" min="0" value={pc.peso_kg} onChange={(e) => setPesoClasificacion(index, e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg text-sm" />
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-3 pt-4">
              <button type="button" onClick={() => { setModalWinchaOpen(false); setDescargaSeleccionada(null); setEditandoWincha(null); setDescargaDetalleParaWincha(null) }} className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Cancelar</button>
              <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {editandoWincha ? 'Guardar' : 'Agregar wincha'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal isOpen={modalDetallesOpen} onClose={() => { setModalDetallesOpen(false); setDetallesData(null) }} title="Detalles de la descarga" size="lg">
        {detallesData && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><span className="text-gray-500 dark:text-gray-400">Guía interna:</span> {detallesData.numero_guia_interna || '—'}</div>
              <div><span className="text-gray-500 dark:text-gray-400">Fecha:</span> {detallesData.fecha_descarga ? String(detallesData.fecha_descarga).slice(0, 10) : '—'}</div>
              <div><span className="text-gray-500 dark:text-gray-400">Cliente:</span> {detallesData.cliente_nombre || '—'}</div>
              <div><span className="text-gray-500 dark:text-gray-400">Especie:</span> {detallesData.especie_nombre || '—'}</div>
              <div><span className="text-gray-500 dark:text-gray-400">Placas:</span> {detallesData.placas_vehiculo || detallesData.vehiculo_placas || '—'}</div>
              <div>
                {(() => {
                  const fechaTradLote = traducirLoteAFecha(detallesData.lote_codigo, lotRepublicanoAnos)
                  return (
                    <>
                      <span className="text-gray-500 dark:text-gray-400">Lote:</span> {detallesData.lote_codigo || '—'}
                      {fechaTradLote ? (
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{fechaTradLote}</div>
                      ) : null}
                    </>
                  )
                })()}
              </div>
              <div><span className="text-gray-500 dark:text-gray-400">Proveedor:</span> {detallesData.proveedor_razon_social || '—'}</div>
              <div><span className="text-gray-500 dark:text-gray-400">RUC proveedor:</span> {detallesData.ruc_proveedor || '—'}</div>
              <div><span className="text-gray-500 dark:text-gray-400">Desembarcadero:</span> {detallesData.desembarcadero || '—'}</div>
              <div><span className="text-gray-500 dark:text-gray-400">Origen:</span> {detallesData.origen || '—'}</div>
              <div><span className="text-gray-500 dark:text-gray-400">RUC transportista:</span> {detallesData.ruc_transportista || '—'}</div>
              <div><span className="text-gray-500 dark:text-gray-400">Estado:</span> {detallesData.estado || '—'}</div>
            </div>
            <div><span className="text-gray-500 dark:text-gray-400">Datos chofer:</span> {detallesData.datos_chofer || '—'}</div>
            <div>
              <p className="font-medium text-gray-700 dark:text-gray-300 mb-2">Winchas ({detallesData.winchas?.length ?? 0})</p>
              {detallesData.winchas?.length > 0 ? (
                <>
                  <table className="min-w-full border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800">
                    <thead className="bg-gray-100 dark:bg-gray-700">
                      <tr>
                        <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-200">N° wincha</th>
                        <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-200">Guía remitente</th>
                        <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-200">Embarcación</th>
                        <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-200">Matrícula</th>
                        <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-200">Hora inicio / final</th>
                        <th className="px-3 py-2 text-right text-gray-700 dark:text-gray-200">Peso (kg)</th>
                        <th className="px-3 py-2 text-right text-gray-700 dark:text-gray-200">Cajas</th>
                        {detallesData.estado !== 'Completado' && (
                          <th className="px-3 py-2 text-right text-gray-700 dark:text-gray-200">Acciones</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                      {detallesData.winchas.map((w) => (
                        <tr key={w.id} className="border-t border-gray-200 dark:border-gray-600">
                          <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{w.numero_wincha || '—'}</td>
                          <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{w.numero_guia_remitente || '—'}</td>
                          <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{w.nombre_embarcacion || '—'}</td>
                          <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{w.matricula_embarcacion || '—'}</td>
                          <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{w.hora_inicio || '—'} / {w.hora_final || '—'}</td>
                          <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100">{w.peso_kg != null ? w.peso_kg : '—'}</td>
                          <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100">{w.cajas != null ? w.cajas : '—'}</td>
                          {detallesData.estado !== 'Completado' && (
                            <td className="px-3 py-2 text-right">
                              <span className="inline-flex items-center gap-0.5">
                                <button type="button" onClick={() => openEditarWincha(w, detallesData)} className="p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 rounded" title="Editar wincha">
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button type="button" onClick={() => handleEliminarWincha(w, detallesData)} className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/20 rounded" title="Eliminar wincha">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </span>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-100 dark:bg-gray-700 font-semibold">
                      <tr>
                        <td colSpan={5} className="px-3 py-2 text-right text-gray-900 dark:text-gray-100">Total:</td>
                        <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100">{detallesData.winchas.reduce((s, w) => s + (Number(w.peso_kg) || 0), 0).toFixed(2)} kg</td>
                        <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100">{detallesData.winchas.reduce((s, w) => s + (Number(w.cajas) || 0), 0)} cajas</td>
                        {detallesData.estado !== 'Completado' && <td></td>}
                      </tr>
                    </tfoot>
                  </table>
                </>
              ) : (
                <p className="text-gray-500 dark:text-gray-400">Sin winchas.</p>
              )}
            </div>
            {detallesData.especie_tipo_descarga === 'clasificacion' && detallesData.winchas?.length > 0 && detallesData.winchas.some((w) => Array.isArray(w.pesos_clasificacion) && w.pesos_clasificacion.length > 0) && (
              <div className="rounded-lg border border-amber-200 dark:border-amber-800 p-4 bg-amber-50/50 dark:bg-amber-900/10">
                <h3 className="font-medium text-gray-800 dark:text-gray-200 mb-3">Clasificación por peso</h3>
                {detallesData.winchas.map((w) => {
                  const pesos = w.pesos_clasificacion || []
                  if (pesos.length === 0) return null
                  const totalWincha = Number(w.peso_kg) || 0
                  return (
                    <div key={w.id} className="mb-4 last:mb-0">
                      <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Wincha {w.numero_wincha || w.id} — Total: {totalWincha.toFixed(2)} kg</p>
                      <table className="min-w-full text-xs border border-gray-200 dark:border-gray-600 rounded overflow-hidden">
                        <thead className="bg-gray-100 dark:bg-gray-700">
                          <tr>
                            <th className="px-2 py-1 text-left text-gray-700 dark:text-gray-200">Clasificación</th>
                            <th className="px-2 py-1 text-right text-gray-700 dark:text-gray-200">Peso (kg)</th>
                            <th className="px-2 py-1 text-right text-gray-700 dark:text-gray-200">%</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                          {pesos.map((p, i) => {
                            const kg = Number(p.peso_kg) || 0
                            const pct = totalWincha > 0 ? (kg / totalWincha * 100).toFixed(1) : '0'
                            return (
                              <tr key={i}>
                                <td className="px-2 py-1 text-gray-800 dark:text-gray-200">{p.clasificacion_nombre || p.clasificacion_codigo || '—'}</td>
                                <td className="px-2 py-1 text-right text-gray-800 dark:text-gray-200">{kg.toFixed(2)}</td>
                                <td className="px-2 py-1 text-right text-gray-600 dark:text-gray-400">{pct}%</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )
                })}
                {(() => {
                  const totalGeneral = detallesData.winchas.reduce((s, w) => s + (Number(w.peso_kg) || 0), 0)
                  const byClasif = {}
                  detallesData.winchas.forEach((w) => {
                    (w.pesos_clasificacion || []).forEach((p) => {
                      const id = p.clasificacion_id
                      const label = p.clasificacion_nombre || p.clasificacion_codigo || id || '—'
                      if (!id) return
                      if (!byClasif[id]) byClasif[id] = { id, label, kg: 0 }
                      byClasif[id].kg += Number(p.peso_kg) || 0
                    })
                  })
                  const filas = Object.values(byClasif)
                  if (filas.length === 0) return null
                  return (
                    <div className="mt-3 pt-3 border-t border-amber-200 dark:border-amber-700">
                      <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Resumen general (todas las winchas) — Total: {totalGeneral.toFixed(2)} kg</p>
                      <table className="min-w-full text-xs border border-gray-200 dark:border-gray-600 rounded overflow-hidden">
                        <thead className="bg-gray-100 dark:bg-gray-700">
                          <tr>
                            <th className="px-2 py-1 text-left text-gray-700 dark:text-gray-200">Clasificación</th>
                            <th className="px-2 py-1 text-right text-gray-700 dark:text-gray-200">Total (kg)</th>
                            <th className="px-2 py-1 text-right text-gray-700 dark:text-gray-200">% del total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                          {filas.map((f) => {
                            const pct = totalGeneral > 0 ? (f.kg / totalGeneral * 100).toFixed(1) : '0'
                            return (
                              <tr key={f.id}>
                                <td className="px-2 py-1 text-gray-800 dark:text-gray-200">{f.label}</td>
                                <td className="px-2 py-1 text-right text-gray-800 dark:text-gray-200">{f.kg.toFixed(2)}</td>
                                <td className="px-2 py-1 text-right text-gray-600 dark:text-gray-400">{pct}%</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )
                })()}
              </div>
            )}
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600 flex flex-wrap items-center gap-2 justify-between">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    try {
                      exportDescargaWinchasExcel(detallesData)
                      toast.success(detallesData?.winchas?.length ? 'Excel descargado' : 'Excel descargado (solo encabezados, sin winchas)')
                    } catch {
                      toast.error('No se pudo exportar Excel')
                    }
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
                  title="Una fila por wincha; primera fila son títulos, listo para pegar en planilla"
                >
                  <FileSpreadsheet className="w-4 h-4 shrink-0" />
                  Exportar Excel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!detallesData?.winchas?.length) {
                      toast.error('No hay winchas para exportar')
                      return
                    }
                    try {
                      exportDescargaWinchasPdf(detallesData, { appName: nombreEmpresa })
                      toast.success('PDF descargado')
                    } catch {
                      toast.error('No se pudo exportar PDF')
                    }
                  }}
                  disabled={!detallesData?.winchas?.length}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Tabla de winchas en PDF"
                >
                  <FileText className="w-4 h-4 shrink-0" />
                  Exportar PDF
                </button>
              </div>
              {detallesData.estado === 'Completado' && isAdmin() && (
                <button type="button" onClick={() => reabrirDescarga(detallesData)} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700" title="Reabrir descarga (solo Admin)">Reabrir descarga</button>
              )}
            </div>
          </div>
        )}
      </Modal>
      <ExportMatrixModal
        isOpen={openExportLote}
        onClose={() => setOpenExportLote(false)}
        title={`Resumen descarga lote ${loteExportCodigo || ''}`.trim()}
        rows={loteExportRows}
        columns={loteExportColumns}
        orientation={exportLoteOrientation}
        onChangeOrientation={setExportLoteOrientation}
        exporting={exportandoLote}
        onExportPdf={() => {
          exportarLotePdf()
          setOpenExportLote(false)
        }}
        onExportExcel={() => {
          exportarLoteExcel()
          setOpenExportLote(false)
        }}
      />
    </div>
  )
}

export default DescargaMateriaPrima
