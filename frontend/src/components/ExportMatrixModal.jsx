import { Eye, FileSpreadsheet, FileText } from 'lucide-react'
import Modal from './Modal'

export default function ExportMatrixModal({
  isOpen,
  onClose,
  title,
  rows = [],
  columns = [],
  orientation = 'portrait',
  onChangeOrientation,
  onExportPdf,
  onExportExcel,
  exporting,
}) {
  const previewRows = rows.slice(0, 8)
  const dualHead = (columns || []).some((c) => c.headerRow1 != null)
  const manyCols = (columns || []).length > 12
  const empty = !rows?.length

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Vista previa — ${title}`} size="xl">
      <div className="space-y-4">
        <div className="rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50/80 dark:bg-gray-900/40 px-3 py-2.5">
          <div className="flex flex-wrap items-start gap-3">
            <Eye className="w-4 h-4 text-primary-600 dark:text-primary-400 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Elija la orientación del PDF y exporte. También puede descargar Excel.
              </p>
              {manyCols && (
                <p className="text-xs text-amber-800 dark:text-amber-200/90">
                  Hay muchas columnas: suele verse mejor en <strong>horizontal</strong>.
                </p>
              )}
            </div>
            <fieldset className="ml-auto flex flex-wrap items-center gap-3 text-sm">
              <legend className="sr-only">Orientación PDF</legend>
              <label className="inline-flex items-center gap-2 cursor-pointer text-gray-700 dark:text-gray-300">
                <input
                  type="radio"
                  name="orientacion-export"
                  checked={orientation === 'portrait'}
                  onChange={() => onChangeOrientation?.('portrait')}
                  className="h-4 w-4 border-gray-300 dark:border-gray-500 text-primary-600 focus:ring-primary-500 dark:bg-gray-700 dark:focus:ring-primary-400"
                />
                Vertical
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer text-gray-700 dark:text-gray-300">
                <input
                  type="radio"
                  name="orientacion-export"
                  checked={orientation === 'landscape'}
                  onChange={() => onChangeOrientation?.('landscape')}
                  className="h-4 w-4 border-gray-300 dark:border-gray-500 text-primary-600 focus:ring-primary-500 dark:bg-gray-700 dark:focus:ring-primary-400"
                />
                Horizontal
              </label>
            </fieldset>
          </div>
        </div>

        <div className="overflow-auto rounded-lg border border-gray-200 dark:border-gray-700 max-h-80 bg-white dark:bg-gray-800/50 shadow-inner">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-100 dark:bg-gray-700/90">
              {dualHead ? (
                <>
                  <tr>
                    {columns.map((c) => (
                      <th
                        key={`${c.key}-h1`}
                        className="px-2 py-1.5 text-left font-medium text-gray-800 dark:text-gray-100 whitespace-nowrap border-b border-gray-200 dark:border-gray-600"
                      >
                        {c.headerRow1 ?? c.label}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {columns.map((c) => (
                      <th
                        key={`${c.key}-h2`}
                        className="px-2 py-1 text-left font-normal text-gray-600 dark:text-gray-300 whitespace-nowrap border-b border-gray-200 dark:border-gray-600"
                      >
                        {c.headerRow2 ?? ''}
                      </th>
                    ))}
                  </tr>
                </>
              ) : (
                <tr>
                  {columns.map((c) => (
                    <th
                      key={c.key}
                      className="px-2 py-1.5 text-left font-medium text-gray-800 dark:text-gray-100 whitespace-nowrap border-b border-gray-200 dark:border-gray-600"
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {empty ? (
                <tr>
                  <td
                    colSpan={Math.max(columns.length, 1)}
                    className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                  >
                    No hay filas para previsualizar. Verifique los datos del módulo.
                  </td>
                </tr>
              ) : (
                previewRows.map((r, i) => (
                  <tr
                    key={i}
                    className={i % 2 === 1 ? 'bg-gray-50/80 dark:bg-gray-900/30' : 'bg-white dark:bg-transparent'}
                  >
                    {columns.map((c) => (
                      <td key={c.key} className="px-2 py-1.5 text-gray-800 dark:text-gray-200 whitespace-nowrap">
                        {r?.[c.key] ?? ''}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap justify-end gap-2 pt-1 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onExportPdf}
            disabled={!!exporting || empty}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileText className="w-4 h-4" /> PDF
          </button>
          <button
            type="button"
            onClick={onExportExcel}
            disabled={!!exporting || empty}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileSpreadsheet className="w-4 h-4" /> Excel
          </button>
        </div>
      </div>
    </Modal>
  )
}
