import axios from 'axios'

export const plantillasProcesoApi = {
  listar: () => axios.get('/api/plantillas-proceso'),
  obtener: (id) => axios.get(`/api/plantillas-proceso/${id}`),
  predeterminada: (clienteId, especieId) =>
    axios.get('/api/plantillas-proceso/predeterminada', { params: { cliente_id: clienteId, especie_id: especieId } }),
  verificarProductoIngreso: (plantillaId, productoId) =>
    axios.get(`/api/plantillas-proceso/${plantillaId}/producto-ingreso/${productoId}`),
  historialSnapshots: () => axios.get('/api/plantillas-proceso/snapshots-historial'),
  crear: (data) => axios.post('/api/plantillas-proceso', data),
  actualizar: (id, data) => axios.put(`/api/plantillas-proceso/${id}`, data),
  marcarPredeterminada: (id, esPredeterminada) =>
    axios.patch(`/api/plantillas-proceso/${id}/predeterminada`, { es_predeterminada: esPredeterminada }),
  eliminar: (id) => axios.delete(`/api/plantillas-proceso/${id}`),
}
