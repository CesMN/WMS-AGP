import axios from 'axios'

export const controlProduccionApi = {
  lotesActivos: () => axios.get('/api/control-produccion/lotes-activos'),
  porLote: (loteId) => axios.get(`/api/control-produccion/por-lote/${loteId}`),
  opcionesOp: (productoId) => axios.get('/api/control-produccion/opciones-op', { params: { producto_id: productoId } }),
  guardarAsignacion: (loteId, asignacion) =>
    axios.put(`/api/control-produccion/por-lote/${loteId}/asignacion`, { asignacion }),
  aplicarOp: (loteId) => axios.post(`/api/control-produccion/por-lote/${loteId}/aplicar-op`),
}
