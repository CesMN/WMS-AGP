import React, { useState, useEffect, useMemo } from 'react'
import { LayoutTemplate, Plus, Edit, Trash2, Loader2, Search, X, GripVertical } from 'lucide-react'
import Modal from '../../components/Modal'
import { plantillasProcesoApi } from '../../api/plantillas-proceso'
import { clientesApi } from '../../api/clientes'
import { especiesApi } from '../../api/especies'
import { productosApi } from '../../api/productos'
import toast from 'react-hot-toast'

const PlantillasProceso = () => {
  const [plantillas, setPlantillas] = useState([])
  const [clientes, setClientes] = useState([])
  const [especies, setEspecies] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    cliente_id: '',
    especie_id: '',
    titulo: '',
    producto_ids: [],
    operativo_agua_litros_por_tm_mp: '',
    operativo_hielo_kg_por_tm_mp: '',
  })
  const [productosDisponibles, setProductosDisponibles] = useState([])
  const [productoSearch, setProductoSearch] = useState('')
  const [togglingId, setTogglingId] = useState(null)
  const [modalOrdenOpen, setModalOrdenOpen] = useState(false)
  const [dragProductoId, setDragProductoId] = useState(null)

  useEffect(() => {
    if (!modalOpen) setModalOrdenOpen(false)
  }, [modalOpen])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      plantillasProcesoApi.listar(),
      clientesApi.listar({ limit: 500 }),
      especiesApi.listar({ limit: 500 }),
    ])
      .then(([r1, r2, r3]) => {
        if (cancelled) return
        setPlantillas(r1.data?.data ?? r1.data ?? [])
        setClientes(r2.data?.data ?? r2.data ?? [])
        setEspecies(r3.data?.data ?? r3.data ?? [])
      })
      .catch(() => {
        if (!cancelled) toast.error('Error al cargar datos')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const refreshLista = () => {
    plantillasProcesoApi.listar()
      .then(({ data }) => setPlantillas(data?.data ?? data ?? []))
      .catch(() => toast.error('Error al actualizar'))
  }

  const loadProductos = (clienteId, especieId) => {
    if (!clienteId) {
      setProductosDisponibles([])
      return
    }
    const params = { cliente_id: clienteId, limit: 500 }
    if (especieId) params.especie_id = especieId
    productosApi.listar(params)
      .then(({ data }) => {
        const list = data?.data ?? data ?? []
        setProductosDisponibles(list)
      })
      .catch(() => setProductosDisponibles([]))
  }

  const openCrear = () => {
    setModalOrdenOpen(false)
    setEditando(null)
    setFormData({
      cliente_id: '',
      especie_id: '',
      titulo: '',
      producto_ids: [],
      operativo_agua_litros_por_tm_mp: '',
      operativo_hielo_kg_por_tm_mp: '',
    })
    setProductoSearch('')
    setProductosDisponibles([])
    setModalOpen(true)
  }

  const openEditar = (p) => {
    setModalOrdenOpen(false)
    setEditando(p)
    setFormData({
      cliente_id: p.cliente_id,
      especie_id: p.especie_id,
      titulo: p.titulo || '',
      producto_ids: [],
      operativo_agua_litros_por_tm_mp:
        p.operativo_agua_litros_por_tm_mp != null && p.operativo_agua_litros_por_tm_mp !== ''
          ? String(p.operativo_agua_litros_por_tm_mp)
          : '',
      operativo_hielo_kg_por_tm_mp:
        p.operativo_hielo_kg_por_tm_mp != null && p.operativo_hielo_kg_por_tm_mp !== ''
          ? String(p.operativo_hielo_kg_por_tm_mp)
          : '',
    })
    setProductoSearch('')
    loadProductos(p.cliente_id, p.especie_id)
    setModalOpen(true)
    plantillasProcesoApi.obtener(p.id)
      .then(({ data }) => {
        setFormData((prev) => ({
          ...prev,
          producto_ids: (data.productos || []).map((x) => x.id),
          operativo_agua_litros_por_tm_mp:
            data.operativo_agua_litros_por_tm_mp != null ? String(data.operativo_agua_litros_por_tm_mp) : '',
          operativo_hielo_kg_por_tm_mp:
            data.operativo_hielo_kg_por_tm_mp != null ? String(data.operativo_hielo_kg_por_tm_mp) : '',
        }))
      })
      .catch(() => toast.error('Error al cargar plantilla'))
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    if (name === 'cliente_id' || name === 'especie_id') {
      if (name === 'cliente_id') {
        setFormData((prev) => ({ ...prev, especie_id: '', producto_ids: [] }))
        loadProductos(value, '')
      } else {
        setFormData((prev) => ({ ...prev, producto_ids: [] }))
        loadProductos(formData.cliente_id, value)
      }
    }
  }

  const addProducto = (producto) => {
    if (formData.producto_ids.includes(producto.id)) return
    setFormData((prev) => ({ ...prev, producto_ids: [...prev.producto_ids, producto.id] }))
  }

  const etiquetaProcesoIngreso = (p) => {
    const m = { envasado: 'Envasado', congelado: 'Congelado', empaque: 'Empaque' }
    return m[p] || p
  }

  const removeProducto = async (productoId) => {
    if (!editando) {
      setFormData((prev) => ({ ...prev, producto_ids: prev.producto_ids.filter((id) => id !== productoId) }))
      return
    }
    try {
      const { data } = await plantillasProcesoApi.verificarProductoIngreso(editando.id, productoId)
      if (data.tiene && (data.procesos || []).length > 0) {
        const labels = (data.procesos || []).map(etiquetaProcesoIngreso).join(', ')
        if (
          !window.confirm(
            `Este producto ya tiene cantidad registrada en: ${labels}. Quitarlo de la plantilla puede afectar la trazabilidad. ¿Continuar?`
          )
        ) {
          return
        }
      }
    } catch {
      toast.error('No se pudo verificar el uso del producto')
      return
    }
    setFormData((prev) => ({ ...prev, producto_ids: prev.producto_ids.filter((id) => id !== productoId) }))
  }

  const getProductoLabel = (p) => [p.codigo, p.descripcion || p.producto, p.presentacion].filter(Boolean).join(' – ')
  const searchLower = (productoSearch || '').trim().toLowerCase()
  const productosFiltrados = searchLower
    ? productosDisponibles.filter((p) => {
        const label = getProductoLabel(p).toLowerCase()
        return label.includes(searchLower) || (p.codigo || '').toLowerCase().includes(searchLower)
      })
    : productosDisponibles
  const productosSeleccionados = useMemo(() => {
    const byId = new Map(productosDisponibles.map((p) => [String(p.id), p]))
    return formData.producto_ids.map((id) => byId.get(String(id))).filter(Boolean)
  }, [formData.producto_ids, productosDisponibles])

  const onDragStartProducto = (e, productoId) => {
    setDragProductoId(productoId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(productoId))
  }

  const onDropProducto = (e, targetId) => {
    e.preventDefault()
    const fromRaw = dragProductoId || e.dataTransfer.getData('text/plain')
    if (!fromRaw || String(fromRaw) === String(targetId)) return
    setFormData((prev) => {
      const ids = [...prev.producto_ids]
      const fi = ids.findIndex((x) => String(x) === String(fromRaw))
      const ti = ids.findIndex((x) => String(x) === String(targetId))
      if (fi < 0 || ti < 0) return prev
      const next = [...ids]
      const [moved] = next.splice(fi, 1)
      next.splice(ti, 0, moved)
      return { ...prev, producto_ids: next }
    })
    setDragProductoId(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.cliente_id || !formData.especie_id || !formData.titulo?.trim()) {
      toast.error('Cliente, especie y título son requeridos')
      return
    }
    setSaving(true)
    try {
      const parseOpNum = (v) => {
        if (v === '' || v == null) return 0
        const n = Number(v)
        return Number.isFinite(n) && n >= 0 ? n : 0
      }
      const payloadOperativos = {
        operativo_agua_litros_por_tm_mp: parseOpNum(formData.operativo_agua_litros_por_tm_mp),
        operativo_hielo_kg_por_tm_mp: parseOpNum(formData.operativo_hielo_kg_por_tm_mp),
      }
      if (editando) {
        const payload = {
          titulo: formData.titulo.trim(),
          producto_ids: formData.producto_ids,
          ...payloadOperativos,
        }
        try {
          await plantillasProcesoApi.actualizar(editando.id, payload)
        } catch (err) {
          if (err.response?.status === 409 && err.response?.data?.conflictos) {
            const lista = (err.response.data.conflictos || [])
              .map((c) => `${(c.procesos || []).map(etiquetaProcesoIngreso).join(', ')}`)
              .filter(Boolean)
            const extra = lista.length ? `\n\nProcesos afectados: ${lista.join('; ')}` : ''
            if (
              !window.confirm(
                `${err.response.data.message || 'Hay productos con ingreso registrado.'} ¿Confirma la eliminación?${extra}`
              )
            ) {
              return
            }
            await plantillasProcesoApi.actualizar(editando.id, {
              ...payload,
              confirmar_eliminacion_con_ingreso: true,
            })
          } else {
            throw err
          }
        }
        toast.success('Plantilla actualizada')
      } else {
        await plantillasProcesoApi.crear({
          cliente_id: formData.cliente_id,
          especie_id: formData.especie_id,
          titulo: formData.titulo.trim(),
          es_predeterminada: false,
          producto_ids: formData.producto_ids,
          ...payloadOperativos,
        })
        toast.success('Plantilla creada')
      }
      setModalOpen(false)
      refreshLista()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const handlePredeterminada = (plantilla) => {
    const nuevoValor = !plantilla.es_predeterminada
    setTogglingId(plantilla.id)
    plantillasProcesoApi.marcarPredeterminada(plantilla.id, nuevoValor)
      .then(() => {
        toast.success(nuevoValor ? 'Plantilla marcada como predeterminada' : 'Plantilla ya no es predeterminada')
        refreshLista()
      })
      .catch(() => toast.error('Error al actualizar'))
      .finally(() => setTogglingId(null))
  }

  const handleEliminar = (p) => {
    if (!window.confirm(`¿Eliminar la plantilla "${p.titulo}"?`)) return
    plantillasProcesoApi.eliminar(p.id)
      .then(() => {
        toast.success('Plantilla eliminada')
        refreshLista()
      })
      .catch(() => toast.error('Error al eliminar'))
  }

  const grouped = plantillas.reduce((acc, p) => {
    const key = `${p.cliente_id}|${p.especie_id}`
    if (!acc[key]) acc[key] = { cliente_nombre: p.cliente_nombre, especie_nombre: p.especie_nombre, items: [] }
    acc[key].items.push(p)
    return acc
  }, {})
  const groups = Object.entries(grouped).sort((a, b) => {
    const na = `${a[1].cliente_nombre} ${a[1].especie_nombre}`
    const nb = `${b[1].cliente_nombre} ${b[1].especie_nombre}`
    return na.localeCompare(nb)
  })

  if (loading && plantillas.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-10 h-10 animate-spin text-primary-600" />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary-100 dark:bg-primary-900/40">
            <LayoutTemplate className="w-6 h-6 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Plantillas de proceso</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Lista de productos por cliente y especie para el módulo de producción</p>
          </div>
        </div>
        <button
          onClick={openCrear}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium"
        >
          <Plus className="w-5 h-5" />
          Nueva plantilla
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center text-gray-500 dark:text-gray-400">
          No hay plantillas. Cree una para definir la lista de productos por cliente y especie.
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map(([key, { cliente_nombre, especie_nombre, items }]) => (
            <section key={key} className="space-y-3">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-gray-600 pb-2">
                {cliente_nombre} — {especie_nombre}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {items.map((p) => (
                  <div
                    key={p.id}
                    className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-medium text-gray-900 dark:text-white truncate flex-1" title={p.titulo}>
                        {p.titulo}
                      </h3>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => openEditar(p)}
                          className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                          title="Editar"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleEliminar(p)}
                          className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                      {p.productos_count ?? 0} producto(s)
                    </p>
                    {(p.productos && p.productos.length > 0) && (
                      <div className="mb-3 max-h-20 overflow-y-auto rounded border border-gray-100 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 py-1 px-2">
                        <ul className="text-xs text-gray-600 dark:text-gray-300 space-y-0.5">
                          {p.productos.map((prod, idx) => (
                            <li key={idx} className="truncate" title={[prod.codigo, prod.descripcion || prod.producto, prod.presentacion].filter(Boolean).join(' — ')}>
                              <span className="text-[10px] opacity-80">{prod.codigo}</span>
                              {prod.descripcion || prod.producto ? ` — ${prod.descripcion || prod.producto}` : ''}
                              {prod.presentacion && <span className="text-[10px] opacity-80"> — {prod.presentacion}</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
                      <span className="text-xs text-gray-500 dark:text-gray-400">Predeterminada</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={!!p.es_predeterminada}
                        disabled={togglingId === p.id}
                        onClick={() => handlePredeterminada(p)}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 ${
                          p.es_predeterminada ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-600'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
                            p.es_predeterminada ? 'translate-x-5' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editando ? 'Editar plantilla' : 'Nueva plantilla de proceso'}
        size="xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cliente *</label>
              <select
                name="cliente_id"
                value={formData.cliente_id}
                onChange={handleChange}
                required
                disabled={!!editando}
                className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg disabled:opacity-60"
              >
                <option value="">Seleccione cliente</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Especie *</label>
              <select
                name="especie_id"
                value={formData.especie_id}
                onChange={handleChange}
                required
                disabled={!!editando}
                className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg disabled:opacity-60"
              >
                <option value="">Seleccione especie</option>
                {especies.map((e) => (
                  <option key={e.id} value={e.id}>{e.nombre}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Título *</label>
            <input
              name="titulo"
              value={formData.titulo}
              onChange={handleChange}
              required
              placeholder="Ej. Proceso estándar Pota"
              className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Productos (vinculados al cliente y especie)</label>
            {!formData.cliente_id ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Seleccione cliente y especie para cargar productos.</p>
            ) : (
              <>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={productoSearch}
                    onChange={(e) => setProductoSearch(e.target.value)}
                    placeholder="Buscar producto por código o descripción..."
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg text-sm"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-48 overflow-auto">
                  <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-2">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Disponibles — clic para agregar</p>
                    <ul className="space-y-0.5 text-sm">
                      {productosFiltrados.slice(0, 50).map((prod) => (
                        <li key={prod.id}>
                          <button
                            type="button"
                            onClick={() => addProducto(prod)}
                            className="w-full text-left px-2 py-1 rounded hover:bg-primary-50 dark:hover:bg-primary-900/20 text-gray-700 dark:text-gray-300 truncate"
                            title={getProductoLabel(prod)}
                          >
                            {getProductoLabel(prod) || prod.codigo}
                          </button>
                        </li>
                      ))}
                      {productosFiltrados.length > 50 && (
                        <li className="text-xs text-gray-400 px-2">+ {productosFiltrados.length - 50} más (refine búsqueda)</li>
                      )}
                    </ul>
                  </div>
                  <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-2 flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 flex-1 min-w-0">
                        Seleccionados ({productosSeleccionados.length})
                      </p>
                      <button
                        type="button"
                        onClick={() => setModalOrdenOpen(true)}
                        disabled={productosSeleccionados.length < 2}
                        className="w-full sm:w-auto text-sm font-medium px-3 py-2 rounded-lg border border-primary-400 dark:border-primary-500 text-primary-800 dark:text-primary-200 bg-primary-50 dark:bg-primary-950/40 hover:bg-primary-100 dark:hover:bg-primary-900/50 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Ordenar productos…
                      </button>
                    </div>
                    <ul className="space-y-0.5 text-sm max-h-48 overflow-y-auto">
                      {productosSeleccionados.map((prod) => (
                        <li key={prod.id} className="flex items-center gap-1 group rounded px-1 py-0.5">
                          <span className="flex-1 truncate text-gray-700 dark:text-gray-300" title={getProductoLabel(prod)}>
                            {getProductoLabel(prod) || prod.codigo}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeProducto(prod.id)}
                            className="p-0.5 text-red-500 opacity-0 group-hover:opacity-100 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                            title="Quitar"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="rounded-lg border border-gray-200 dark:border-gray-600 p-4 bg-gray-50/80 dark:bg-gray-900/40">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Insumos operativos generales de planta</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              <strong className="font-medium text-gray-700 dark:text-gray-300">No son insumos de empaque</strong> (no aparecen en la tabla de sacos/láminas de la conciliación). Agua y hielo se calculan como factor × toneladas de materia prima (kg de winchas ÷ 1000).
              El <strong className="font-medium text-gray-700 dark:text-gray-300">bunker (galones)</strong> se registra en <strong className="font-medium text-gray-700 dark:text-gray-300">Conciliación empaque</strong>, apartado insumos operativos.
            </p>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Agua</label>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-1">Litros por TM de materia prima</p>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={formData.operativo_agua_litros_por_tm_mp}
                    onChange={(e) => setFormData((f) => ({ ...f, operativo_agua_litros_por_tm_mp: e.target.value }))}
                    placeholder="0"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Hielo</label>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-1">Kg por TM de materia prima</p>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={formData.operativo_hielo_kg_por_tm_mp}
                    onChange={(e) => setFormData((f) => ({ ...f, operativo_hielo_kg_por_tm_mp: e.target.value }))}
                    placeholder="0"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300"
            >
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium disabled:opacity-50 flex items-center justify-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {editando ? 'Guardar' : 'Crear'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={modalOrdenOpen}
        onClose={() => setModalOrdenOpen(false)}
        title="Ordenar productos"
        size="2xl"
        zIndexClass="z-[60]"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Arrastre cada fila con el ícono de agarre y suéltela sobre otra posición. El orden se aplicará al guardar la plantilla
            (botón Guardar o Crear en el formulario principal).
          </p>
          <div className="rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/80 dark:bg-gray-900/50 p-2">
            <ul className="max-h-[min(70vh,720px)] overflow-y-auto space-y-1 pr-1">
              {productosSeleccionados.map((prod) => (
                <li
                  key={prod.id}
                  draggable={productosSeleccionados.length > 1}
                  onDragStart={(e) => onDragStartProducto(e, prod.id)}
                  onDragEnd={() => setDragProductoId(null)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => onDropProducto(e, prod.id)}
                  className={`flex items-start gap-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2.5 shadow-sm ${
                    productosSeleccionados.length > 1 ? 'cursor-grab active:cursor-grabbing' : ''
                  } ${String(dragProductoId) === String(prod.id) ? 'opacity-60 ring-2 ring-primary-400' : ''}`}
                >
                  <span className="text-gray-400 dark:text-gray-500 shrink-0 pt-0.5" aria-hidden title="Arrastrar">
                    <GripVertical className="w-5 h-5" />
                  </span>
                  <span className="flex-1 text-sm text-gray-800 dark:text-gray-100 leading-relaxed break-words">
                    {getProductoLabel(prod)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-200 dark:border-gray-600">
            <button
              type="button"
              onClick={() => setModalOrdenOpen(false)}
              className="px-5 py-2.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-medium text-sm"
            >
              Listo
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default PlantillasProceso
