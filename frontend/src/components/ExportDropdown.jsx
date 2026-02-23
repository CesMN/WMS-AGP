import { useState } from 'react'
import { Download, FileText, FileSpreadsheet, Loader2, Layers } from 'lucide-react'
import { useConfig } from '../contexts/ConfigContext'
import { exportToPdf, exportToExcel } from '../utils/exportReport'
import toast from 'react-hot-toast'

/**
 * getExportConfig: () => ({
 *   fetchData: async () => ({ data }),
 *   fetchDataWithDetail?: async () => ({ data, detailRows }),
 *   columns: [{ key, label }],
 *   detailColumns?: [{ key, label }],
 *   detailTitle?: string,
 *   title: string,
 *   filtersSummary?: string
 * })
 */
export default function ExportDropdown({ getExportConfig, className = '', disabled = false }) {
  const { logoEmpresa, nombreEmpresa } = useConfig()
  const [open, setOpen] = useState(false)
  const [exporting, setExporting] = useState(null)

  const handleExport = async (format, withDetail = false) => {
    const config = getExportConfig?.()
    if (!config?.fetchData || !config?.columns?.length || !config?.title) return
    const key = `${format}${withDetail ? '-detail' : ''}`
    setExporting(key)
    try {
      let data, detailRows = []
      if (withDetail && config.fetchDataWithDetail && config.detailColumns?.length) {
        const res = await config.fetchDataWithDetail()
        data = res?.data ?? []
        detailRows = res?.detailRows ?? []
      } else {
        const res = await config.fetchData()
        data = res?.data ?? res ?? []
      }
      const filtersText = config.filtersSummary || ''
      const logoUrl = (logoEmpresa && logoEmpresa.trim()) ? logoEmpresa.trim() : ''
      const appName = (nombreEmpresa && nombreEmpresa.trim()) ? nombreEmpresa.trim() : 'Sistema WMS'
      const detailOptions = detailRows.length && config.detailColumns?.length
        ? {
            detailRows,
            detailColumns: config.detailColumns,
            detailTitle: config.detailTitle || 'Detalle',
            detailSheetName: config.detailTitle || 'Detalle',
          }
        : {}
      const exportOptions = { ...detailOptions, appName }
      if (format === 'pdf') {
        exportToPdf(data, config.columns, config.title, filtersText, logoUrl, exportOptions)
      } else {
        exportToExcel(data, config.columns, config.title, filtersText, logoUrl, exportOptions)
      }
      toast.success(withDetail ? 'Exportado con detalle correctamente' : 'Exportado correctamente')
      setOpen(false)
    } catch (e) {
      console.error(e)
      toast.error(e?.response?.data?.message || 'Error al exportar')
    } finally {
      setExporting(null)
    }
  }

  const config = open ? getExportConfig?.() : null
  const hasDetail = !!(config?.fetchDataWithDetail && config?.detailColumns?.length)

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium disabled:opacity-50"
      >
        <Download className="w-5 h-5" />
        Exportar
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 mt-1 py-1 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-20">
            <button
              type="button"
              disabled={!!exporting}
              onClick={() => handleExport('pdf')}
              className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              {exporting === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              Exportar a PDF
            </button>
            <button
              type="button"
              disabled={!!exporting}
              onClick={() => handleExport('excel')}
              className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              {exporting === 'excel' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
              Exportar a Excel
            </button>
            {hasDetail && (
              <>
                <div className="border-t border-gray-200 dark:border-gray-600 my-1" />
                <div className="px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" />
                  Con detalle
                </div>
                <button
                  type="button"
                  disabled={!!exporting}
                  onClick={() => handleExport('pdf', true)}
                  className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  {exporting === 'pdf-detail' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                  PDF con detalle
                </button>
                <button
                  type="button"
                  disabled={!!exporting}
                  onClick={() => handleExport('excel', true)}
                  className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  {exporting === 'excel-detail' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
                  Excel con detalle
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
