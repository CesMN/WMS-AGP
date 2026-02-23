import { jsPDF } from 'jspdf'
import 'jspdf-autotable'
import * as XLSX from 'xlsx'

const PDF_PRIMARY = [37, 99, 235] // blue-600
const PDF_HEADER_BG = [248, 250, 252]
const PDF_ALT_ROW = [249, 250, 251]

/**
 * Formatea valor para celda (fechas, números).
 */
function cellValue(val) {
  if (val == null) return ''
  if (typeof val === 'object' && val instanceof Date) return val.toLocaleString('es-ES')
  return String(val)
}

const DEFAULT_APP_NAME = 'Sistema WMS'

/**
 * Exporta datos a PDF con encabezado compacto (logo, nombre app, título), tabla principal y opcional tabla de detalle.
 * @param {Array<Object>} data - Filas de datos
 * @param {Array<{key: string, label: string}>} columns - Columnas
 * @param {string} title - Título del informe
 * @param {string} filtersText - Texto de filtros (opcional)
 * @param {string} logoUrl - URL base64 del logo (opcional)
 * @param {{ detailRows?: Array<Object>, detailColumns?: Array<{key: string, label: string}>, detailTitle?: string, appName?: string }} options - Detalle opcional, appName para encabezado
 */
export function exportToPdf(data, columns, title, filtersText = '', logoUrl = '', options = {}) {
  const { detailRows = [], detailColumns = [], detailTitle = 'Detalle', appName = DEFAULT_APP_NAME } = options
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 14
  const headerHeight = 18
  let logoRight = margin

  // Encabezado compacto: fondo y línea inferior
  doc.setFillColor(...PDF_HEADER_BG)
  doc.rect(0, 0, pageWidth, headerHeight, 'F')
  doc.setDrawColor(226, 232, 240)
  doc.line(0, headerHeight, pageWidth, headerHeight)

  // Logo pequeño (izquierda)
  if (logoUrl && logoUrl.trim()) {
    try {
      doc.addImage(logoUrl, 'PNG', margin, 3, 16, 8)
      logoRight = margin + 18
    } catch {
      try {
        doc.addImage(logoUrl, 'JPEG', margin, 3, 16, 8)
        logoRight = margin + 18
      } catch {
        logoRight = margin
      }
    }
  }

  // Nombre de la aplicación + título del informe (misma línea, fuente pequeña)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(0, 0, 0)
  doc.text(`${appName} — ${title}`, logoRight, 8)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(100, 116, 139)
  const genText = `Generado: ${new Date().toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}${filtersText && filtersText !== 'Ninguno' ? `  |  Filtros: ${filtersText}` : ''}`
  doc.text(genText, logoRight, 13)
  doc.setTextColor(0, 0, 0)

  let y = headerHeight + 4

  // Tabla principal
  const headers = columns.map((c) => c.label)
  const rows = data.map((row) => columns.map((c) => cellValue(row[c.key])))
  doc.autoTable({
    startY: y,
    head: [headers],
    body: rows,
    theme: 'striped',
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: PDF_PRIMARY, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: PDF_ALT_ROW },
    margin: { left: margin, right: margin },
    tableLineColor: [226, 232, 240],
    didDrawPage: (table) => {
      const finalY = table.cursor ? table.cursor.y : y
      if (finalY > doc.internal.pageSize.getHeight() - 18) return
      doc.setFontSize(8)
      doc.setTextColor(148, 163, 184)
      doc.text(
        `Pág. ${doc.internal.getNumberOfPages()}`,
        pageWidth - margin - 10,
        doc.internal.pageSize.getHeight() - 10
      )
      doc.setTextColor(0, 0, 0)
    },
  })
  y = doc.lastAutoTable ? doc.lastAutoTable.finalY + 10 : y + 40

  // Tabla de detalle (nueva página si hay poco espacio)
  if (detailRows.length > 0 && detailColumns.length > 0) {
    if (y > doc.internal.pageSize.getHeight() - 50) {
      doc.addPage('l', 'a4')
      y = 15
    }
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text(detailTitle, margin, y)
    doc.setFont('helvetica', 'normal')
    y += 6
    const dHeaders = detailColumns.map((c) => c.label)
    const dRows = detailRows.map((row) => detailColumns.map((c) => cellValue(row[c.key])))
    doc.autoTable({
      startY: y,
      head: [dHeaders],
      body: dRows,
      theme: 'striped',
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [71, 85, 105], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: PDF_ALT_ROW },
      margin: { left: margin, right: margin },
      tableLineColor: [226, 232, 240],
    })
  }

  // Pie en última página
  doc.setFontSize(8)
  doc.setTextColor(148, 163, 184)
  doc.text(
    `Pág. ${doc.internal.getNumberOfPages()}`,
    pageWidth - margin - 10,
    doc.internal.pageSize.getHeight() - 10
  )
  doc.setTextColor(0, 0, 0)

  doc.save(`${title.replace(/\s+/g, '_')}_${Date.now()}.pdf`)
}

