import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, LayoutGrid } from 'lucide-react'
import { almacenesApi } from '../../api/almacenes'
import toast from 'react-hot-toast'

const Carriles = () => {
  const { almacenId } = useParams()
  const navigate = useNavigate()
  const [almacenNombre, setAlmacenNombre] = useState('')
  const [carriles, setCarriles] = useState([])
  const [resumen, setResumen] = useState({ espacios_totales: 0, espacios_ocupados: 0, espacios_libres: 0, porcentaje_ocupacion: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!almacenId) return
    cargaDatos()
  }, [almacenId])

  const cargaDatos = async () => {
    try {
      setLoading(true)
      const [almacenRes, carrilesRes] = await Promise.all([
        almacenesApi.obtener(almacenId),
        almacenesApi.carriles(almacenId),
      ])
      setAlmacenNombre(almacenRes?.data?.nombre ?? '')
      const listaCarriles = Array.isArray(carrilesRes?.data) ? carrilesRes.data : (carrilesRes?.data?.data ?? [])
      setCarriles(listaCarriles)
      const total = listaCarriles.reduce((t, c) => t + (c.espacios_totales || 0), 0)
      const ocupados = listaCarriles.reduce((t, c) => t + (c.espacios_ocupados || 0), 0)
      setResumen({
        espacios_totales: total,
        espacios_ocupados: ocupados,
        espacios_libres: Math.max(0, total - ocupados),
        porcentaje_ocupacion: total ? Math.round((ocupados / total) * 100) : 0,
      })
    } catch (e) {
      toast.error('Error al cargar carriles')
      setCarriles([])
    } finally {
      setLoading(false)
    }
  }

  const volver = () => navigate('/almacenes')
  const irANivelPosicion = (carrilId) => navigate(`/almacenes/${almacenId}/carriles/${carrilId}/niveles`)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <button
          type="button"
          onClick={volver}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
        >
          <ArrowLeft className="w-4 h-4" />
          Regresar
        </button>
        <div className="flex items-center gap-3">
          <LayoutGrid className="w-8 h-8 text-primary-600" />
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Vista Carril</p>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Almacén: <span className="text-primary-600 dark:text-primary-400">{almacenNombre || '...'}</span>
            </h1>
          </div>
        </div>
      </div>

      <div className="mb-6 p-5 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 rounded-xl border border-gray-200 dark:border-gray-600 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Estado del Almacén Seleccionado</h2>
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
            <span className="font-medium">Ocupación del almacén</span>
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-8 gap-4">
        {carriles.map((c) => {
          const total = c.espacios_totales || 0
          const ocupados = c.espacios_ocupados || 0
          const libres = c.espacios_libres ?? Math.max(0, total - ocupados)
          const porcentaje = c.porcentaje_ocupacion ?? (total ? Math.round((ocupados / total) * 100) : 0)

          return (
            <div
              key={c.id}
              onClick={() => irANivelPosicion(c.id)}
              className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 cursor-pointer hover:border-primary-500 dark:hover:border-primary-500 hover:shadow-md transition-all"
            >
              <h3 className="font-semibold text-gray-900 dark:text-white mb-3">{c.nombre}</h3>
              <dl className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                <div className="flex justify-between">
                  <span>Niveles</span>
                  <span className="font-medium text-gray-900 dark:text-white">{c.cantidad_niveles}</span>
                </div>
                <div className="flex justify-between">
                  <span>Posiciones/nivel</span>
                  <span className="font-medium text-gray-900 dark:text-white">{c.cantidad_posiciones}</span>
                </div>
              </dl>
              <div className="mt-3">
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                  <span>Ocupación</span>
                  <span>{porcentaje}%</span>
                </div>
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-600 rounded-full"
                    style={{ width: `${Math.min(100, porcentaje)}%` }}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {carriles.length === 0 && (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          No hay carriles en este almacén.
        </div>
      )}
    </div>
  )
}

export default Carriles
