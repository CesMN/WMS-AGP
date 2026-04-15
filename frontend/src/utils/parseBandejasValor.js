/**
 * Parsea cantidad de bandejas (envasado / congelado): admite decimales (ej. 0,5).
 * @returns {{ clear?: boolean, skip?: boolean, num?: number }}
 */
export function parseBandejasValor(value) {
  const raw = String(value ?? '').trim().replace(',', '.')
  if (raw === '') return { clear: true }
  const n = parseFloat(raw)
  if (!Number.isFinite(n) || n < 0) return { skip: true }
  return { num: Math.round(n * 10000) / 10000 }
}
