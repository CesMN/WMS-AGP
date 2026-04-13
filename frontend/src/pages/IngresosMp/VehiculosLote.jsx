import { useState, useEffect } from 'react'
import { Truck, Plus, Edit, Loader2, Download, Eye, ExternalLink, Trash2 } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Modal from '../../components/Modal'
import PaginationBar from '../../components/PaginationBar'
import { ingresosMpApi } from '../../api/ingresos-mp'
import { especiesApi } from '../../api/especies'
import { clientesApi } from '../../api/clientes'
import { useConfig } from '../../contexts/ConfigContext'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'

const VehiculosLote = () => {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const vehiculoIdFromUrl = searchParams.get('vehiculo_id')
  const { registrosPorPagina } = useConfig()
  const { isAdmin } = useAuth()
  const [list, setList] = useState([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [lotes, setLotes] = useState([])
  const [especies, setEspecies] = useState([])
  const [clientes, setClientes] = useState([])
  const [proveedores, setProveedores] = useState([])
  const [filtroLote, setFiltroLote] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [modalDetallesOpen, setModalDetallesOpen] = useState(false)
  const [detallesDescarga, setDetallesDescarga] = useState(null)
  const [loadingDetalles, setLoadingDetalles] = useState(false)
  const [editando, setEditando] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    lote_produccion_id: '',
    numero_orden: '',
    proveedor_id: '',
    proveedor_nombre: '',
    placas: '',
    cantidad_aproximada: '',
    especie_id: '',
    cliente_id: '',
    origen: '',
  })
  const [errors, setErrors] = useState({})
  const [deletingVehiculoId, setDeletingVehiculoId] = useState(null)

  useEffect(() => {
    let cancelled = false
    ingresosMpApi.lotesListar({ limit: 500, estado: '' }).then(({ data }) => {
      if (!cancelled) setLotes(data?.data ?? data ?? [])
    }).catch(() => { if (!cancelled) setLotes([]) })
    especiesApi.listar().then(({ data }) => {
      if (!cancelled) setEspecies(Array.isArray(data) ? data : data?.data ?? [])
    }).catch(() => { if (!cancelled) setEspecies([]) })
    clientesApi.listar({ limit: 500 }).then(({ data }) => {
      if (!cancelled) setClientes(Array.isArray(data) ? data : data?.data ?? [])
    }).catch(() => { if (!cancelled) setClientes([]) })
    ingresosMpApi.proveedoresListar({ limit: 500 }).then(({ data }) => {
      if (!cancelled) setProveedores(data?.data ?? data ?? [])
    }).catch(() => { if (!cancelled) setProveedores([]) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    const limit = registrosPorPagina || 50
    setLoading(true)
    const params = { limit, offset: Number(offset) }
    if (filtroLote) params.lote_produccion_id = filtroLote
    ingresosMpApi
      .vehiculosListar(params)
      .then(({ data }) => {
        if (cancelled) return
        setList(data?.data ?? data ?? [])
        setTotal(data?.total ?? 0)
      })
      .catch(() => {
        if (!cancelled) {
          toast.error('Error al cargar vehículos')
          setList([])
          setTotal(0)
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [offset, registrosPorPagina, refreshKey, filtroLote])

  const lotesActivos = lotes.filter((l) => l.estado === 'Iniciado' || l.estado === 'En proceso')
  const refreshLista = () => setRefreshKey((k) => k + 1)

  const openCrear = () => {
    setEditando(null)
    setFormData({
      lote_produccion_id: filtroLote || (lotesActivos[0]?.id ?? ''),
      numero_orden: '',
      proveedor_id: '',
      proveedor_nombre: '',
      placas: '',
      cantidad_aproximada: '',
      especie_id: '',
      cliente_id: '',
      origen: '',
    })
    setErrors({})
    setModalOpen(true)
  }

  const openEditar = (item) => {
    setEditando(item)
    setFormData({
      lote_produccion_id: item.lote_produccion_id,
      numero_orden: item.numero_orden || '',
      proveedor_id: item.proveedor_id || '',
      proveedor_nombre: item.proveedor_nombre || '',
      placas: item.placas || '',
      cantidad_aproximada: item.cantidad_aproximada ?? '',
      especie_id: item.especie_id || '',
      cliente_id: item.cliente_id || '',
      origen: item.origen || '',
    })
    setErrors({})
    setModalOpen(true)
  }

  const irADescargar = (item) => {
    navigate(`/ingresos-mp/descargas?vehiculo_id=${item.id}`)
  }

  const irATablaDescarga = (item) => {
    if (!item.descarga_id) return
    navigate(`/ingresos-mp/descargas?descarga_id=${item.descarga_id}`)
  }

  const handleEliminarVehiculo = (item) => {
    if (item.descarga_id) {
      toast.error('No se puede eliminar: el vehículo tiene descargas registradas.')
      return
    }
    if (!window.confirm(`¿Eliminar vehículo ${item.placas || item.id} del lote ${item.lote_codigo}?`)) return
    setDeletingVehiculoId(item.id)
    ingresosMpApi
      .vehiculoEliminar(item.id)
      .then(() => {
        toast.success('Vehículo eliminado correctamente')
        setRefreshKey((k) => k + 1)
      })
      .catch((err) => {
        const msg = err.response?.data?.message || 'Error al eliminar vehículo'
        toast.error(msg)
      })
      .finally(() => setDeletingVehiculoId(null))
  }

  const openDetalles = (item) => {
    if (!item.descarga_id) return
    setLoadingDetalles(true)
    setModalDetallesOpen(true)
    setDetallesDescarga(null)
    ingresosMpApi
      .descargaObtener(item.descarga_id)
      .then(({ data }) => setDetallesDescarga(data))
      .catch(() => {
        toast.error('Error al cargar datos de la descarga')
        setModalDetallesOpen(false)
      })
      .finally(() => setLoadingDetalles(false))
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
      ...(name === 'cliente_id' ? { especie_id: '' } : {}),
    }))
    if (name === 'proveedor_id') {
      const p = proveedores.find((x) => x.id === value)
      setFormData((prev) => ({ ...prev, proveedor_id: value, proveedor_nombre: p?.razon_social ?? '' }))
    }
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }))
  }

  const especiesDelCliente = formData.cliente_id
    ? (clientes.find((c) => String(c.id) === String(formData.cliente_id))?.especies || [])
    : []

  const validate = () => {
    const newErrors = {}
    if (!formData.numero_orden?.trim()) newErrors.numero_orden = 'Número de orden es requerido'
    if (!formData.placas?.trim()) newErrors.placas = 'Placas son requeridas'
    if (editando) {
      if (!formData.lote_produccion_id) newErrors.lote_produccion_id = 'Seleccione un lote'
    } else {
      if (!formData.lote_produccion_id) newErrors.lote_produccion_id = 'Seleccione un lote'
      const lote = lotes.find((l) => l.id === formData.lote_produccion_id)
      if (lote && lote.estado !== 'Iniciado' && lote.estado !== 'En proceso') {
        newErrors.lote_produccion_id = 'Solo se pueden agregar vehículos a lotes Iniciado o En proceso'
      }
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    try {
      setSaving(true)
      const payload = {
        lote_produccion_id: formData.lote_produccion_id,
        numero_orden: formData.numero_orden.trim(),
        proveedor_id: formData.proveedor_id || null,
        proveedor_nombre: formData.proveedor_nombre?.trim() || null,
        placas: formData.placas.trim(),
        cantidad_aproximada: formData.cantidad_aproximada !== '' ? Number(formData.cantidad_aproximada) : null,
        especie_id: formData.especie_id || null,
        cliente_id: formData.cliente_id || null,
        origen: formData.origen?.trim() || null,
      }
      if (editando) {
        await ingresosMpApi.vehiculoActualizar(editando.id, payload)
        toast.success('Vehículo actualizado')
      } else {
        await ingresosMpApi.vehiculoCrear(payload)
        toast.success('Vehículo registrado')
      }
      setModalOpen(false)
      refreshLista()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al guardar')
    } finally {
      setSaving(false)
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
          <Truck className="w-8 h-8 text-[var(--color-primary,#2563eb)]" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Vehículos por lote</h1>
        </div>
        <button
          onClick={openCrear}
          disabled={lotesActivos.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg font-medium"
          title={lotesActivos.length === 0 ? 'Debe existir un lote Iniciado o En proceso' : ''}
        >
          <Plus className="w-5 h-5" />
          Nuevo vehículo
        </button>
      </div>

      <div className="mb-4 flex gap-2 items-center flex-wrap">
        <label className="text-sm text-gray-600 dark:text-gray-400">Lote:</label>
        <select
          value={filtroLote}
          onChange={(e) => setFiltroLote(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg"
        >
          <option value="">Todos</option>
          {lotes.map((l) => (
            <option key={l.id} value={l.id}>{l.codigo} ({l.estado})</option>
          ))}
        </select>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Lote</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">N° orden</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Proveedor</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Placas</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Cliente</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Origen</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Cant. aprox.</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Especie</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Estado</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {list.map((item) => {
              const estaCompletado = item.descarga_estado === 'Completado'
              const tieneDescarga = !!item.descarga_id
              const destacar = vehiculoIdFromUrl && item.id === vehiculoIdFromUrl
              return (
                <tr
                  key={item.id}
                  className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 ${destacar ? 'bg-primary-50 dark:bg-primary-900/20 ring-1 ring-primary-200 dark:ring-primary-700' : ''}`}
                >
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{item.lote_codigo}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{item.numero_orden}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{item.proveedor_nombre || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{item.placas}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{item.cliente_nombre || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{item.origen || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{item.cantidad_aproximada != null ? item.cantidad_aproximada : '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{item.especie_nombre || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                      item.descarga_estado === 'Completado'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                        : item.descarga_estado === 'Descargando'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                    }`}>
                      {item.descarga_estado === 'Completado' ? 'Completado' : item.descarga_estado === 'Descargando' ? 'Descargando' : 'Sin descarga'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {estaCompletado ? (
                      <>
                        <button
                          onClick={() => openDetalles(item)}
                          className="p-2 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg"
                          title="Ver detalles de la descarga"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {tieneDescarga && (
                          <button
                            onClick={() => irATablaDescarga(item)}
                            className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg"
                            title="Ir a descarga en tabla de materia prima"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <button onClick={() => openEditar(item)} className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg" title="Editar">
                          <Edit className="w-4 h-4" />
                        </button>
                        {tieneDescarga ? (
                          <button onClick={() => irATablaDescarga(item)} className="p-2 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg" title="Ir a descarga en tabla">
                            <ExternalLink className="w-4 h-4" />
                          </button>
                        ) : (
                          <button onClick={() => irADescargar(item)} className="p-2 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg" title="Iniciar descarga">
                            <Download className="w-4 h-4" />
                          </button>
                        )}
                        {isAdmin() && !tieneDescarga && (
                          <button
                            onClick={() => handleEliminarVehiculo(item)}
                            disabled={deletingVehiculoId === item.id}
                            className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg disabled:opacity-50"
                            title="Eliminar vehículo (solo Admin, sin descargas)"
                          >
                            {deletingVehiculoId === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {list.length > 0 && (
        <div className="mt-4 px-4 py-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <PaginationBar total={total} limit={registrosPorPagina || 50} offset={offset} onPageChange={setOffset} />
        </div>
      )}
      {list.length === 0 && !loading && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center text-gray-500 dark:text-gray-400">
          No hay vehículos. Seleccione un lote Iniciado o En proceso y agregue vehículos.
        </div>
      )}

      <Modal isOpen={modalDetallesOpen} onClose={() => { setModalDetallesOpen(false); setDetallesDescarga(null); }} title="Detalles de la descarga" size="lg">
        {loadingDetalles ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
          </div>
        ) : detallesDescarga ? (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                ['Nº guía interna', detallesDescarga.numero_guia_interna],
                ['Fecha descarga', detallesDescarga.fecha_descarga ? new Date(detallesDescarga.fecha_descarga).toLocaleDateString('es-PE') : '—'],
                ['Especie', detallesDescarga.especie_nombre],
                ['Cliente', detallesDescarga.cliente_nombre],
                ['Placas vehículo', detallesDescarga.placas_vehiculo],
                ['Proveedor', detallesDescarga.proveedor_razon_social],
                ['RUC proveedor', detallesDescarga.ruc_proveedor],
                ['Desembarcadero', detallesDescarga.desembarcadero],
                ['Origen', detallesDescarga.origen],
                ['RUC transportista', detallesDescarga.ruc_transportista],
                ['Datos chofer', detallesDescarga.datos_chofer],
                ['Estado', detallesDescarga.estado],
              ].map(([label, value]) => (
                <div key={label} className="py-1 border-b border-gray-100 dark:border-gray-700">
                  <span className="text-gray-500 dark:text-gray-400">{label}:</span>{' '}
                  <span className="text-gray-900 dark:text-white">{value || '—'}</span>
                </div>
              ))}
            </div>
            {detallesDescarga.winchas?.length > 0 && (
              <div>
                <h3 className="font-medium text-gray-800 dark:text-gray-200 mb-2">Winchas</h3>
                <ul className="space-y-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 p-3">
                  {detallesDescarga.winchas.map((w) => (
                    <li key={w.id} className="flex flex-wrap gap-x-4 gap-y-1 text-gray-700 dark:text-gray-300">
                      Nº {w.numero_wincha || '—'} · {w.nombre_embarcacion || w.matricula_embarcacion || '—'} · Guía remitente: {w.numero_guia_remitente || '—'} · {w.peso_kg ?? '—'} kg · {w.cajas ?? '—'} cajas
                    </li>
                  ))}
                </ul>
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600 flex gap-6 font-medium text-gray-900 dark:text-white">
                  <span>Total cajas: {(detallesDescarga.winchas || []).reduce((s, w) => s + (Number(w.cajas) || 0), 0).toLocaleString('es-PE')}</span>
                  <span>Total peso: {(detallesDescarga.winchas || []).reduce((s, w) => s + (Number(w.peso_kg) || 0), 0).toFixed(2)} kg</span>
                </div>
              </div>
            )}
            <div className="pt-2 flex justify-end">
              <button type="button" onClick={() => { setModalDetallesOpen(false); setDetallesDescarga(null); }} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                Cerrar
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editando ? 'Editar vehículo' : 'Nuevo vehículo'} size="md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Lote de producción *</label>
            <select name="lote_produccion_id" value={formData.lote_produccion_id} onChange={handleChange} disabled={!!editando} className={`w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white ${errors.lote_produccion_id ? 'border-red-500' : 'border-gray-300'}`}>
              <option value="">Seleccione</option>
              {(editando ? lotes : lotesActivos).map((l) => (
                <option key={l.id} value={l.id}>{l.codigo} ({l.estado})</option>
              ))}
            </select>
            {errors.lote_produccion_id && <p className="mt-1 text-sm text-red-600">{errors.lote_produccion_id}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Número de orden *</label>
            <input name="numero_orden" value={formData.numero_orden} onChange={handleChange} className={`w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white ${errors.numero_orden ? 'border-red-500' : 'border-gray-300'}`} />
            {errors.numero_orden && <p className="mt-1 text-sm text-red-600">{errors.numero_orden}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Proveedor</label>
            <select name="proveedor_id" value={formData.proveedor_id} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg">
              <option value="">Seleccione o escriba abajo</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>{p.razon_social} {p.ruc ? `(${p.ruc})` : ''}</option>
              ))}
            </select>
            <input name="proveedor_nombre" value={formData.proveedor_nombre} onChange={handleChange} placeholder="Razón social si no está en lista" className="mt-1 w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Placas *</label>
            <input name="placas" value={formData.placas} onChange={handleChange} className={`w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white ${errors.placas ? 'border-red-500' : 'border-gray-300'}`} placeholder="Placa o placas" />
            {errors.placas && <p className="mt-1 text-sm text-red-600">{errors.placas}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cantidad aproximada</label>
            <input type="number" step="any" name="cantidad_aproximada" value={formData.cantidad_aproximada} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cliente</label>
            <select name="cliente_id" value={formData.cliente_id} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg">
              <option value="">Seleccione</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Especie</label>
            <select name="especie_id" value={formData.especie_id} onChange={handleChange} disabled={!formData.cliente_id} className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg disabled:opacity-60 disabled:cursor-not-allowed">
              <option value="">{formData.cliente_id ? 'Seleccione especie del cliente' : 'Seleccione primero un cliente'}</option>
              {especiesDelCliente.map((e) => (
                <option key={e.id} value={e.id}>{e.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Origen</label>
            <input name="origen" value={formData.origen} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg" placeholder="Origen" />
          </div>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={() => setModalOpen(false)} className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {editando ? 'Guardar' : 'Crear'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

export default VehiculosLote
