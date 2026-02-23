/**
 * Estado vacío reutilizable para listas y secciones sin datos.
 * @param {string} title - Título breve (ej. "No hay registros")
 * @param {string} [description] - Texto opcional debajo del título
 * @param {React.ReactNode} [children] - Acción opcional (botón, enlace)
 */
export default function EmptyState({ title = 'No hay datos', description, children }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <p className="text-base font-medium text-gray-600 dark:text-gray-400">{title}</p>
      {description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-500">{description}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}
