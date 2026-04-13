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

/**
 * Exporta una matriz en formato vertical (A4) compacta.
 * Pensado para vistas tipo Envasado/Congelado/Empaque.
 */
export function exportMatrixVerticalPdf(rows, columns, title, filtersText = '', options = {}) {
  const { appName = DEFAULT_APP_NAME, totalColumnKeys = [], orientation = 'portrait', fillPageHeight = true } = options
  const totalSet = new Set(totalColumnKeys || [])
  const doc = new jsPDF({ orientation: orientation === 'landscape' ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 5
  const headerH = 11

  doc.setFillColor(...PDF_HEADER_BG)
  doc.rect(0, 0, pageW, headerH, 'F')
  doc.setDrawColor(226, 232, 240)
  doc.line(0, headerH, pageW, headerH)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text(`${appName} — ${title}`, margin, 5)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5.5)
  const meta = `Generado: ${new Date().toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}${filtersText ? ` | ${filtersText}` : ''}`
  doc.text(meta, margin, 8.5)

  const dualHead = (columns || []).some((c) => c.headerRow1 != null)
  const headers = columns.map((c) => c.label)
  const head = dualHead
    ? [
        columns.map((c) => (c.headerRow1 != null ? c.headerRow1 : c.label)),
        columns.map((c) => (c.headerRow2 != null ? c.headerRow2 : '')),
      ]
    : [headers]
  const body = (rows || []).map((r) => columns.map((c) => (r?.[c.key] != null ? r[c.key] : '')))
  const totalsRow = columns.map((c, idx) => {
    if (idx === 0) return 'TOTAL'
    const vals = (rows || [])
      .map((r) => Number(r?.[c.key]))
      .filter((n) => Number.isFinite(n))
    if (vals.length === 0) return ''
    const s = vals.reduce((a, b) => a + b, 0)
    return Number.isInteger(s) ? s : Number(s.toFixed(2))
  })
  const bodyWithTotals = [...body, totalsRow]
  const totalRowIndex = body.length
  const colStyles = {}
  columns.forEach((c, idx) => {
    if (totalSet.has(c.key)) colStyles[idx] = { fillColor: [255, 247, 210], fontStyle: 'bold' }
  })

  const startY = headerH + 1
  const bottomM = 3
  const availTable = pageH - startY - bottomM
  const headRowCount = head.length
  const bodyRows = bodyWithTotals.length
  const totalRows = headRowCount + bodyRows
  let minCellHeight = 2.4
  let fontSize = 4.5
  let headFontSize = 4.8
  let cellPadding = 0.55
  if (fillPageHeight && bodyRows > 0 && totalRows > 0) {
    const targetPerRow = availTable / totalRows
    minCellHeight = Math.max(2.2, Math.min(14, targetPerRow * 0.88))
    const scale = Math.min(1.45, Math.max(0.88, targetPerRow / 3.4))
    fontSize = Math.min(7.5, Math.max(4.2, 4.5 * scale))
    headFontSize = Math.min(7.8, fontSize + 0.25)
    cellPadding = Math.min(1.35, Math.max(0.35, minCellHeight * 0.11))
  }

  doc.autoTable({
    startY,
    head,
    body: bodyWithTotals,
    theme: 'grid',
    styles: { fontSize, cellPadding, minCellHeight, overflow: 'linebreak', valign: 'middle' },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold', fontSize: headFontSize, cellPadding: cellPadding + 0.1, valign: 'middle' },
    columnStyles: colStyles,
    tableWidth: 'auto',
    margin: { left: margin, right: margin, top: 2, bottom: bottomM },
    didParseCell: (hook) => {
      if (hook.section === 'body' && hook.row.index === totalRowIndex) {
        hook.cell.styles.fillColor = [226, 232, 240]
        hook.cell.styles.fontStyle = 'bold'
      }
    },
  })

  doc.save(`${title.replace(/\s+/g, '_')}_${Date.now()}.pdf`)
}

/**
 * Exporta una matriz a Excel en una sola hoja.
 */
export function exportMatrixExcelSingleSheet(rows, columns, title, filtersText = '', options = {}) {
  const { appName = DEFAULT_APP_NAME } = options
  const wb = XLSX.utils.book_new()
  const safeTitle = (t) => t.slice(0, 31).replace(/[/\\*?:\[\]]/g, ' ').trim() || 'Datos'
  const dualHead = (columns || []).some((c) => c.headerRow1 != null)
  const headers = columns.map((c) => c.label)
  const headerRow1 = dualHead ? columns.map((c) => (c.headerRow1 != null ? c.headerRow1 : c.label)) : null
  const headerRow2 = dualHead ? columns.map((c) => (c.headerRow2 != null ? c.headerRow2 : '')) : null
  const dataRows = (rows || []).map((r) => columns.map((c) => (r?.[c.key] != null ? r[c.key] : '')))
  const totalsRow = columns.map((c, idx) => {
    if (idx === 0) return 'TOTAL'
    const vals = (rows || [])
      .map((r) => Number(r?.[c.key]))
      .filter((n) => Number.isFinite(n))
    if (vals.length === 0) return ''
    const s = vals.reduce((a, b) => a + b, 0)
    return Number.isInteger(s) ? s : Number(s.toFixed(2))
  })
  const top = [[`${appName} — ${title}`], [`Generado: ${new Date().toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}${filtersText ? ` | ${filtersText}` : ''}`], []]
  const tableHead = dualHead && headerRow1 && headerRow2 ? [headerRow1, headerRow2] : [headers]
  const ws = XLSX.utils.aoa_to_sheet([...top, ...tableHead, ...dataRows, totalsRow])
  ws['!cols'] = columns.map((c, idx) => {
    const headerLabel = dualHead
      ? [c.headerRow1 ?? c.label, c.headerRow2 ?? '', c.label].filter(Boolean).join(' ')
      : c.label
    return { wch: excelColWidth(headerLabel, dataRows.map((r) => r[idx])) }
  })
  XLSX.utils.book_append_sheet(wb, ws, safeTitle(title))
  XLSX.writeFile(wb, `${title.replace(/\s+/g, '_')}_${Date.now()}.xlsx`)
}

// Colores estilo "Parte de Producción"
const PARTE_HEADER_BG = [15, 23, 42]   // dark blue
const PARTE_HEADER_TEXT = [253, 224, 71] // yellow
const PARTE_SECTION_TITLE = [0, 0, 0]
const PARTE_TABLE_HEAD = [30, 58, 138]   // blue-900
const PARTE_TOTAL_ROW = [253, 224, 71]   // yellow bg
const PARTE_GROUP_ROW = [241, 245, 249]  // gray-100
const PARTE_GREEN = [34, 197, 94]
const PARTE_RED = [239, 68, 68]

function formatHora(val) {
  if (val == null || val === '') return ''
  if (typeof val === 'string' && /^\d{1,2}:\d{2}$/.test(val)) return val
  if (typeof val === 'string') return val
  return String(val)
}

/**
 * Exporta el Parte de Producción a PDF (una hoja A4 compacta: I–IV + observaciones).
 * @param {Object} data - { lote, recepcion_mp, resultados_produccion, rendimiento_pct, insumos, insumos_operativos }
 * @param {{ nombreEmpresa?: string, usuario?: string, logoUrl?: string }} options
 */
export function exportParteProduccionPdf(data, options = {}) {
  const { nombreEmpresa = 'Sistema WMS', usuario = '', logoUrl = '' } = options
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 9
  /** Tablas compactas para caber en una sola página */
  const tableBody = { fontSize: 5, cellPadding: 0.8 }
  const tableHead = { fillColor: PARTE_TABLE_HEAD, textColor: 255, fontStyle: 'bold', fontSize: 5.5, cellPadding: 1 }
  let y

  const fecha = data.lote?.fecha_creacion
    ? new Date(data.lote.fecha_creacion).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : new Date().toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const especie = (data.lote?.especie_nombre || 'PRODUCCIÓN').toUpperCase()
  const titulo = `PARTE DE PRODUCCION ${especie}`
  const codigoLote = data.lote?.codigo || '—'
  const usuarioTxt = (usuario || '—').trim()

  // Encabezado compacto: cinta central + una línea izq./dcha para no solapar sección I
  const headerTop = 5
  const boxW = 82
  const boxH = 9
  const boxX = (pageW - boxW) / 2
  const leftMaxW = Math.max(36, boxX - margin - 2)

  doc.setFillColor(...PARTE_HEADER_BG)
  doc.rect(boxX, headerTop, boxW, boxH, 'F')
  doc.setTextColor(...PARTE_HEADER_TEXT)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text(nombreEmpresa.toUpperCase(), pageW / 2, headerTop + 3.2, { align: 'center' })
  doc.setFontSize(6.5)
  doc.text(titulo, pageW / 2, headerTop + 7, { align: 'center' })

  doc.setTextColor(0, 0, 0)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  const izq1 = `N° PARTE: ${codigoLote}`
  const izq2 = `USUARIO: ${usuarioTxt.length > 40 ? `${usuarioTxt.slice(0, 38)}…` : usuarioTxt}`
  doc.text(izq1, margin, headerTop + 3.2, { maxWidth: leftMaxW })
  doc.text(izq2, margin, headerTop + 7, { maxWidth: leftMaxW })

  doc.setFont('helvetica', 'normal')
  doc.text(`FECHA: ${fecha}`, pageW - margin, headerTop + 3.2, { align: 'right' })
  doc.text(`LOTE: ${codigoLote}`, pageW - margin, headerTop + 7, { align: 'right' })

  y = headerTop + boxH + 3

  // I. RECEPCION DE MATERIA PRIMA
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('I. RECEPCION DE MATERIA PRIMA', margin, y)
  y += 4
  const winchas = data.recepcion_mp?.winchas || []
  const headersI = ['N° GUIA', 'PROVEEDOR', 'MUELLE', 'ORIGEN MP', 'PLACA', 'N° WINCHA', 'H. INICIO', 'H. FINAL', 'MATR. E/P', 'NOMBRE E/P', 'KG WINCHA', 'DESC. %', 'CANT. C/DESC.']
  const rowsI = winchas.map((w) => [
    w.n_guia || '',
    (w.proveedor || '').slice(0, 18),
    (w.muelle || '').slice(0, 15),
    (w.origen_mp || '').slice(0, 12),
    (w.placa_vehiculo || '').slice(0, 12),
    w.n_wincha || '',
    formatHora(w.h_inicio),
    formatHora(w.h_final),
    (w.matricula_ep || '').slice(0, 10),
    (w.nombre_ep || '').slice(0, 12),
    Number(w.cantidad_kg_wincha) || 0,
    Number(w.descuento_pct) || 0,
    Number(w.cantidad_con_desc) || 0,
  ])
  const totalKg = data.recepcion_mp?.resumen?.total_kg ?? 0
  if (rowsI.length > 0) rowsI.push(['', '', '', '', '', '', '', '', '', '', 'TOTAL KG', '0', totalKg])
  doc.autoTable({
    startY: y,
    head: [headersI],
    body: rowsI,
    theme: 'plain',
    styles: { ...tableBody },
    headStyles: { ...tableHead },
    margin: { left: margin, right: margin, bottom: 10 },
    tableLineColor: [200, 200, 200],
    didParseCell: (hook) => {
      if (hook.row.index === rowsI.length - 1 && rowsI.length > 0)
        hook.cell.styles.fillColor = PARTE_TOTAL_ROW
    },
  })
  y = doc.lastAutoTable.finalY + 3

  // II. RESUMEN DE EMPAQUE
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('II. RESUMEN DE EMPAQUE', margin, y)
  y += 4
  const resumen = data.resultados_produccion || []
  const totalProdKg = resumen.reduce((s, p) => s + (Number(p.empaque_kg) || 0), 0)
  const headersII = ['CODIGO', 'DESCRIPCION', 'PRESENT.', 'FORMATO', 'CAJAS/SACOS', 'TOTAL KG', 'REND. % A MP']
  const rowsII = resumen.map((p) => {
    const kg = Number(p.empaque_kg) || 0
    const rendMp = totalKg > 0 ? ((kg / totalKg) * 100).toFixed(1) : '0'
    return [
      p.codigo || '',
      (p.descripcion || p.producto || '').trim(),
      (p.presentacion || '').trim(),
      p.formato_label || '',
      Number(p.empaque_bultos) || 0,
      kg,
      `${rendMp}%`,
    ]
  })
  if (rowsII.length > 0) {
    const totBultos = resumen.reduce((s, p) => s + (Number(p.empaque_bultos) || 0), 0)
    rowsII.push(['Total', '', '', '', totBultos, totalProdKg, data.rendimiento_pct != null ? `${data.rendimiento_pct}%` : '—'])
  }
  doc.autoTable({
    startY: y,
    head: [headersII],
    body: rowsII,
    theme: 'plain',
    styles: { ...tableBody, valign: 'top' },
    headStyles: { ...tableHead },
    columnStyles: {
      0: { cellWidth: 15 },
      1: { cellWidth: 68, overflow: 'linebreak' },
      2: { cellWidth: 22, overflow: 'linebreak' },
      3: { cellWidth: 16 },
      4: { cellWidth: 16, halign: 'right' },
      5: { cellWidth: 15, halign: 'right' },
      6: { cellWidth: 16, halign: 'right' },
    },
    margin: { left: margin, right: margin, bottom: 10 },
    tableLineColor: [200, 200, 200],
    didParseCell: (hook) => {
      if (hook.row.index === rowsII.length - 1 && rowsII.length > 0)
        hook.cell.styles.fillColor = PARTE_TOTAL_ROW
    },
  })
  y = doc.lastAutoTable.finalY + 2
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.text(`IDEAL PRODUCCION (KG): ${totalProdKg.toFixed(2)}`, margin, y)
  y += 4

  // III. INSUMOS DE EMPAQUE (plantilla / conciliación; sin operativos generales)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('III. INSUMOS DE EMPAQUE (PLANTILLA)', margin, y)
  y += 4
  const insumos = data.insumos || []
  if (insumos.length > 0) {
    doc.autoTable({
      startY: y,
      head: [['CODIGO', 'DESCRIPCION', 'CANTIDAD', 'UNID. MEDIDA', 'RATIO TM']],
      body: insumos.map((i) => [i.codigo || '', i.descripcion || '', i.cantidad ?? '', i.unidad_medida || '', i.ratio_tm ?? '']),
      theme: 'plain',
      styles: { ...tableBody },
      headStyles: { ...tableHead },
      margin: { left: margin, right: margin, bottom: 10 },
      columnStyles: {
        0: { cellWidth: 18 },
        1: { cellWidth: 92, overflow: 'linebreak' },
        2: { cellWidth: 18, halign: 'right' },
        3: { cellWidth: 16 },
        4: { cellWidth: 16, halign: 'right' },
      },
    })
    y = doc.lastAutoTable.finalY + 3
  } else {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6)
    doc.text('(Sin datos de empaque)', margin, y + 3)
    y += 7
  }

  // IV. INSUMOS OPERATIVOS GENERALES (agua, hielo, bunker — no son empaque)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('IV. INSUMOS OPERATIVOS GENERALES', margin, y)
  y += 3
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(5.5)
  doc.text('Agua/hielo: plantilla x TM MP. Bunker: galones en conciliacion.', margin, y)
  y += 3
  const insOp = data.insumos_operativos || []
  if (insOp.length > 0) {
    doc.autoTable({
      startY: y,
      head: [['CODIGO', 'DESCRIPCION', 'ORIGEN', 'CANTIDAD', 'UNID.', 'RATIO TM']],
      body: insOp.map((i) => [
        i.codigo || '',
        i.descripcion || '',
        i.fuente === 'calculado_tm_mp'
          ? 'TM MP'
          : i.fuente === 'manual_resumen'
            ? 'Resumen manual'
            : i.fuente === 'salidas_documento'
              ? 'Documento'
              : i.fuente || '',
        i.cantidad ?? '',
        i.unidad_medida || '',
        i.ratio_tm ?? '',
      ]),
      theme: 'plain',
      styles: { ...tableBody },
      headStyles: { ...tableHead },
      margin: { left: margin, right: margin, bottom: 10 },
      columnStyles: {
        0: { cellWidth: 14 },
        1: { cellWidth: 38 },
        2: { cellWidth: 22 },
        3: { cellWidth: 18, halign: 'right' },
        4: { cellWidth: 12 },
        5: { cellWidth: 16, halign: 'right' },
      },
    })
    y = doc.lastAutoTable.finalY + 3
  } else {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6)
    doc.text('(Sin datos)', margin, y + 3)
    y += 7
  }

  // V. OBSERVACIONES
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('V. OBSERVACIONES', margin, y)
  y += 4
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  const obs = (data.lote?.observaciones || '').trim()
  const obsW = pageW - 2 * margin
  const lineH = 2.4
  const maxObsLines = Math.max(2, Math.floor((pageH - y - 7) / lineH))
  let obsLines = doc.splitTextToSize(obs || '—', obsW)
  if (obsLines.length > maxObsLines) {
    obsLines = obsLines.slice(0, maxObsLines)
    obsLines[maxObsLines - 1] = `${String(obsLines[maxObsLines - 1] || '').slice(0, 80)}…`
  }
  doc.text(obsLines, margin, y)
  doc.save(`Parte_Produccion_${(data.lote?.codigo || 'lote').replace(/\s+/g, '_')}_${Date.now()}.pdf`)
}

