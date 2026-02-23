import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function PaginationBar({ total, limit, offset, onPageChange, className = '' }) {
  const page = Math.floor(offset / limit) + 1
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const desde = total === 0 ? 0 : offset + 1
  const hasta = Math.min(offset + limit, total)

  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600 dark:text-gray-400 ${className}`}>
      <span>
        Mostrando {desde}-{hasta} de {total} registros
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(0, offset - limit))}
          disabled={offset <= 0}
          className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Anterior"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="px-2 min-w-[80px] text-center">
          Pág. {page} de {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(offset + limit)}
          disabled={offset + limit >= total}
          className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Siguiente"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
