import axios from 'axios'

export const ordenesExportacionApi = {
  listar: (params = {}) => axios.get('/api/ordenes-exportacion', { params }),
  pedidosListos: (params = {}) => axios.get('/api/ordenes-exportacion/pedidos-listos', { params }),
  contenedoresListosExportacion: (params = {}) =>
    axios.get('/api/ordenes-exportacion/contenedores-listos-exportacion', { params }),
  listosDespachoGrupos: (params = {}) =>
    axios.get('/api/ordenes-exportacion/listos-despacho-grupos', { params }),
  listosDespachoGrupoDetalle: (params) =>
    axios.get('/api/ordenes-exportacion/listos-despacho-grupo-detalle', { params }),
  actualizarFechaProbableEmbarque: (ordenId, data) =>
    axios.patch(`/api/ordenes-exportacion/${ordenId}/fecha-probable-embarque`, data),
  obtener: (id) => axios.get(`/api/ordenes-exportacion/${id}`),
  embarqueDetalle: (id) => axios.get(`/api/ordenes-exportacion/${id}/embarque-detalle`),
  crear: (data) => axios.post('/api/ordenes-exportacion', data),
  actualizar: (id, data) => axios.put(`/api/ordenes-exportacion/${id}`, data),
  completar: (id, data = {}) => axios.patch(`/api/ordenes-exportacion/${id}/completar`, data),
  actualizarLinea: (ordenId, lineaId, data) =>
    axios.patch(`/api/ordenes-exportacion/${ordenId}/lineas/${lineaId}`, data),
  imputarDesdeStock: (ordenId, lineaId, data) =>
    axios.post(`/api/ordenes-exportacion/${ordenId}/lineas/${lineaId}/imputar-desde-stock`, data),
  completarLinea: (ordenId, lineaId, data = {}) =>
    axios.patch(`/api/ordenes-exportacion/${ordenId}/lineas/${lineaId}/completar`, data),
  reabrirLinea: (ordenId, lineaId) =>
    axios.patch(`/api/ordenes-exportacion/${ordenId}/lineas/${lineaId}/reabrir`),
  disponibilidadProductos: (ordenId) =>
    axios.get(`/api/ordenes-exportacion/${ordenId}/disponibilidad-productos`),
  detalleLotesLinea: (ordenId, lineaId) =>
    axios.get(`/api/ordenes-exportacion/${ordenId}/lineas/${lineaId}/detalle-lotes`),
  desvincularAsignacion: (ordenId, lineaId, asignacionId) =>
    axios.delete(`/api/ordenes-exportacion/${ordenId}/lineas/${lineaId}/asignaciones/${asignacionId}`),
  guardarDistribucionContenedor: (ordenId, contenedorId, data) =>
    axios.put(`/api/ordenes-exportacion/${ordenId}/contenedores/${contenedorId}/distribucion`, data),
  actualizarReferenciaExportacion: (ordenId, data) =>
    axios.patch(`/api/ordenes-exportacion/${ordenId}/referencia-exportacion`, data),
  marcarContenedorListoExportar: (ordenId, contenedorId, data = {}) =>
    axios.patch(`/api/ordenes-exportacion/${ordenId}/contenedores/${contenedorId}/listo-exportar`, data),
  marcarContenedorDespachado: (ordenId, contenedorId) =>
    axios.patch(`/api/ordenes-exportacion/${ordenId}/contenedores/${contenedorId}/despachar`),
  completarExportarContenedor: (ordenId, contenedorId, data) =>
    axios.patch(`/api/ordenes-exportacion/${ordenId}/contenedores/${contenedorId}/completar-exportar`, data),
  revertirExportacionContenedor: (ordenId, contenedorId) =>
    axios.patch(`/api/ordenes-exportacion/${ordenId}/contenedores/${contenedorId}/revertir-exportacion`),
  marcarContenedorExportado: (ordenId, contenedorId) =>
    axios.patch(`/api/ordenes-exportacion/${ordenId}/contenedores/${contenedorId}/marcar-exportado`),
  eliminar: (id) => axios.delete(`/api/ordenes-exportacion/${id}`),
}
