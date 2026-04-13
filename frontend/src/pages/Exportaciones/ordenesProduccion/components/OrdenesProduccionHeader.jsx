import { Ship, Plus } from 'lucide-react'

export default function OrdenesProduccionHeader({ soloLectura, onNuevaOrden }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5 sm:mb-6">
      <div className="flex items-start gap-3 min-w-0">
        <div className="p-2 rounded-lg bg-primary-100 dark:bg-primary-900/40 shrink-0">
          <Ship className="w-6 h-6 text-primary-600 dark:text-primary-400" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white leading-tight">Órdenes de producción</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Pedidos de clientes para exportación</p>
        </div>
      </div>
      {!soloLectura && (
        <button
          type="button"
          onClick={onNuevaOrden}
          className="inline-flex items-center justify-center gap-2 w-full sm:w-auto min-h-[44px] px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium shrink-0"
        >
          <Plus className="w-5 h-5 shrink-0" />
          Nueva orden
        </button>
      )}
    </div>
  )
}
