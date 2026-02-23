import { useState } from 'react'
import { Plus, Loader2 } from 'lucide-react'
import Modal from '../../components/Modal'
import { almacenesApi } from '../../api/almacenes'
import toast from 'react-hot-toast'

const CrearAlmacen = ({ onSuccess }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    nombre: '',
    cantidad_carriles: 1,
    cantidad_niveles: 1,
    cantidad_posiciones: 1,
  })
  const [errors, setErrors] = useState({})

  const handleChange = (e) => {
    const { name, value } = e.target
    const numValue = ['cantidad_carriles', 'cantidad_niveles', 'cantidad_posiciones'].includes(name)
      ? parseInt(value) || 0
      : value

    setFormData((prev) => ({
      ...prev,
      [name]: numValue,
    }))

    // Limpiar error del campo cuando el usuario empieza a escribir
    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: '',
      }))
    }
  }

  const validate = () => {
    const newErrors = {}

    if (!formData.nombre.trim()) {
      newErrors.nombre = 'El nombre es requerido'
    } else if (formData.nombre.trim().length < 3) {
      newErrors.nombre = 'El nombre debe tener al menos 3 caracteres'
    }

    if (!formData.cantidad_carriles || formData.cantidad_carriles < 1) {
      newErrors.cantidad_carriles = 'Debe tener al menos 1 carril'
    } else if (formData.cantidad_carriles > 50) {
      newErrors.cantidad_carriles = 'No puede tener más de 50 carriles'
    }

    if (!formData.cantidad_niveles || formData.cantidad_niveles < 1) {
      newErrors.cantidad_niveles = 'Debe tener al menos 1 nivel'
    } else if (formData.cantidad_niveles > 20) {
      newErrors.cantidad_niveles = 'No puede tener más de 20 niveles'
    }

    if (!formData.cantidad_posiciones || formData.cantidad_posiciones < 1) {
      newErrors.cantidad_posiciones = 'Debe tener al menos 1 posición por nivel'
    } else if (formData.cantidad_posiciones > 30) {
      newErrors.cantidad_posiciones = 'No puede tener más de 30 posiciones por nivel'
    }

    // Validar que el total de espacios no sea excesivo
    const totalEspacios =
      formData.cantidad_carriles *
      formData.cantidad_niveles *
      formData.cantidad_posiciones

    if (totalEspacios > 10000) {
      newErrors.general =
        'El almacén no puede tener más de 10,000 espacios totales. Reduce la cantidad de carriles, niveles o posiciones.'
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
      await almacenesApi.crear(formData)
      toast.success('Almacén creado exitosamente')
      setIsOpen(false)
      resetForm()
      if (onSuccess) {
        onSuccess()
      }
    } catch (error) {
      const message =
        error.response?.data?.message || 'Error al crear el almacén'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setFormData({
      nombre: '',
      cantidad_carriles: 1,
      cantidad_niveles: 1,
      cantidad_posiciones: 1,
    })
    setErrors({})
  }

  const handleClose = () => {
    if (!loading) {
      setIsOpen(false)
      resetForm()
    }
  }

  const totalEspacios =
    formData.cantidad_carriles *
    formData.cantidad_niveles *
    formData.cantidad_posiciones

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors shadow-sm hover:shadow-md"
      >
        <Plus className="w-5 h-5" />
        Crear Almacén
      </button>

      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title="Crear Nuevo Almacén"
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {errors.general && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">
                {errors.general}
              </p>
            </div>
          )}

          {/* Nombre */}
          <div>
            <label
              htmlFor="nombre"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Nombre del Almacén <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="nombre"
              name="nombre"
              value={formData.nombre}
              onChange={handleChange}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                errors.nombre
                  ? 'border-red-500 focus:ring-red-500'
                  : 'border-gray-300'
              }`}
              placeholder="Ej: Cámara Frío 1"
              disabled={loading}
            />
            {errors.nombre && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                {errors.nombre}
              </p>
            )}
          </div>

          {/* Cantidad de Carriles */}
          <div>
            <label
              htmlFor="cantidad_carriles"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Cantidad de Carriles <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              id="cantidad_carriles"
              name="cantidad_carriles"
              value={formData.cantidad_carriles}
              onChange={handleChange}
              min="1"
              max="50"
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                errors.cantidad_carriles
                  ? 'border-red-500 focus:ring-red-500'
                  : 'border-gray-300'
              }`}
              disabled={loading}
            />
            {errors.cantidad_carriles && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                {errors.cantidad_carriles}
              </p>
            )}
          </div>

          {/* Cantidad de Niveles */}
          <div>
            <label
              htmlFor="cantidad_niveles"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Cantidad de Niveles <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              id="cantidad_niveles"
              name="cantidad_niveles"
              value={formData.cantidad_niveles}
              onChange={handleChange}
              min="1"
              max="20"
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                errors.cantidad_niveles
                  ? 'border-red-500 focus:ring-red-500'
                  : 'border-gray-300'
              }`}
              disabled={loading}
            />
            {errors.cantidad_niveles && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                {errors.cantidad_niveles}
              </p>
            )}
          </div>

          {/* Cantidad de Posiciones por Nivel */}
          <div>
            <label
              htmlFor="cantidad_posiciones"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Posiciones por Nivel <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              id="cantidad_posiciones"
              name="cantidad_posiciones"
              value={formData.cantidad_posiciones}
              onChange={handleChange}
              min="1"
              max="30"
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                errors.cantidad_posiciones
                  ? 'border-red-500 focus:ring-red-500'
                  : 'border-gray-300'
              }`}
              disabled={loading}
            />
            {errors.cantidad_posiciones && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                {errors.cantidad_posiciones}
              </p>
            )}
          </div>

          {/* Resumen */}
          <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Resumen del Almacén
            </h3>
            <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
              <div className="flex justify-between">
                <span>Carriles:</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {formData.cantidad_carriles}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Niveles por carril:</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {formData.cantidad_niveles}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Posiciones por nivel:</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {formData.cantidad_posiciones}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-600">
                <span className="font-semibold">Espacios totales:</span>
                <span className="font-bold text-primary-600 dark:text-primary-400 text-lg">
                  {totalEspacios.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Botones */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creando...
                </>
              ) : (
                'Crear Almacén'
              )}
            </button>
          </div>
        </form>
      </Modal>
    </>
  )
}

export default CrearAlmacen
