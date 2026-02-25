/**
 * Traduce códigos de lote a fecha legible.
 * - Julian: "195-26" → día del año 195, año 26 (2026) → 14/07/2026
 * - Republicano: "29N-H" → día 29, mes N (REPUBLICANOS), año H (según mapa) → 29/10/2025
 */

const REPUBLICAN_MES = {
  R: 1,
  E: 2,
  P: 3,
  U: 4,
  B: 5,
  L: 6,
  I: 7,
  C: 8,
  A: 9,
  N: 10,
  O: 11,
  S: 12,
}

/**
 * Parsea lote juliano: "195-26" (día del año - año en 2 dígitos).
 * Año 00-99 se interpreta como 2000-2099.
 */
function parseJulian(str) {
  const trimmed = String(str || '').trim()
  const match = trimmed.match(/^(\d{1,3})-(\d{2})$/)
  if (!match) return null
  const diaAno = parseInt(match[1], 10)
  const yearShort = parseInt(match[2], 10)
  if (diaAno < 1 || diaAno > 366 || isNaN(yearShort)) return null
  const year = 2000 + (yearShort % 100)
  const date = new Date(year, 0, 1)
  date.setDate(date.getDate() + diaAno - 1)
  if (date.getFullYear() !== year) return null
  return date
}

/**
 * Parsea lote republicano: "29N-H" (día + letra mes REPUBLICANOS + "-" + letra año).
 * anoLetrasMap: { "H": "2025", "I": "2026" } (letra → año completo).
 */
function parseRepublicano(str, anoLetrasMap) {
  const trimmed = String(str || '').trim()
  const match = trimmed.match(/^(\d{1,2})([REPUBLICANOS])-([A-Za-z])$/i)
  if (!match) return null
  const dia = parseInt(match[1], 10)
  const mesLetra = match[2].toUpperCase()
  const anoLetra = match[3].toUpperCase()
  const mes = REPUBLICAN_MES[mesLetra]
  if (!mes || dia < 1 || dia > 31) return null
  const ano = anoLetrasMap && (anoLetrasMap[anoLetra] != null || anoLetrasMap[anoLetra.toLowerCase()] != null)
    ? parseInt(anoLetrasMap[anoLetra] || anoLetrasMap[anoLetra.toLowerCase()], 10)
    : null
  if (ano == null || isNaN(ano)) return null
  const date = new Date(ano, mes - 1, dia)
  if (date.getDate() !== dia || date.getMonth() !== mes - 1 || date.getFullYear() !== ano) return null
  return date
}

/**
 * Traduce un string de lote a fecha en formato DD/MM/YYYY, o null si no se puede traducir.
 * @param {string} loteStr - Código del lote (ej. "195-26" o "29N-H")
 * @param {Object} anoLetrasMap - Mapa letra → año para formato republicano (ej. { H: "2025" })
 * @returns {string|null} Fecha "DD/MM/YYYY" o null
 */
export function traducirLoteAFecha(loteStr, anoLetrasMap = {}) {
  if (loteStr == null || String(loteStr).trim() === '') return null
  const normalizedMap = {}
  if (anoLetrasMap && typeof anoLetrasMap === 'object') {
    Object.keys(anoLetrasMap).forEach((k) => {
      const v = anoLetrasMap[k]
      if (v != null && v !== '') normalizedMap[k.toUpperCase()] = String(v)
    })
  }
  let date = parseRepublicano(loteStr, normalizedMap)
  if (!date) date = parseJulian(loteStr)
  if (!date || isNaN(date.getTime())) return null
  const d = date.getDate()
  const m = date.getMonth() + 1
  const y = date.getFullYear()
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
}
