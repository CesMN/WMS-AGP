import { ESTADOS } from '../constants'

export default function OrdenesProduccionFilters({
  filtroEstado,
  setFiltroEstado,
  filtroClienteExportacion,
  setFiltroClienteExportacion,
  filtroClienteProduccion,
  setFiltroClienteProduccion,
  filtroEspecie,
  setFiltroEspecie,
  clientesExportacion,
  clientesProduccion,
  especies,
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
      <select
        value={filtroEstado}
        onChange={(e) => setFiltroEstado(e.target.value)}
        className="w-full min-h-[44px] px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm"
      >
        <option value="">Todos los estados</option>
        {ESTADOS.map((e) => (
          <option key={e} value={e}>
            {e}
          </option>
        ))}
      </select>
      <select
        value={filtroClienteExportacion}
        onChange={(e) => setFiltroClienteExportacion(e.target.value)}
        className="w-full min-h-[44px] px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm min-w-0"
      >
        <option value="">Cliente exportación</option>
        {clientesExportacion.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>
      <select
        value={filtroClienteProduccion}
        onChange={(e) => setFiltroClienteProduccion(e.target.value)}
        className="w-full min-h-[44px] px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm min-w-0"
      >
        <option value="">Cliente producción</option>
        {clientesProduccion.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>
      <select
        value={filtroEspecie}
        onChange={(e) => setFiltroEspecie(e.target.value)}
        className="w-full min-h-[44px] px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm min-w-0"
      >
        <option value="">Especie</option>
        {especies.map((e) => (
          <option key={e.id} value={e.id}>
            {e.nombre}
          </option>
        ))}
      </select>
    </div>
  )
}