/**
 * Exporta el Parte de Producción a Excel (secciones I a V: empaque y operativos separados).
 */
export function exportParteProduccionExcel(data, options = {}) {
  const { nombreEmpresa = 'Sistema WMS', usuario = '' } = options
  const wb = XLSX.utils.book_new()
  const safeTitle = (t) => t.slice(0, 31).replace(/[/\\*?:\[\]]/g, ' ').trim() || 'Parte'
  const fecha = data.lote?.fecha_creacion
    ? new Date(data.lote.fecha_creacion).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : new Date().toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const especie = (data.lote?.especie_nombre || 'PRODUCCIÓN').toUpperCase()
  const titulo = `PARTE DE PRODUCCION ${especie}`

  const rows = []
  rows.push([`${nombreEmpresa} — ${titulo}`])
  rows.push(['N° PARTE:', data.lote?.codigo || '', '', '', 'FECHA:', fecha, 'LOTE:', data.lote?.codigo || ''])
  rows.push(['USUARIO:', usuario || ''])
  rows.push([])

  rows.push(['I. RECEPCION DE MATERIA PRIMA'])
  const headersI = ['N° GUIA', 'PROVEEDOR', 'MUELLE', 'ORIGEN MP', 'PLACA', 'N° WINCHA', 'H. INICIO', 'H. FINAL', 'MATR. E/P', 'NOMBRE E/P', 'KG WINCHA', 'DESC. %', 'CANT. C/DESC.']
  rows.push(headersI)
  const winchas = data.recepcion_mp?.winchas || []
  winchas.forEach((w) => {
    rows.push([
      w.n_guia || '',
      w.proveedor || '',
      w.muelle || '',
      w.origen_mp || '',
      w.placa_vehiculo || '',
      w.n_wincha || '',
      formatHora(w.h_inicio),
      formatHora(w.h_final),
      w.matricula_ep || '',
      w.nombre_ep || '',
      Number(w.cantidad_kg_wincha) || 0,
      Number(w.descuento_pct) || 0,
      Number(w.cantidad_con_desc) || 0,
    ])
  })
  const totalKg = data.recepcion_mp?.resumen?.total_kg ?? 0
  if (winchas.length > 0) rows.push(['', '', '', '', '', '', '', '', '', '', 'TOTAL KG', '0', totalKg])
  rows.push([])

  rows.push(['II. RESUMEN DE EMPAQUE'])
  const headersII = ['CODIGO', 'DESCRIPCION', 'PRESENTACION', 'FORMATO', 'CAJAS/SACOS', 'TOTAL KG', 'REND. % A MP']
  rows.push(headersII)
  const resumen = data.resultados_produccion || []
  const totalProdKg = resumen.reduce((s, p) => s + (Number(p.empaque_kg) || 0), 0)
  resumen.forEach((p) => {
    const kg = Number(p.empaque_kg) || 0
    const rendMp = totalKg > 0 ? ((kg / totalKg) * 100).toFixed(1) : '0'
    rows.push([
      p.codigo || '',
      p.descripcion || p.producto || '',
      p.presentacion || '',
      p.formato_label || '',
      Number(p.empaque_bultos) || 0,
      kg,
      `${rendMp}%`,
    ])
  })
  if (resumen.length > 0) {
    const totBultos = resumen.reduce((s, p) => s + (Number(p.empaque_bultos) || 0), 0)
    rows.push(['Total', '', '', '', totBultos, totalProdKg, data.rendimiento_pct != null ? `${data.rendimiento_pct}%` : '—'])
  }
  rows.push(['IDEAL PRODUCCION (KG):', totalProdKg])
  rows.push([])

  rows.push(['III. INSUMOS DE EMPAQUE (PLANTILLA)'])
  rows.push(['CODIGO', 'DESCRIPCION', 'CANTIDAD', 'UNID. MEDIDA', 'RATIO TM'])
  ;(data.insumos || []).forEach((i) => rows.push([i.codigo || '', i.descripcion || '', i.cantidad ?? '', i.unidad_medida || '', i.ratio_tm ?? '']))
  rows.push([])

  rows.push(['IV. INSUMOS OPERATIVOS GENERALES (no empaque)'])
  rows.push(['CODIGO', 'DESCRIPCION', 'ORIGEN', 'CANTIDAD', 'UNID. MEDIDA', 'RATIO TM'])
  ;(data.insumos_operativos || []).forEach((i) =>
    rows.push([
      i.codigo || '',
      i.descripcion || '',
      i.fuente === 'calculado_tm_mp'
        ? 'TM MP'
        : i.fuente === 'manual_resumen'
          ? 'Resumen manual'
          : i.fuente === 'salidas_documento'
            ? 'Documento'
            : i.fuente || '',
      i.cantidad ?? '',
      i.unidad_medida || '',
      i.ratio_tm ?? '',
    ])
  )
  rows.push([])

  rows.push(['V. OBSERVACIONES'])
  rows.push([data.lote?.observaciones || ''])

  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 10 }, { wch: 22 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 8 }, { wch: 12 }]
  XLSX.utils.book_append_sheet(wb, ws, safeTitle(`Parte ${data.lote?.codigo || 'Produccion'}`))
  XLSX.writeFile(wb, `Parte_Produccion_${(data.lote?.codigo || 'lote').replace(/\s+/g, '_')}_${Date.now()}.xlsx`)
}
