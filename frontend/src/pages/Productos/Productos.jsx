import { useState, useEffect, useRef } from 'react'
import { Box, Plus, Edit, Trash2, Loader2, Search, Upload, FileSpreadsheet, X } from 'lucide-react'
import Modal from '../../components/Modal'
import PaginationBar from '../../components/PaginationBar'
import ExportDropdown from '../../components/ExportDropdown'
import { productosApi } from '../../api/productos'
import { insumosApi } from '../../api/insumos'
import { clientesApi } from '../../api/clientes'
import { especiesApi } from '../../api/especies'
import { useConfig } from '../../contexts/ConfigContext'
import toast from 'react-hot-toast'

const UNIDADES = ['KG', 'LB']

const Productos = () => {
  const { registrosPorPagina } = useConfig()
  const [productos, setProductos] = useState([])
  const [totalRegistros, setTotalRegistros] = useState(0)
  const [offset, setOffset] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const [clientes, setClientes] = useState([])
  const [especies, setEspecies] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtroCliente, setFiltroCliente] = useState('')
  const [filtroEspecie, setFiltroEspecie] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    codigo: '',
    cliente_id: '',
    especie_id: '',
    producto: '',
    descripcion: '',
    presentacion: '',
    formato: '',
    unidad_medida: 'KG',
    capacidad_parihuela_bultos: '',
    capacidad_parihuela_cajas: '',
    unidad_parihuela: 'BULTOS',
  })
  const [errors, setErrors] = useState({})
  const [modalImportOpen, setModalImportOpen] = useState(false)
  const [importFile, setImportFile] = useState(null)
  const [importValidando, setImportValidando] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [importConfirmando, setImportConfirmando] = useState(false)
  const fileInputImportRef = useRef(null)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [eliminandoVarios, setEliminandoVarios] = useState(false)
  const [insumosLines, setInsumosLines] = useState([])
  const [insumosOpciones, setInsumosOpciones] = useState([])

  useEffect(() => {
    cargaClientesYEspecies()
  }, [])

  useEffect(() => {
    if (!modalOpen) return
    insumosApi
      .listar({ limit: 500 })
      .then(({ data }) => setInsumosOpciones(data?.data ?? []))
      .catch(() => setInsumosOpciones([]))
  }, [modalOpen])

  useEffect(() => {
    setOffset(0)
  }, [filtroCliente, filtroEspecie, busqueda])

  useEffect(() => {
    let cancelled = false
    const limit = registrosPorPagina || 50
    const params = { limit, offset: Number(offset) }
    if (filtroCliente) params.cliente_id = filtroCliente
    if (filtroEspecie) params.especie_id = filtroEspecie
    if (busqueda.trim()) params.q = busqueda.trim()
    setLoading(true)
    productosApi
      .listar(params)
      .then(({ data }) => {
        if (cancelled) return
        setProductos(data?.data ?? data ?? [])
        setTotalRegistros(data?.total ?? (data?.data ?? data)?.length ?? 0)
      })
      .catch(() => {
        if (!cancelled) {
          toast.error('Error al cargar productos')
          setProductos([])
          setTotalRegistros(0)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [filtroCliente, filtroEspecie, busqueda, offset, registrosPorPagina, refreshKey])

  const refreshLista = () => setRefreshKey((k) => k + 1)

  const cargaClientesYEspecies = async () => {
    try {
      const [clientesRes, especiesRes] = await Promise.all([
        clientesApi.listar({ limit: 500 }),
        especiesApi.listar({ limit: 500 }),
      ])
      setClientes(clientesRes.data?.data ?? clientesRes.data ?? [])
      setEspecies(especiesRes.data?.data ?? especiesRes.data ?? [])
    } catch (e) {
      toast.error('Error al cargar clientes y especies')
    }
  }


  const openCrear = () => {
    setEditando(null)
    setInsumosLines([])
    const primerCliente = clientes[0]
    const especiesDelPrimero = primerCliente?.especies || []
    setFormData({
      codigo: '',
      cliente_id: primerCliente?.id || '',
      especie_id: especiesDelPrimero[0]?.id || '',
      producto: '',
      descripcion: '',
      presentacion: '',
      formato: '',
      unidad_medida: 'KG',
      capacidad_parihuela_bultos: '',
      capacidad_parihuela_cajas: '',
      unidad_parihuela: 'BULTOS',
    })
    setErrors({})
    setModalOpen(true)
  }

  const openEditar = (p) => {
    setEditando(p)
    setInsumosLines([])
    productosApi
      .insumosProducto(p.id)
      .then(({ data }) => {
        setInsumosLines(
          (data?.items || []).map((i) => ({
            insumo_id: i.insumo_id,
            cantidad_por_bulto: String(i.cantidad_por_bulto ?? i.cantidad_por_kg_producto ?? ''),
          }))
        )
      })
      .catch(() => setInsumosLines([]))
    setFormData({
      codigo: p.codigo,
      cliente_id: p.cliente_id,
      especie_id: p.especie_id,
      producto: p.producto,
      descripcion: p.descripcion,
      presentacion: p.presentacion || '',
      formato: p.formato,
      unidad_medida: p.unidad_medida,
      capacidad_parihuela_bultos: p.capacidad_parihuela_bultos ?? '',
      capacidad_parihuela_cajas: p.capacidad_parihuela_cajas ?? '',
      unidad_parihuela: p.unidad_parihuela || 'BULTOS',
    })
    setErrors({})
    setModalOpen(true)
  }

  const especiesDelCliente = (() => {
    if (!formData.cliente_id) return []
    const list = clientes.find((c) => c.id === formData.cliente_id)?.especies || []
    if (editando && formData.especie_id && !list.some((e) => e.id === formData.especie_id)) {
      return [...list, { id: formData.especie_id, nombre: editando.especie_nombre || 'Especie actual' }]
    }
    return list
  })()

  const handleChange = (e) => {
    const { name, value } = e.target
    const finalValue = name === 'formato' ? (parseFloat(value) || '') : value
    if (name === 'cliente_id') {
      const nuevasEspecies = (clientes.find((c) => c.id === value)?.especies || [])
      const primeraEspecieId = nuevasEspecies[0]?.id || ''
      setFormData((prev) => ({ ...prev, cliente_id: value, especie_id: primeraEspecieId }))
    } else {
      setFormData((prev) => ({ ...prev, [name]: finalValue }))
    }
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }))
  }

  const validate = () => {
    const newErrors = {}
    if (!formData.codigo.trim()) newErrors.codigo = 'El código es requerido'
    if (!formData.cliente_id) newErrors.cliente_id = 'Seleccione un cliente'
    if (!formData.especie_id) newErrors.especie_id = 'Seleccione una especie'
    if (!formData.producto.trim()) newErrors.producto = 'El nombre del producto es requerido'
    if (!formData.descripcion.trim()) newErrors.descripcion = 'La descripción es requerida'
    if (formData.formato === '' || formData.formato < 0) newErrors.formato = 'Formato debe ser un número positivo'
    if (!formData.unidad_medida) newErrors.unidad_medida = 'Seleccione unidad de medida'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    try {
      setSaving(true)
      const payload = {
        codigo: formData.codigo.trim(),
        cliente_id: formData.cliente_id,
        especie_id: formData.especie_id,
        producto: formData.producto.trim(),
        descripcion: formData.descripcion.trim(),
        presentacion: formData.presentacion.trim() || null,
        formato: Number(formData.formato),
        unidad_medida: formData.unidad_medida,
        capacidad_parihuela_bultos: formData.capacidad_parihuela_bultos !== '' ? Number(formData.capacidad_parihuela_bultos) : null,
        capacidad_parihuela_cajas: formData.capacidad_parihuela_cajas !== '' ? Number(formData.capacidad_parihuela_cajas) : null,
        unidad_parihuela: formData.unidad_parihuela || 'BULTOS',
      }
      let productId = editando?.id
      if (editando) {
        await productosApi.actualizar(editando.id, payload)
        toast.success('Producto actualizado')
        productId = editando.id
      } else {
        const { data } = await productosApi.crear(payload)
        toast.success('Producto creado')
        productId = data?.id
      }
      const items = insumosLines
        .filter((r) => r.insumo_id && r.cantidad_por_bulto !== '' && !Number.isNaN(Number(r.cantidad_por_bulto)))
        .map((r) => ({ insumo_id: r.insumo_id, cantidad_por_bulto: Number(r.cantidad_por_bulto) }))
      if (productId) {
        try {
          await productosApi.guardarInsumosProducto(productId, { items })
        } catch (insErr) {
          toast.error(insErr.response?.data?.message || 'No se pudieron guardar los insumos del producto (ejecute migración 008 si falta la tabla).')
        }
      }
      setModalOpen(false)
      refreshLista()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const handleEliminar = async (p) => {
    if (!window.confirm(`¿Eliminar producto "${p.producto}"?`)) return
    try {
      await productosApi.eliminar(p.id)
      toast.success('Producto eliminado')
      setSelectedIds((prev) => { const s = new Set(prev); s.delete(p.id); return s })
      refreshLista()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al eliminar')
    }
  }

  const toggleSeleccion = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const seleccionarTodosPagina = () => {
    if (productos.length === 0) return
    const todosSeleccionados = productos.every((p) => selectedIds.has(p.id))
    if (todosSeleccionados) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        productos.forEach((p) => next.delete(p.id))
        return next
      })
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        productos.forEach((p) => next.add(p.id))
        return next
      })
    }
  }

  const handleEliminarSeleccionados = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    if (!window.confirm(`¿Eliminar ${ids.length} producto(s) seleccionado(s)?`)) return
    setEliminandoVarios(true)
    try {
      await Promise.all(ids.map((id) => productosApi.eliminar(id)))
      toast.success(`${ids.length} producto(s) eliminado(s)`)
      setSelectedIds(new Set())
      refreshLista()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al eliminar')
    } finally {
      setEliminandoVarios(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Box className="w-8 h-8 text-primary-600" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Productos</h1>
        </div>
        <div className="flex items-center gap-2">
          <ExportDropdown
            getExportConfig={() => ({
              title: 'Productos',
              filtersSummary: [filtroCliente && `Cliente`, filtroEspecie && `Especie`, busqueda && `Búsqueda`].filter(Boolean).join(', ') || 'Ninguno',
              columns: [
                { key: 'codigo', label: 'Código' },
                { key: 'cliente_nombre', label: 'Cliente' },
                { key: 'especie_nombre', label: 'Especie' },
                { key: 'producto', label: 'Producto' },
                { key: 'descripcion', label: 'Descripción' },
                { key: 'presentacion', label: 'Presentación' },
                { key: 'formato', label: 'Formato' },
                { key: 'unidad_medida', label: 'Unidad' },
              ],
              fetchData: () => productosApi.listar({ limit: 10000, offset: 0, cliente_id: filtroCliente || undefined, especie_id: filtroEspecie || undefined, q: busqueda.trim() || undefined }).then((r) => ({ data: r.data?.data ?? r.data ?? [] })),
            })}
            className="hidden sm:block"
          />
          <button
            type="button"
            onClick={() => { setModalImportOpen(true); setImportResult(null); setImportFile(null); }}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium"
          >
            <Upload className="w-5 h-5" />
            Importar
          </button>
          <button
            onClick={openCrear}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium"
          >
            <Plus className="w-5 h-5" />
            Agregar producto
          </button>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Filtro por Cliente</label>
          <select
            value={filtroCliente}
            onChange={(e) => setFiltroCliente(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg"
          >
            <option value="">Todos</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Filtro por Especie</label>
          <select
            value={filtroEspecie}
            onChange={(e) => setFiltroEspecie(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg"
          >
            <option value="">Todas</option>
            {especies.map((e) => (
              <option key={e.id} value={e.id}>{e.nombre}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Buscar por código o descripción</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Código o descripción..."
              className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg"
            />
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
          </div>
        ) : (
          <>
            {selectedIds.size > 0 && (
              <div className="px-4 py-2 bg-primary-50 dark:bg-primary-900/20 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-2 flex-wrap">
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {selectedIds.size} producto(s) seleccionado(s)
                </span>
                <button
                  type="button"
                  disabled={eliminandoVarios}
                  onClick={handleEliminarSeleccionados}
                  className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-white text-sm font-medium disabled:opacity-50 bg-red-600 hover:bg-red-700"
                >
                  {eliminandoVarios ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Eliminar seleccionados
                </button>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-900/50">
                  <tr>
                    <th className="w-10 px-2 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={productos.length > 0 && productos.every((p) => selectedIds.has(p.id))}
                        onChange={seleccionarTodosPagina}
                        className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Código</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Cliente</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Especie</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Producto</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Descripción</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Presentación</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Formato</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Unidad</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {productos.map((p) => (
                    <tr key={p.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 ${selectedIds.has(p.id) ? 'bg-primary-50/50 dark:bg-primary-900/10' : ''}`}>
                      <td className="w-10 px-2 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(p.id)}
                          onChange={() => toggleSeleccion(p.id)}
                          className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{p.codigo}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{p.cliente_nombre}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{p.especie_nombre}</td>
                      <td className="px-4 py-3 text-gray-900 dark:text-white">{p.producto}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300 max-w-xs truncate">{p.descripcion}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{p.presentacion || '-'}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{p.formato}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{p.unidad_medida}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => openEditar(p)} className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg" title="Editar">
                            <Edit className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleEliminar(p)} className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg" title="Eliminar">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!loading && productos.length > 0 && (
              <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
                <PaginationBar total={totalRegistros} limit={registrosPorPagina || 50} offset={offset} onPageChange={setOffset} />
              </div>
            )}
            {productos.length === 0 && !loading && (
              <div className="p-12 text-center text-gray-500 dark:text-gray-400">No hay productos. Ajuste filtros o agregue uno.</div>
            )}
          </>
        )}
      </div>

      <Modal isOpen={modalImportOpen} onClose={() => setModalImportOpen(false)} title="Importar productos" size="lg">
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Cargue un archivo Excel (.xlsx, .xls) o CSV. La primera fila deben ser los encabezados: <strong>codigo</strong>, <strong>cliente</strong>, <strong>especie</strong>, <strong>producto</strong>, <strong>descripcion</strong>, <strong>presentacion</strong>, <strong>formato</strong>, <strong>unidad</strong> (opcional, por defecto KG). Cliente y especie deben coincidir con nombres existentes.
          </p>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputImportRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                setImportFile(f || null)
                setImportResult(null)
              }}
            />
            <button
              type="button"
              onClick={() => fileInputImportRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-600"
            >
              <FileSpreadsheet className="w-5 h-5" />
              {importFile ? importFile.name : 'Seleccionar archivo'}
            </button>
            <button
              type="button"
              disabled={!importFile || importValidando}
              onClick={async () => {
                if (!importFile) return
                setImportValidando(true)
                setImportResult(null)
                try {
                  const { data } = await productosApi.importarValidar(importFile)
                  setImportResult(data)
                  if (data.errors?.length === 0 && data.validRows?.length > 0) toast.success(`${data.validRows.length} fila(s) válida(s)`)
                  else if (data.errors?.length) toast.error(`${data.errors.length} fila(s) con error`)
                } catch (err) {
                  toast.error(err.response?.data?.message || 'Error al validar')
                  setImportResult({ validRows: [], errors: [] })
                } finally {
                  setImportValidando(false)
                }
              }}
              className="px-4 py-2 rounded-lg text-white font-medium disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-primary,#2563eb)' }}
            >
              {importValidando ? <Loader2 className="w-4 h-4 animate-spin inline" /> : null} Validar
            </button>
          </div>
          {importResult && (
            <>
              <div className="text-sm">
                <span className="text-green-600 dark:text-green-400">{importResult.validRows?.length ?? 0} válidas</span>
                {' · '}
                <span className="text-red-600 dark:text-red-400">{importResult.errors?.length ?? 0} con error</span>
              </div>
              {importResult.errors?.length > 0 && (
                <div className="max-h-32 overflow-y-auto rounded border border-gray-200 dark:border-gray-600 p-2 text-sm">
                  {importResult.errors.slice(0, 20).map((e, i) => (
                    <div key={i} className="text-red-600 dark:text-red-400">Fila {e.fila}: {e.mensaje}</div>
                  ))}
                  {importResult.errors.length > 20 && <div className="text-gray-500">... y {importResult.errors.length - 20} más</div>}
                </div>
              )}
              {importResult.validRows?.length > 0 && (
                <button
                  type="button"
                  disabled={importConfirmando}
                  onClick={async () => {
                    setImportConfirmando(true)
                    try {
                      const { data } = await productosApi.importarConfirmar(importResult.validRows)
                      toast.success(data.message || 'Importación correcta')
                      setModalImportOpen(false)
                      refreshLista()
                    } catch (err) {
                      toast.error(err.response?.data?.message || 'Error al importar')
                    } finally {
                      setImportConfirmando(false)
                    }
                  }}
                  className="w-full py-2 rounded-lg text-white font-medium disabled:opacity-50"
                  style={{ backgroundColor: 'var(--color-primary,#2563eb)' }}
                >
                  {importConfirmando ? <Loader2 className="w-4 h-4 animate-spin inline" /> : null} Importar {importResult.validRows.length} producto(s)
                </button>
              )}
            </>
          )}
        </div>
      </Modal>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editando ? 'Editar producto' : 'Agregar producto'} size="xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Código *</label>
              <input name="codigo" value={formData.codigo} onChange={handleChange} disabled={!!editando} className={`w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white ${errors.codigo ? 'border-red-500' : 'border-gray-300'} disabled:opacity-70`} />
              {errors.codigo && <p className="mt-1 text-sm text-red-600">{errors.codigo}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cliente *</label>
              <select name="cliente_id" value={formData.cliente_id} onChange={handleChange} className={`w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white ${errors.cliente_id ? 'border-red-500' : 'border-gray-300'}`}>
                <option value="">Seleccione</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
              {errors.cliente_id && <p className="mt-1 text-sm text-red-600">{errors.cliente_id}</p>}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Especie *</label>
              <select name="especie_id" value={formData.especie_id} onChange={handleChange} disabled={!formData.cliente_id} className={`w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white disabled:opacity-60 ${errors.especie_id ? 'border-red-500' : 'border-gray-300'}`}>
                <option value="">{formData.cliente_id ? 'Seleccione especie del cliente' : 'Seleccione primero un cliente'}</option>
                {especiesDelCliente.map((e) => (
                  <option key={e.id} value={e.id}>{e.nombre}</option>
                ))}
              </select>
              {errors.especie_id && <p className="mt-1 text-sm text-red-600">{errors.especie_id}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Producto *</label>
              <input name="producto" value={formData.producto} onChange={handleChange} className={`w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white ${errors.producto ? 'border-red-500' : 'border-gray-300'}`} />
              {errors.producto && <p className="mt-1 text-sm text-red-600">{errors.producto}</p>}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descripción del producto *</label>
            <textarea name="descripcion" value={formData.descripcion} onChange={handleChange} rows={2} className={`w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white ${errors.descripcion ? 'border-red-500' : 'border-gray-300'}`} />
            {errors.descripcion && <p className="mt-1 text-sm text-red-600">{errors.descripcion}</p>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Presentación</label>
              <input name="presentacion" value={formData.presentacion} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Formato (peso por bulto) *</label>
              <input name="formato" type="number" step="0.01" min="0" value={formData.formato} onChange={handleChange} className={`w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white ${errors.formato ? 'border-red-500' : 'border-gray-300'}`} />
              {errors.formato && <p className="mt-1 text-sm text-red-600">{errors.formato}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Unidad de medida *</label>
              <select name="unidad_medida" value={formData.unidad_medida} onChange={handleChange} className={`w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white ${errors.unidad_medida ? 'border-red-500' : 'border-gray-300'}`}>
                {UNIDADES.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
              {errors.unidad_medida && <p className="mt-1 text-sm text-red-600">{errors.unidad_medida}</p>}
            </div>
          </div>
          <div className="border-t border-gray-200 dark:border-gray-600 pt-3 mt-3">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Capacidad parihuela (recepción en cámara)</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Cap. bultos</label>
                <input name="capacidad_parihuela_bultos" type="number" min="0" step="1" value={formData.capacidad_parihuela_bultos} onChange={handleChange} placeholder="Ej. 50" className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Cap. cajas</label>
                <input name="capacidad_parihuela_cajas" type="number" min="0" step="1" value={formData.capacidad_parihuela_cajas} onChange={handleChange} placeholder="Ej. 128" className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Unidad parihuela</label>
                <select name="unidad_parihuela" value={formData.unidad_parihuela} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg">
                  <option value="BULTOS">Bultos</option>
                  <option value="CAJAS">Cajas</option>
                </select>
              </div>
            </div>
          </div>
          <div className="border-t border-gray-200 dark:border-gray-600 pt-4 mt-2">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100 mb-1">Insumos extra por producto (opcional)</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              El empaque principal ahora se controla por <strong>plantillas de especie</strong> en <strong>Insumos &gt; Plantillas de empaque</strong>.
              Esta sección queda para consumos adicionales específicos de este producto.
            </p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {insumosLines.map((row, idx) => {
                const insumoSel = insumosOpciones.find((x) => x.id === row.insumo_id)
                const uMed = insumoSel?.unidad_medida || ''
                const etiquetaCantidad =
                  uMed === 'KG' ? 'Kg / bulto' : uMed === 'LB' ? 'Lb / bulto' : uMed === 'L' ? 'L / bulto' : 'Unid. / bulto'
                return (
                <div key={idx} className="flex flex-wrap gap-2 items-end">
                  <div className="flex-1 min-w-[180px]">
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Insumo</label>
                    <select
                      value={row.insumo_id}
                      onChange={(e) => {
                        const v = e.target.value
                        const op = insumosOpciones.find((i) => i.id === v)
                        setInsumosLines((lines) =>
                          lines.map((l, i) => {
                            if (i !== idx) return l
                            const next = { ...l, insumo_id: v }
                            if (v && op?.unidad_medida === 'UN' && (l.cantidad_por_bulto === '' || l.cantidad_por_bulto == null)) {
                              next.cantidad_por_bulto = '1'
                            }
                            return next
                          })
                        )
                      }}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg"
                    >
                      <option value="">Seleccione...</option>
                      {insumosOpciones.map((i) => (
                        <option key={i.id} value={i.id}>{i.nombre} ({i.unidad_medida})</option>
                      ))}
                    </select>
                  </div>
                  <div className="w-36">
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">{etiquetaCantidad}</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={row.cantidad_por_bulto}
                      onChange={(e) => {
                        const v = e.target.value
                        setInsumosLines((lines) => lines.map((l, i) => (i === idx ? { ...l, cantidad_por_bulto: v } : l)))
                      }}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setInsumosLines((lines) => lines.filter((_, i) => i !== idx))}
                    className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg mb-0.5"
                    title="Quitar"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                )
              })}
            </div>
            <button
              type="button"
              onClick={() => setInsumosLines((lines) => [...lines, { insumo_id: '', cantidad_por_bulto: '' }])}
              className="mt-2 text-sm text-primary-600 dark:text-primary-400 font-medium flex items-center gap-1"
            >
              <Plus className="w-4 h-4" /> Añadir insumo
            </button>
          </div>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={() => setModalOpen(false)} className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
              Cancelar
            </button>
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

export default Productos
