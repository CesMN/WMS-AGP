import { useState, useEffect, useRef } from 'react'
import { Search, Loader2 } from 'lucide-react'
import Modal from '../../components/Modal'
import { productosApi } from '../../api/productos'
import { clientesApi } from '../../api/clientes'
import { almacenesApi } from '../../api/almacenes'
import toast from 'react-hot-toast'

const REFERENCIAS = ['Produccion', 'Reempaque', 'Reproceso', 'Inventario', 'Otros']

const FormularioIngreso = ({ isOpen, onClose, almacenId, carrilId, posicionId, onSuccess, stockEdit = null }) => {
  const [loading, setLoading] = useState(false)
  const [loadingProductos, setLoadingProductos] = useState(false)
  const [loadingClientes, setLoadingClientes] = useState(false)
  const [clientes, setClientes] = useState([])
  const [productos, setProductos] = useState([])
  const [showProductos, setShowProductos] = useState(false)
  const [productoSeleccionado, setProductoSeleccionado] = useState(null)
  const searchTimeoutRef = useRef(null)
  const formRef = useRef(null)

  const [formData, setFormData] = useState({
    numero_guia: '',
    cliente_id: '',
    especie_id: '',
    referencia: REFERENCIAS[0],
    referencia_otros: '',
    producto_id: '',
    producto_codigo: '',
    lote: '',
    fecha_ingreso: new Date().toISOString().split('T')[0],
    cantidad_bultos: 1,
    peso_adicional: 0,
  })

  const formDataRef = useRef(formData)
  formDataRef.current = formData

  const [errors, setErrors] = useState({})

  const especiesDelCliente = formData.cliente_id
    ? (clientes.find((c) => String(c.id) === String(formData.cliente_id))?.especies || [])
    : []

  useEffect(() => {
    if (isOpen) {
      setLoadingClientes(true)
      clientesApi
        .listar({ limit: 500, offset: 0 })
        .then((res) => {
          const list = res.data?.data ?? res.data ?? []
          setClientes(Array.isArray(list) ? list : [])
        })
        .catch(() => {
          toast.error('Error al cargar clientes')
          setClientes([])
        })
        .finally(() => setLoadingClientes(false))
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen) {
      if (stockEdit) {
        const ref = stockEdit.referencia || ''
        const esOtros = ref && !REFERENCIAS.includes(ref)
        const fechaRaw = stockEdit.fecha_ingreso
        let fechaIngreso = new Date().toISOString().split('T')[0]
        if (fechaRaw) {
          if (typeof fechaRaw === 'string' && fechaRaw.includes('T')) fechaIngreso = fechaRaw.split('T')[0]
          else if (typeof fechaRaw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(fechaRaw)) fechaIngreso = fechaRaw.substring(0, 10)
          else if (fechaRaw instanceof Date && !isNaN(fechaRaw)) fechaIngreso = fechaRaw.toISOString().split('T')[0]
        }
        setFormData({
          numero_guia: stockEdit.numero_guia ?? '',
          cliente_id: stockEdit.cliente_id ?? '',
          especie_id: stockEdit.especie_id ?? '',
          referencia: esOtros ? 'Otros' : (ref || REFERENCIAS[0]),
          referencia_otros: esOtros ? ref : '',
          producto_id: stockEdit.producto_id || '',
          producto_codigo: stockEdit.producto_codigo || '',
          lote: stockEdit.lote || '',
          fecha_ingreso: fechaIngreso,
          cantidad_bultos: stockEdit.cantidad_bultos || 1,
          peso_adicional: stockEdit.peso_adicional ?? 0,
        })
        setProductoSeleccionado({
          id: stockEdit.producto_id,
          codigo: stockEdit.producto_codigo,
          producto: stockEdit.producto_nombre,
          descripcion: stockEdit.producto_descripcion,
          presentacion: stockEdit.producto_presentacion,
          formato: stockEdit.formato,
          unidad_medida: stockEdit.unidad_medida,
        })
      } else {
        resetForm()
      }
    }
  }, [isOpen, stockEdit])

  const buscarProductos = async (query) => {
    const { cliente_id, especie_id, producto_codigo } = formDataRef.current
    if (!cliente_id || !especie_id) {
      setProductos([])
      setShowProductos(false)
      return
    }
    const term = (query ?? producto_codigo ?? '').trim()
    const params = { cliente_id, especie_id, limit: 50, offset: 0 }
    if (term.length >= 2) params.q = term

    try {
      setLoadingProductos(true)
      const res = await productosApi.listar(params)
      const data = res.data?.data ?? res.data ?? []
      setProductos(Array.isArray(data) ? data : [])
      setShowProductos(true)
    } catch (e) {
      toast.error('Error al listar productos')
      setProductos([])
    } finally {
      setLoadingProductos(false)
    }
  }

  const handleProductoSearch = (e) => {
    const query = e.target.value
    setFormData((prev) => ({ ...prev, producto_codigo: query, producto_id: '' }))
    setProductoSeleccionado(null)

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    searchTimeoutRef.current = setTimeout(() => {
      buscarProductos(query)
    }, 300)
  }

  const seleccionarProducto = async (producto) => {
    try {
      const { data } = await productosApi.obtener(producto.id)
      setProductoSeleccionado(data)
      setFormData((prev) => ({
        ...prev,
        producto_id: data.id,
        producto_codigo: data.codigo,
      }))
      setShowProductos(false)
    } catch (e) {
      toast.error('Error al obtener detalles del producto')
    }
  }

  const calcularTotalKg = () => {
    if (!productoSeleccionado || !formData.cantidad_bultos) return 0

    const formato = Number(productoSeleccionado.formato) || 0
    const pesoAdicional = Number(formData.peso_adicional) || 0
    const bultos = Number(formData.cantidad_bultos) || 0

    if (productoSeleccionado.unidad_medida === 'KG') {
      return bultos * formato + pesoAdicional
    } else {
      return (bultos * formato) / 2.2046 + pesoAdicional
    }
  }

  const validate = () => {
    const newErrors = {}
    const refFinal = formData.referencia === 'Otros' ? (formData.referencia_otros || '').trim() : formData.referencia
    if (!refFinal) {
      newErrors.referencia = formData.referencia === 'Otros' ? 'Escriba la referencia' : 'La referencia es requerida'
    }

    if (!stockEdit) {
      if (!formData.cliente_id) newErrors.cliente_id = 'Seleccione el cliente'
      if (!formData.especie_id) newErrors.especie_id = 'Seleccione la especie'
    }

    if (!formData.producto_id) {
      newErrors.producto_id = 'Debe seleccionar un producto'
    }

    if (!formData.fecha_ingreso) {
      newErrors.fecha_ingreso = 'La fecha de ingreso es requerida'
    }

    const numeroGuiaTrim = formData.numero_guia != null ? String(formData.numero_guia).trim() : ''
    if (!numeroGuiaTrim) {
      newErrors.numero_guia = 'El número de guía es obligatorio'
    }

    const loteTrim = formData.lote != null ? String(formData.lote).trim() : ''
    if (!loteTrim) {
      newErrors.lote = 'El lote es obligatorio'
    }

    if (!formData.cantidad_bultos || formData.cantidad_bultos < 1) {
      newErrors.cantidad_bultos = 'La cantidad de bultos debe ser mayor a 0'
    }

    if (formData.peso_adicional < 0) {
      newErrors.peso_adicional = 'El peso adicional no puede ser negativo'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!validate()) {
      return
    }

    try {
      setLoading(true)
      const referenciaEnviar = formData.referencia === 'Otros'
        ? (formData.referencia_otros || '').trim() || 'Otros'
        : formData.referencia
      const fechaIngresoEnviar = (formData.fecha_ingreso && String(formData.fecha_ingreso).trim()) || (stockEdit && (stockEdit.fecha_ingreso ? (typeof stockEdit.fecha_ingreso === 'string' ? stockEdit.fecha_ingreso.split('T')[0] : new Date(stockEdit.fecha_ingreso).toISOString().split('T')[0]) : null)) || new Date().toISOString().split('T')[0]
      const data = {
        producto_id: formData.producto_id,
        referencia: referenciaEnviar,
        lote: formData.lote || null,
        fecha_ingreso: fechaIngresoEnviar,
        cantidad_bultos: Number(formData.cantidad_bultos),
        peso_adicional: Number(formData.peso_adicional) || 0,
      }
      const numeroGuiaVal = formData.numero_guia != null ? String(formData.numero_guia).trim() : ''
      if (stockEdit) {
        data.numero_guia = numeroGuiaVal
      } else if (numeroGuiaVal !== '') {
        data.numero_guia = numeroGuiaVal
      }

      if (stockEdit) {
        await almacenesApi.actualizarStock(almacenId, carrilId, posicionId, stockEdit.id, data)
        toast.success('Producto actualizado correctamente')
      } else {
        await almacenesApi.crearStock(almacenId, carrilId, posicionId, data)
        toast.success('Producto ingresado correctamente')
      }

      handleClose()
      if (onSuccess) {
        onSuccess()
      }
    } catch (error) {
      const message = error.response?.data?.message || 'Error al guardar el producto'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setFormData({
      numero_guia: '',
      cliente_id: '',
      especie_id: '',
      referencia: REFERENCIAS[0],
      referencia_otros: '',
      producto_id: '',
      producto_codigo: '',
      lote: '',
      fecha_ingreso: new Date().toISOString().split('T')[0],
      cantidad_bultos: 1,
      peso_adicional: 0,
    })
    setProductoSeleccionado(null)
    setErrors({})
    setProductos([])
    setShowProductos(false)
  }

  const onClienteChange = (clienteId) => {
    setFormData((prev) => ({
      ...prev,
      cliente_id: clienteId || '',
      especie_id: '',
      producto_id: '',
      producto_codigo: '',
    }))
    setProductoSeleccionado(null)
    setProductos([])
    setShowProductos(false)
  }

  const onEspecieChange = (especieId) => {
    setFormData((prev) => ({
      ...prev,
      especie_id: especieId || '',
      producto_id: '',
      producto_codigo: '',
    }))
    setProductoSeleccionado(null)
    setProductos([])
    setShowProductos(false)
  }

  const handleClose = () => {
    if (!loading) {
      resetForm()
      onClose()
    }
  }

  const totalKg = calcularTotalKg()

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={stockEdit ? 'Editar Producto' : 'Agregar Producto'}
      size="md"
    >
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
        {/* Número de guía de ingreso */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Número de guía de ingreso <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.numero_guia}
            onChange={(e) => setFormData((prev) => ({ ...prev, numero_guia: e.target.value }))}
            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white ${
              errors.numero_guia ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
            }`}
            placeholder="Número de guía"
            disabled={loading}
          />
          {errors.numero_guia && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.numero_guia}</p>
          )}
        </div>

        {/* Cliente */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Cliente {!stockEdit && <span className="text-red-500">*</span>}
          </label>
          <select
            value={formData.cliente_id}
            onChange={(e) => onClienteChange(e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
              errors.cliente_id ? 'border-red-500' : 'border-gray-300'
            }`}
            disabled={loading || loadingClientes}
          >
            <option value="">Seleccione cliente</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          {errors.cliente_id && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.cliente_id}</p>
          )}
        </div>

        {/* Especie (solo especies del cliente) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Especie {!stockEdit && <span className="text-red-500">*</span>}
          </label>
          <select
            value={formData.especie_id}
            onChange={(e) => onEspecieChange(e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
              errors.especie_id ? 'border-red-500' : 'border-gray-300'
            }`}
            disabled={loading || !formData.cliente_id}
          >
            <option value="">Seleccione especie</option>
            {especiesDelCliente.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
          {errors.especie_id && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.especie_id}</p>
          )}
        </div>

        {/* Referencia */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Referencia <span className="text-red-500">*</span>
          </label>
          <select
            value={formData.referencia}
            onChange={(e) => setFormData((prev) => ({ ...prev, referencia: e.target.value }))}
            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
              errors.referencia ? 'border-red-500' : 'border-gray-300'
            }`}
            disabled={loading}
          >
            {REFERENCIAS.map((ref) => (
              <option key={ref} value={ref}>
                {ref}
              </option>
            ))}
          </select>
          {formData.referencia === 'Otros' && (
            <input
              type="text"
              value={formData.referencia_otros}
              onChange={(e) => setFormData((prev) => ({ ...prev, referencia_otros: e.target.value }))}
              placeholder="Escriba la referencia"
              className="mt-2 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              disabled={loading}
            />
          )}
          {errors.referencia && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.referencia}</p>
          )}
        </div>

        {/* Búsqueda de Producto (filtrada por cliente y especie en nuevo ingreso) */}
        <div className="relative">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Código de Producto <span className="text-red-500">*</span>
          </label>
          {!stockEdit && (!formData.cliente_id || !formData.especie_id) && (
            <p className="text-sm text-amber-600 dark:text-amber-400 mb-1">
              Seleccione cliente y especie para ver los productos disponibles.
            </p>
          )}
          <div className="relative">
            <input
              type="text"
              value={formData.producto_codigo}
              onChange={handleProductoSearch}
              onFocus={() => {
                if (formData.cliente_id && formData.especie_id) buscarProductos('')
              }}
              placeholder={formData.cliente_id && formData.especie_id ? 'Buscar por código o nombre...' : 'Seleccione cliente y especie primero'}
              className={`w-full px-3 py-2 pr-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                errors.producto_id ? 'border-red-500' : 'border-gray-300'
              }`}
              disabled={loading || (!stockEdit && (!formData.cliente_id || !formData.especie_id))}
            />
            {loadingProductos ? (
              <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />
            ) : (
              <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            )}
          </div>

          {/* Lista de productos */}
          {showProductos && productos.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {productos.map((producto) => (
                <button
                  key={producto.id}
                  type="button"
                  onClick={() => seleccionarProducto(producto)}
                  className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-200 dark:border-gray-700 last:border-b-0"
                >
                  <div className="font-medium text-gray-900 dark:text-white">{producto.codigo} - {producto.producto}</div>
                  {producto.descripcion && (
                    <div className="text-xs text-gray-600 dark:text-gray-400 truncate" title={producto.descripcion}>Descripción: {producto.descripcion}</div>
                  )}
                  {producto.presentacion && (
                    <div className="text-xs text-gray-500 dark:text-gray-500">Presentación: {producto.presentacion} · Formato: {producto.formato} {producto.unidad_medida}</div>
                  )}
                  {!producto.presentacion && (
                    <div className="text-xs text-gray-500 dark:text-gray-500">Formato: {producto.formato} {producto.unidad_medida}</div>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Producto seleccionado */}
          {productoSeleccionado && (
            <div className="mt-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg space-y-1">
              <div className="text-sm font-medium text-green-800 dark:text-green-300">
                {productoSeleccionado.codigo} - {productoSeleccionado.producto}
              </div>
              {productoSeleccionado.descripcion && (
                <div className="text-xs text-green-700 dark:text-green-300">
                  Descripción: {productoSeleccionado.descripcion}
                </div>
              )}
              {productoSeleccionado.presentacion && (
                <div className="text-xs text-green-600 dark:text-green-400">
                  Presentación: {productoSeleccionado.presentacion}
                </div>
              )}
              <div className="text-xs text-green-600 dark:text-green-400">
                Formato: {productoSeleccionado.formato} {productoSeleccionado.unidad_medida}
              </div>
            </div>
          )}

          {errors.producto_id && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.producto_id}</p>
          )}
        </div>

        {/* Lote */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Lote <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.lote}
            onChange={(e) => setFormData((prev) => ({ ...prev, lote: e.target.value }))}
            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white ${
              errors.lote ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
            }`}
            placeholder="Lote"
            disabled={loading}
          />
          {errors.lote && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.lote}</p>
          )}
        </div>

        {/* Fecha de Ingreso */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Fecha de Ingreso <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={formData.fecha_ingreso}
            onChange={(e) => setFormData((prev) => ({ ...prev, fecha_ingreso: e.target.value }))}
            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
              errors.fecha_ingreso ? 'border-red-500' : 'border-gray-300'
            }`}
            disabled={loading}
          />
          {errors.fecha_ingreso && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.fecha_ingreso}</p>
          )}
        </div>

        {/* Cantidad de Bultos */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Cantidad de Bultos <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            value={formData.cantidad_bultos}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, cantidad_bultos: parseInt(e.target.value) || 0 }))
            }
            min="1"
            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
              errors.cantidad_bultos ? 'border-red-500' : 'border-gray-300'
            }`}
            disabled={loading}
          />
          {errors.cantidad_bultos && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.cantidad_bultos}</p>
          )}
        </div>

        {/* Peso Adicional (siempre en kg) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Peso Adicional (kg)
          </label>
          <input
            type="number"
            step="0.01"
            value={formData.peso_adicional}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, peso_adicional: parseFloat(e.target.value) || 0 }))
            }
            min="0"
            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
              errors.peso_adicional ? 'border-red-500' : 'border-gray-300'
            }`}
            disabled={loading}
          />
          {errors.peso_adicional && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.peso_adicional}</p>
          )}
        </div>

        {/* Resumen de Cálculo */}
        {productoSeleccionado && (
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2">
              Cálculo del Total
            </div>
            <div className="space-y-1 text-sm text-blue-700 dark:text-blue-400">
              <div className="flex justify-between">
                <span>Bultos × Formato:</span>
                <span>
                  {formData.cantidad_bultos} × {productoSeleccionado.formato}{' '}
                  {productoSeleccionado.unidad_medida} ={' '}
                  {(formData.cantidad_bultos * productoSeleccionado.formato).toFixed(2)}{' '}
                  {productoSeleccionado.unidad_medida}
                </span>
              </div>
              {formData.peso_adicional > 0 && (
                <div className="flex justify-between">
                  <span>Peso Adicional:</span>
                  <span>+{formData.peso_adicional} kg</span>
                </div>
              )}
              {productoSeleccionado.unidad_medida === 'LB' && (
                <div className="flex justify-between text-xs text-blue-600 dark:text-blue-500">
                  <span>Conversión LB → KG (bultos × formato):</span>
                  <span>÷ 2.2046</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-blue-200 dark:border-blue-700 font-bold text-base">
                <span>Total en KG:</span>
                <span className="text-blue-900 dark:text-blue-200">{totalKg.toFixed(2)} KG</span>
              </div>
            </div>
          </div>
        )}

        {/* Botones */}
        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Guardando...
              </>
            ) : stockEdit ? (
              'Actualizar'
            ) : (
              'Agregar Producto'
            )}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default FormularioIngreso
