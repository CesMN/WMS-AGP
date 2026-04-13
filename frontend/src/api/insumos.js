import axios from 'axios'

export const insumosApi = {
  listar: (params = {}) => axios.get('/api/insumos', { params }),
  obtener: (id) => axios.get(`/api/insumos/${id}`),
  crear: (data) => axios.post('/api/insumos', data),
  actualizar: (id, data) => axios.put(`/api/insumos/${id}`, data),
  eliminar: (id) => axios.delete(`/api/insumos/${id}`),

  proveedoresListar: (params = {}) => axios.get('/api/insumos/proveedores', { params }),
  proveedorObtener: (id) => axios.get(`/api/insumos/proveedores/${id}`),
  proveedorCrear: (data) => axios.post('/api/insumos/proveedores', data),
  proveedorActualizar: (id, data) => axios.put(`/api/insumos/proveedores/${id}`, data),
  proveedorEliminar: (id) => axios.delete(`/api/insumos/proveedores/${id}`),

  movimientosListar: (params = {}) => axios.get('/api/insumos/movimientos', { params }),
  movimientoObtener: (id) => axios.get(`/api/insumos/movimientos/${id}`),
  movimientoActualizar: (id, data) => axios.put(`/api/insumos/movimientos/${id}`, data),
  movimientoEliminar: (id) => axios.delete(`/api/insumos/movimientos/${id}`),
  movimientoIngreso: (data) => axios.post('/api/insumos/movimientos/ingreso', data),
  movimientoSalida: (data) => axios.post('/api/insumos/movimientos/salida', data),

  documentosListar: (params = {}) => axios.get('/api/insumos/movimientos/documentos', { params }),
  documentoObtener: (documentoId) => axios.get(`/api/insumos/movimientos/documentos/${documentoId}`),
  documentoCrear: (data) => axios.post('/api/insumos/movimientos/documento', data),
  documentoEliminar: (documentoId) => axios.delete(`/api/insumos/movimientos/documentos/${documentoId}`),

  stockResumen: () => axios.get('/api/insumos/stock'),
  lotesProduccionMeta: () => axios.get('/api/insumos/meta/lotes-produccion'),
}
