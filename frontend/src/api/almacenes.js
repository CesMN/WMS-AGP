import axios from 'axios'

export const almacenesApi = {
  listar: () => axios.get('/api/almacenes'),
  obtener: (id) => axios.get(`/api/almacenes/${id}`),
  crear: (data) => axios.post('/api/almacenes', data),
  actualizar: (id, data) => axios.put(`/api/almacenes/${id}`, data),
  eliminar: (id) => axios.delete(`/api/almacenes/${id}`),
  carriles: (almacenId) => axios.get(`/api/almacenes/${almacenId}/carriles`),
  nivelesPosiciones: (almacenId, carrilId) =>
    axios.get(`/api/almacenes/${almacenId}/carriles/${carrilId}/niveles-posiciones`),
  obtenerPosicion: (almacenId, carrilId, posicionId) =>
    axios.get(`/api/almacenes/${almacenId}/carriles/${carrilId}/posiciones/${posicionId}`),
  actualizarPosicion: (almacenId, carrilId, posicionId, data) =>
    axios.patch(`/api/almacenes/${almacenId}/carriles/${carrilId}/posiciones/${posicionId}`, data),
  crearStock: (almacenId, carrilId, posicionId, data) =>
    axios.post(`/api/almacenes/${almacenId}/carriles/${carrilId}/posiciones/${posicionId}/stock`, data),
  actualizarStock: (almacenId, carrilId, posicionId, stockId, data) =>
    axios.put(`/api/almacenes/${almacenId}/carriles/${carrilId}/posiciones/${posicionId}/stock/${stockId}`, data),
  eliminarStock: (almacenId, carrilId, posicionId, stockId) =>
    axios.delete(`/api/almacenes/${almacenId}/carriles/${carrilId}/posiciones/${posicionId}/stock/${stockId}`),
  moverStock: (almacenId, carrilId, posicionId, stockId, data) =>
    axios.post(`/api/almacenes/${almacenId}/carriles/${carrilId}/posiciones/${posicionId}/stock/${stockId}/mover`, data),
  moverTodoPosicion: (almacenId, carrilId, posicionId, data) =>
    axios.post(`/api/almacenes/${almacenId}/carriles/${carrilId}/posiciones/${posicionId}/mover-todo`, data),
}
