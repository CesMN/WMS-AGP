import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Warehouse, Edit, Trash2, Loader2 } from 'lucide-react'
import { almacenesApi } from '../../api/almacenes'
import toast from 'react-hot-toast'
import CrearAlmacen from './CrearAlmacen'
import Modal from '../../components/Modal'
import EmptyState from '../../components/EmptyState'

const Almacenes = () => {
  const [almacenes, setAlmacenes] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalEditar, setModalEditar] = useState(null)
  const [nombreEditar, setNombreEditar] = useState('')
  const [cantidadCarriles, setCantidadCarriles] = useState(1)
  const [cantidadNiveles, setCantidadNiveles] = useState(1)
  const [cantidadPosiciones, setCantidadPosiciones] = useState(1)
  const [guardando, setGuardando] = useState(false)
  const [eliminando, setEliminando] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    cargaAlmacenes()
  }, [])

  const cargaAlmacenes = async () => {
    try {
      setLoading(true)
      const res = await almacenesApi.listar()
      const data = res.data
      setAlmacenes(Array.isArray(data) ? data : (data?.data ?? []))
    } catch (e) {
      toast.error('Error al cargar almacenes')
      setAlmacenes([])
    } finally {
      setLoading(false)
    }
  }

  const handleClickAlmacen = (id) => {
    navigate(`/almacenes/${id}/carriles`)
  }

  const vacio = (a) => (a.espacios_ocupados || 0) === 0

  const abrirEditar = (e, a) => {
    e.stopPropagation()
    setModalEditar(a)
    setNombreEditar(a.nombre || '')
    setCantidadCarriles(a.cantidad_carriles ?? 1)
    setCantidadNiveles(a.cantidad_niveles ?? 1)
    setCantidadPosiciones(a.cantidad_posiciones ?? 1)
  }

  const guardarEditar = async () => {
    if (!modalEditar || !nombreEditar.trim()) return
    if (cantidadCarriles < 1 || cantidadNiveles < 1 || cantidadPosiciones < 1) {
      toast.error('Carriles, niveles y posiciones deben ser al menos 1')
      return
    }
    try {
      setGuardando(true)
      await almacenesApi.actualizar(modalEditar.id, {
        nombre: nombreEditar.trim(),
        cantidad_carriles: cantidadCarriles,
        cantidad_niveles: cantidadNiveles,
        cantidad_posiciones: cantidadPosiciones,
      })
      toast.success('Almacén actualizado')
      setModalEditar(null)
      cargaAlmacenes()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al actualizar')
    } finally {
      setGuardando(false)
    }
  }

  const eliminar = async (e, a) => {
    e.stopPropagation()
    if (!window.confirm(`¿Eliminar el almacén "${a.nombre}"? Esta acción no se puede deshacer.`)) return
    try {
      setEliminando(a.id)
      await almacenesApi.eliminar(a.id)
      toast.success('Almacén eliminado')
      cargaAlmacenes()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al eliminar')
    } finally {
      setEliminando(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-[var(--color-primary,#2563eb)] border-t-transparent" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Warehouse className="w-8 h-8 text-[var(--color-primary,#2563eb)]" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Almacenes
          </h1>
        </div>
        <CrearAlmacen onSuccess={cargaAlmacenes} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {almacenes.map((a) => {
          const total = a.espacios_totales || 0
          const ocupados = a.espacios_ocupados || 0
          const libres = a.espacios_libres ?? Math.max(0, total - ocupados)
          const porcentaje = a.porcentaje_ocupacion ?? (total ? Math.round((ocupados / total) * 100) : 0)
          const estaVacio = vacio(a)

          return (
            <div
              key={a.id}
              onClick={() => handleClickAlmacen(a.id)}
              className="wms-card bg-white dark:bg-gray-800 rounded-xl shadow hover:shadow-lg border border-gray-200 dark:border-gray-700 p-6 cursor-pointer transition-all hover:border-[var(--color-primary,#2563eb)] relative"
            >
              {estaVacio && (
                <div className="absolute top-3 right-3 flex items-center gap-1 z-10" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={(e) => abrirEditar(e, a)}
                    className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                    title="Editar almacén"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => eliminar(e, a)}
                    disabled={eliminando === a.id}
                    className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg disabled:opacity-50"
                    title="Eliminar almacén"
                  >
                    {eliminando === a.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                </div>
              )}
              <div className="flex items-start justify-between mb-4 pr-20">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary-100 dark:bg-primary-900/30">
                    <Warehouse className="w-6 h-6 text-[var(--color-primary,#2563eb)]" />
                  </div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {a.nombre}
                  </h2>
                </div>
              </div>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Carriles</span>
                  <span className="font-medium text-gray-900 dark:text-white">{a.cantidad_carriles}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Niveles</span>
                  <span className="font-medium text-gray-900 dark:text-white">{a.cantidad_niveles}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Espacios totales</span>
                  <span className="font-medium text-gray-900 dark:text-white">{total}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Ocupados</span>
                  <span className="font-medium text-gray-900 dark:text-white">{ocupados}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Libres</span>
                  <span className="font-medium text-green-600 dark:text-green-400">{libres}</span>
                </div>
              </dl>
              <div className="mt-4">
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                  <span>Ocupación</span>
                  <span>{porcentaje}%</span>
                </div>
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${Math.min(100, porcentaje)}%`, backgroundColor: 'var(--color-primary, #2563eb)' }}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {almacenes.length === 0 && (
        <EmptyState
          title="No hay almacenes"
          description="Crea uno para comenzar."
          children={<CrearAlmacen onSuccess={cargaAlmacenes} />}
        />
      )}

      <Modal isOpen={!!modalEditar} onClose={() => setModalEditar(null)} title="Editar almacén" size="md">
        {modalEditar && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre</label>
              <input
                type="text"
                value={nombreEditar}
                onChange={(e) => setNombreEditar(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                placeholder="Nombre del almacén"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Carriles</label>
                <input
                  type="number"
                  min={1}
                  value={cantidadCarriles}
                  onChange={(e) => setCantidadCarriles(parseInt(e.target.value, 10) || 1)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Niveles</label>
                <input
                  type="number"
                  min={1}
                  value={cantidadNiveles}
                  onChange={(e) => setCantidadNiveles(parseInt(e.target.value, 10) || 1)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Posiciones</label>
                <input
                  type="number"
                  min={1}
                  value={cantidadPosiciones}
                  onChange={(e) => setCantidadPosiciones(parseInt(e.target.value, 10) || 1)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Al guardar se recreará la estructura (carriles, niveles y posiciones). Solo disponible para almacenes vacíos.</p>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setModalEditar(null)}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardarEditar}
                disabled={guardando || !nombreEditar.trim()}
                className="flex-1 px-4 py-2 rounded-lg text-white font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ backgroundColor: 'var(--color-primary, #2563eb)' }}
              >
                {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Guardar
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default Almacenes
