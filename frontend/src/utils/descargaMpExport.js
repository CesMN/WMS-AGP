import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import 'jspdf-autotable'

const PDF_PRIMARY = [37, 99, 235]
const PDF_HEADER_BG = [248, 250, 252]
const PDF_ALT_ROW = [249, 250, 251]

function pdfCell(v) {
  if (v == null || v === '') return '—'
  return String(v)
}

function addFooterPageNumbers(doc) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 14
  const n = doc.internal.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(148, 163, 184)
    doc.text(`Pág. ${i} / ${n}`, pageWidth - margin - 14, pageHeight - 8)
    doc.setTextColor(0, 0, 0)
  }
}

/** Columnas en el orden solicitado (pegado a plantillas tipo planilla histórica). */
export const DESCARGA_WINCHAS_EXPORT_COLUMNS = [
  { key: 'gui_interna', label: 'N° guía interna' },
  { key: 'fecha', label: 'Fecha' },
  { key: 'especie', label: 'Especie' },
  { key: 'usuario', label: 'Usuario' },
  { key: 'n_wincha', label: 'N° wincha' },
  { key: 'hora_inicio', label: 'Hora inicio' },
  { key: 'hora_final', label: 'Hora final' },
  { key: 'guia_remitente', label: 'N° guía remisión' },
  { key: 'ruc_proveedor', label: 'RUC del proveedor' },
  { key: 'razon_social', label: 'Razón social' },
  { key: 'desembarcadero', label: 'Desembarcadero' },
  { key: 'origen', label: 'Origen' },
  { key: 'placa_vehiculo', label: 'Placa del vehículo' },
  { key: 'ruc_transportista', label: 'RUC del transportista' },
  { key: 'dni_chofer', label: 'DNI del chofer' },
  { key: 'matricula_embarcacion', label: 'Matrícula de la embarcación' },
  { key: 'nombre_embarcacion', label: 'Nombre de la embarcación' },
  { key: 'cantidad_kg', label: 'Cantidad kg' },
  { key: 'peso_por_caja', label: 'Peso por caja' },
  { key: 'n_cajas', label: 'N° de cajas' },
]

/** Campos por wincha en el PDF (el resto va en “Información general”). */
const PDF_WINCHA_SOLO_KEYS = [
  'n_wincha',
  'hora_inicio',
  'hora_final',
  'guia_remitente',
  'matricula_embarcacion',
  'nombre_embarcacion',
  'cantidad_kg',
  'peso_por_caja',
  'n_cajas',
]

function formatFechaPe(v) {
  if (v == null || v === '') return ''
  const s = String(v).trim()
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`
  const d = new Date(s)
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }
  return s
}

function formatHora(v) {
  if (v == null || v === '') return ''
  const s = String(v).trim()
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`
  return s
}

/** Intenta obtener solo el DNI desde "Datos chofer" (ej. "DNI: 03699810" o solo dígitos). */
export function extraerDniChofer(texto) {
  const t = String(texto || '').trim()
  if (!t) return ''
  const m = t.match(/DNI\s*[:\s]?\s*(\d+)/i)
  if (m) return m[1]
  const soloDigitos = t.replace(/\D/g, '')
  if (soloDigitos.length >= 8) return soloDigitos
  return t
}

/**
 * @param {object} d - Respuesta de descargaObtener (incl. winchas)
 * @returns {Array<object>} Una fila por wincha
 */
