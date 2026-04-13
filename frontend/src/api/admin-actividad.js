import axios from 'axios'

const qs = (params) => {
  const sp = new URLSearchParams()
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v).trim() !== '') sp.append(k, v)
  })
  const s = sp.toString()
  return s ? `?${s}` : ''
}

/** Parámetros comunes: modulo, q, fecha_desde, fecha_hasta, usuario_id, usuario_rol, origen_tabla, orden (asc|desc) */
export const adminActividadApi = {
  listar: (params = {}) => axios.get(`/api/admin/actividad${qs(params)}`),
  resumen: (params = {}) => axios.get(`/api/admin/actividad/resumen${qs(params)}`),
}
