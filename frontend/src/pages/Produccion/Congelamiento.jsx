import { Snowflake } from 'lucide-react'

const Congelamiento = () => (
  <div>
    <div className="flex items-center gap-3 mb-6">
      <Snowflake className="w-8 h-8 text-[var(--color-primary,#2563eb)]" />
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Congelamiento</h1>
    </div>
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center text-gray-500 dark:text-gray-400">
      <p className="text-lg">Módulo en construcción.</p>
      <p className="mt-2 text-sm">Se vinculará con el lote de producción creado e iniciado.</p>
    </div>
  </div>
)

export default Congelamiento