/**
 * Calcula ancho sugerido para columna en Excel (aprox. caracteres).
 */
function excelColWidth(header, rows) {
  const len = (v) => (v != null ? String(v).length : 0)
  const maxLen = Math.max(len(header), ...rows.map((r) => len(r)))
  return Math.min(50, Math.max(10, maxLen + 1))
}

/**
 * Exporta datos a Excel con hoja principal (encabezado compacto: app + título + fecha), formato y opcional hoja de detalle.
 * @param {Array<Object>} data - Filas de datos
 * @param {Array<{key: string, label: string}>} columns - Columnas
 * @param {string} title - Título (nombre de hoja)
 * @param {string} filtersText - Texto de filtros (opcional)
 * @param {string} _logoUrl - No usado en Excel
 * @param {{ detailRows?: Array<Object>, detailColumns?: Array<{key: string, label: string}>, detailSheetName?: string, appName?: string }} options - Detalle opcional, appName para encabezado
 */
export function exportToExcel(data, columns, title, filtersText = '', _logoUrl = '', options = {}) {
  const { detailRows = [], detailColumns = [], detailSheetName = 'Detalle', appName = DEFAULT_APP_NAME } = options
  const wb = XLSX.utils.book_new()
  const safeTitle = (t) => t.slice(0, 31).replace(/[/\\*?:\[\]]/g, ' ').trim() || 'Datos'

  // Hoja principal: encabezado compacto (nombre app + título; fecha y filtros en una línea)
  const headers = columns.map((c) => c.label)
  const rows = data.map((row) => columns.map((c) => (row[c.key] != null ? row[c.key] : '')))
  const segundaLinea = `Generado: ${new Date().toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}${filtersText && filtersText !== 'Ninguno' ? `  |  Filtros: ${filtersText}` : ''}`
  const mainData = [[`${appName} — ${title}`], [segundaLinea], []]
  mainData.push(headers)
  rows.forEach((r) => mainData.push(r))
  const ws = XLSX.utils.aoa_to_sheet(mainData)
  const colWidths = columns.map((c, i) => {
    const header = c.label
    const colRows = rows.map((r) => r[i])
    return { wch: excelColWidth(header, colRows) }
  })
  ws['!cols'] = colWidths
  XLSX.utils.book_append_sheet(wb, ws, safeTitle(title))

  // Hoja de detalle
  if (detailRows.length > 0 && detailColumns.length > 0) {
    const dHeaders = detailColumns.map((c) => c.label)
    const dRows = detailRows.map((row) => detailColumns.map((c) => (row[c.key] != null ? row[c.key] : '')))
    const detailData = [dHeaders, ...dRows]
    const wsDetail = XLSX.utils.aoa_to_sheet(detailData)
    wsDetail['!cols'] = detailColumns.map((c, i) => ({
      wch: excelColWidth(c.label, dRows.map((r) => r[i])),
    }))
    XLSX.utils.book_append_sheet(wb, wsDetail, safeTitle(detailSheetName))
  }

  XLSX.writeFile(wb, `${title.replace(/\s+/g, '_')}_${Date.now()}.xlsx`)
}
