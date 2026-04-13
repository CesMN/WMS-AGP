import axios from 'axios'

export const notificacionesApi = {
  listar: (params = {}) => axios.get('/api/notificaciones', { params }),
  resumen: () => axios.get('/api/notificaciones/resumen'),
  marcarLeida: (id) => axios.patch(`/api/notificaciones/${id}/leida`),
  marcarTodasLeidas: () => axios.patch('/api/notificaciones/marcar-todas-leidas'),
  descartar: (id) => axios.patch(`/api/notificaciones/${id}/descartar`),
  descartarTodas: () => axios.patch('/api/notificaciones/descartar-todas'),
  streamUrl: () => {
    const token = localStorage.getItem('token') || ''
    const qs = token ? `?token=${encodeURIComponent(token)}` : ''
    return `/api/notificaciones/stream${qs}`
  },
}