export function buildDescargaWinchasExportRows(d) {
  const winchas = Array.isArray(d?.winchas) ? d.winchas : []
  const placa = d.placas_vehiculo || d.vehiculo_placas || ''
  const dni = extraerDniChofer(d.datos_chofer)
  const base = {
    gui_interna: d.numero_guia_interna ?? '',
    fecha: formatFechaPe(d.fecha_descarga),
    especie: String(d.especie_nombre || '').trim().toUpperCase(),
    usuario: d.cliente_nombre ?? '',
    ruc_proveedor: d.ruc_proveedor ?? '',
    razon_social: d.proveedor_razon_social ?? '',
    desembarcadero: d.desembarcadero ?? '',
    origen: d.origen ?? '',
    placa_vehiculo: placa,
    ruc_transportista: d.ruc_transportista ?? '',
    dni_chofer: dni,
  }

  return winchas.map((w) => {
    const cajas = Number(w.cajas) || 0
    const kg = Number(w.peso_kg) || 0
    let ppc =
      w.peso_por_caja != null && w.peso_por_caja !== ''
        ? Number(w.peso_por_caja)
        : null
    if (ppc == null || Number.isNaN(ppc)) {
      ppc = cajas > 0 ? kg / cajas : null
    }
    if (ppc != null && !Number.isNaN(ppc)) {
      ppc = Math.round(ppc * 100) / 100
    }

    return {
      ...base,
      n_wincha: w.numero_wincha ?? '',
      hora_inicio: formatHora(w.hora_inicio),
      hora_final: formatHora(w.hora_final),
      guia_remitente: w.numero_guia_remitente ?? '',
      matricula_embarcacion: w.matricula_embarcacion ?? '',
      nombre_embarcacion: w.nombre_embarcacion ?? '',
      cantidad_kg: kg > 0 ? Math.round(kg * 10) / 10 : '',
      peso_por_caja: ppc != null && !Number.isNaN(ppc) ? ppc : '',
      n_cajas: cajas > 0 ? cajas : '',
    }
  })
}

/**
 * Excel solo encabezados + filas (sin bloque de título), para pegar en otras planillas.
 */
export function exportDescargaWinchasExcel(detail) {
  const rows = buildDescargaWinchasExportRows(detail)
  const cols = DESCARGA_WINCHAS_EXPORT_COLUMNS
  const headers = cols.map((c) => c.label)
  const dataRows = rows.map((row) => cols.map((c) => {
    const v = row[c.key]
    return v === null || v === undefined ? '' : v
  }))
  const wb = XLSX.utils.book_new()
  const mainData = [headers, ...dataRows]
  const ws = XLSX.utils.aoa_to_sheet(mainData)
  const len = (v) => (v != null ? String(v).length : 0)
  ws['!cols'] = cols.map((c, i) => {
    const colRows = dataRows.map((r) => r[i])
    const maxLen = Math.max(len(c.label), ...colRows.map((r) => len(r)))
    return { wch: Math.min(50, Math.max(10, maxLen + 1)) }
  })
  const gui = String(detail.numero_guia_interna || detail.id || 'descarga').replace(/[\\/:*?"<>|]/g, '_')
  XLSX.utils.book_append_sheet(wb, ws, 'Winchas')
  XLSX.writeFile(wb, `Descarga_${gui}_winchas_${Date.now()}.xlsx`)
}

/**
 * PDF en formato vertical: resumen de la descarga + una tabla legible (Campo | Valor) por wincha.
 * El Excel no se modifica.
 */
export function exportDescargaWinchasPdf(detail, options = {}) {
  const { appName = 'Sistema WMS', filtersText = 'Ninguno' } = options
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 14
  const labelColW = 58
  const contentW = pageWidth - margin * 2
  const valueColW = contentW - labelColW

  const gui = detail.numero_guia_interna || detail.id
  const headerH = 24
  doc.setFillColor(...PDF_HEADER_BG)
  doc.rect(0, 0, pageWidth, headerH, 'F')
  doc.setDrawColor(226, 232, 240)
  doc.line(0, headerH, pageWidth, headerH)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(0, 0, 0)
  doc.text(String(appName), margin, 11)
  doc.setFontSize(11)
  doc.text(`Descarga de materia prima — Guía interna ${pdfCell(gui)}`, margin, 18)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(100, 116, 139)
  let genLine = `Generado: ${new Date().toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}`
  if (filtersText && filtersText !== 'Ninguno') genLine += `  |  ${filtersText}`
  doc.text(genLine, margin, 23)
  doc.setTextColor(0, 0, 0)

  const generalRows = [
    ['N° guía interna', pdfCell(detail.numero_guia_interna)],
    ['Fecha de descarga', pdfCell(formatFechaPe(detail.fecha_descarga))],
    ['Lote', pdfCell(detail.lote_codigo)],
    ['Estado', pdfCell(detail.estado)],
    ['Especie', pdfCell(String(detail.especie_nombre || '').trim().toUpperCase())],
    ['Cliente (usuario)', pdfCell(detail.cliente_nombre)],
    ['Proveedor / Razón social', pdfCell(detail.proveedor_razon_social)],
    ['RUC del proveedor', pdfCell(detail.ruc_proveedor)],
    ['Desembarcadero', pdfCell(detail.desembarcadero)],
    ['Origen', pdfCell(detail.origen)],
    ['Placa del vehículo', pdfCell(detail.placas_vehiculo || detail.vehiculo_placas)],
    ['RUC del transportista', pdfCell(detail.ruc_transportista)],
    ['DNI del chofer', pdfCell(extraerDniChofer(detail.datos_chofer))],
  ]
  const dcRaw = String(detail.datos_chofer || '').trim()
  const dniSolo = extraerDniChofer(detail.datos_chofer)
  if (dcRaw && dcRaw.replace(/\s+/g, ' ') !== dniSolo && dcRaw.length > String(dniSolo).length) {
    generalRows.push(['Datos chofer (texto completo)', pdfCell(dcRaw)])
  }

  let startY = headerH + 5
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('Información general', margin, startY)
  startY += 4

  doc.autoTable({
    startY,
    head: [['Campo', 'Valor']],
    body: generalRows,
    theme: 'striped',
    styles: {
      fontSize: 8.5,
      cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
      overflow: 'linebreak',
      valign: 'top',
      minCellHeight: 4,
    },
    headStyles: { fillColor: PDF_PRIMARY, textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
    alternateRowStyles: { fillColor: PDF_ALT_ROW },
    columnStyles: {
      0: { cellWidth: labelColW, fontStyle: 'bold', textColor: [30, 41, 59] },
      1: { cellWidth: valueColW },
    },
    margin: { left: margin, right: margin },
    tableLineColor: [226, 232, 240],
  })

  const winchas = Array.isArray(detail.winchas) ? detail.winchas : []
  const builtRows = buildDescargaWinchasExportRows(detail)

  if (winchas.length === 0) {
    let yEmpty = doc.lastAutoTable.finalY + 8
    if (yEmpty > pageHeight - 30) {
      doc.addPage('p', 'a4')
      yEmpty = margin + 6
    }
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(9)
    doc.text('No hay winchas registradas en esta descarga.', margin, yEmpty)
  }

  winchas.forEach((w, idx) => {
    const row = builtRows[idx] || {}
    let yTitle = doc.lastAutoTable.finalY + 10
    if (yTitle > pageHeight - 55) {
      doc.addPage('p', 'a4')
      yTitle = margin + 8
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(30, 41, 59)
    doc.text(`Wincha ${idx + 1} de ${winchas.length}  ·  N° ${pdfCell(w.numero_wincha)}`, margin, yTitle)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(0, 0, 0)

    const winchaBody = PDF_WINCHA_SOLO_KEYS.map((key) => {
      const col = DESCARGA_WINCHAS_EXPORT_COLUMNS.find((c) => c.key === key)
      return [col ? col.label : key, pdfCell(row[key])]
    })

    doc.autoTable({
      startY: yTitle + 5,
      head: [['Dato', 'Detalle']],
      body: winchaBody,
      theme: 'striped',
      styles: {
        fontSize: 8.5,
        cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
        overflow: 'linebreak',
        valign: 'top',
        minCellHeight: 4,
      },
      headStyles: { fillColor: PDF_PRIMARY, textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
      alternateRowStyles: { fillColor: PDF_ALT_ROW },
      columnStyles: {
        0: { cellWidth: labelColW, fontStyle: 'bold', textColor: [30, 41, 59] },
        1: { cellWidth: valueColW },
      },
      margin: { left: margin, right: margin },
      tableLineColor: [226, 232, 240],
    })
  })

  if (winchas.length > 1) {
    const totalKg = winchas.reduce((s, w) => s + (Number(w.peso_kg) || 0), 0)
    const totalCajas = winchas.reduce((s, w) => s + (Number(w.cajas) || 0), 0)
    let yTot = doc.lastAutoTable.finalY + 8
    if (yTot > pageHeight - 25) {
      doc.addPage('p', 'a4')
      yTot = margin + 6
    }
    doc.setFillColor(254, 243, 199)
    doc.setDrawColor(251, 191, 36)
    doc.rect(margin, yTot, contentW, 12, 'FD')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(120, 53, 15)
    doc.text(
      `Totales (${winchas.length} winchas): ${totalKg.toFixed(2)} kg  ·  ${totalCajas} cajas`,
      margin + 3,
      yTot + 7
    )
    doc.setTextColor(0, 0, 0)
  }

  addFooterPageNumbers(doc)

  const safeName = `Descarga_guia_${String(gui).replace(/[\\/:*?"<>|]/g, '_')}_winchas`
  doc.save(`${safeName}_${Date.now()}.pdf`)
}

/**
 * Consolida filas de exportación de todas las descargas de un lote.
 * @param {Array<object>} detallesDescarga
 * @returns {Array<object>}
 */
export function buildDescargaLoteExportRows(detallesDescarga = []) {
  return (Array.isArray(detallesDescarga) ? detallesDescarga : []).flatMap((d) => buildDescargaWinchasExportRows(d))
}

/**
 * Excel de resumen por lote (una fila por wincha) con el mismo layout de columnas acordado.
 */
export function exportDescargaLoteWinchasExcel(detallesDescarga, options = {}) {
  const rows = buildDescargaLoteExportRows(detallesDescarga)
  const cols = DESCARGA_WINCHAS_EXPORT_COLUMNS
  const headers = cols.map((c) => c.label)
  const dataRows = rows.map((row) => cols.map((c) => {
    const v = row[c.key]
    return v === null || v === undefined ? '' : v
  }))
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows])
  const len = (v) => (v != null ? String(v).length : 0)
  ws['!cols'] = cols.map((c, i) => {
    const colRows = dataRows.map((r) => r[i])
    const maxLen = Math.max(len(c.label), ...colRows.map((r) => len(r)))
    return { wch: Math.min(50, Math.max(10, maxLen + 1)) }
  })
  const loteCodigo = String(options.loteCodigo || 'lote').replace(/[\\/:*?"<>|]/g, '_')
  XLSX.utils.book_append_sheet(wb, ws, 'Resumen lote')
  XLSX.writeFile(wb, `Descarga_lote_${loteCodigo}_winchas_${Date.now()}.xlsx`)
}

/**
 * PDF de resumen por lote (tabla única de winchas del lote).
 */
export function exportDescargaLoteWinchasPdf(detallesDescarga, options = {}) {
  const rows = buildDescargaLoteExportRows(detallesDescarga)
  const {
    appName = 'Sistema WMS',
    loteCodigo = '—',
    orientation = 'landscape',
  } = options
  const doc = new jsPDF({ orientation: orientation === 'portrait' ? 'portrait' : 'landscape', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 10
  const headerH = 16
  const cols = DESCARGA_WINCHAS_EXPORT_COLUMNS

  doc.setFillColor(...PDF_HEADER_BG)
  doc.rect(0, 0, pageWidth, headerH, 'F')
  doc.setDrawColor(226, 232, 240)
  doc.line(0, headerH, pageWidth, headerH)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text(`${appName} — Resumen de descarga por lote`, margin, 7)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(100, 116, 139)
  doc.text(
    `Lote: ${loteCodigo} | Winchas: ${rows.length} | Generado: ${new Date().toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}`,
    margin,
    12
  )
  doc.setTextColor(0, 0, 0)

  const headers = cols.map((c) => c.label)
  const body = rows.map((row) => cols.map((c) => {
    const v = row[c.key]
    return v == null ? '' : String(v)
  }))

  doc.autoTable({
    startY: headerH + 4,
    head: [headers],
    body,
    theme: 'striped',
    styles: { fontSize: 6.8, cellPadding: 1.8 },
    headStyles: { fillColor: PDF_PRIMARY, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: PDF_ALT_ROW },
    margin: { left: margin, right: margin },
    tableLineColor: [226, 232, 240],
  })

  addFooterPageNumbers(doc)
  const safeLote = String(loteCodigo || 'lote').replace(/[\\/:*?"<>|]/g, '_')
  doc.save(`Descarga_lote_${safeLote}_winchas_${Date.now()}.pdf`)
}
