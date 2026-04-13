import axios from 'axios'

export const empaqueEspecificacionesApi = {
  componentesListar: (params = {}) => axios.get('/api/empaque-especificaciones/componentes', { params }),
  componenteCrear: (data) => axios.post('/api/empaque-especificaciones/componentes', data),
  componenteActualizar: (id, data) => axios.put(`/api/empaque-especificaciones/componentes/${id}`, data),
  componenteEliminar: (id) => axios.delete(`/api/empaque-especificaciones/componentes/${id}`),

  plantillasListar: (params = {}) => axios.get('/api/empaque-especificaciones/plantillas', { params }),
  plantillaObtener: (id) => axios.get(`/api/empaque-especificaciones/plantillas/${id}`),
  plantillaCrear: (data) => axios.post('/api/empaque-especificaciones/plantillas', data),
  plantillaActualizar: (id, data) => axios.put(`/api/empaque-especificaciones/plantillas/${id}`, data),
  plantillaEliminar: (id) => axios.delete(`/api/empaque-especificaciones/plantillas/${id}`),

  ajustesLoteListar: (loteId) => axios.get(`/api/empaque-especificaciones/lotes/${loteId}/ajustes`),
  ajusteLoteCrear: (loteId, data) => axios.post(`/api/empaque-especificaciones/lotes/${loteId}/ajustes`, data),
  ajusteLoteEliminar: (loteId, ajusteId) => axios.delete(`/api/empaque-especificaciones/lotes/${loteId}/ajustes/${ajusteId}`),
  agregarAProduccion: (loteId, data) => axios.post(`/api/empaque-especificaciones/lotes/${loteId}/agregar-a-produccion`, data),

  conciliacion: (params = {}) => axios.get('/api/empaque-especificaciones/conciliacion', { params }),

  procesoPlantillasListar: () => axios.get('/api/empaque-especificaciones/proceso-plantillas'),
  procesoPlantillaDetalle: (id) => axios.get(`/api/empaque-especificaciones/proceso-plantillas/${id}/detalle`),
  procesoPlantillaGuardarDetalle: (id, data) => axios.put(`/api/empaque-especificaciones/proceso-plantillas/${id}/detalle`, data),
  procesoPlantillaItemCrear: (id, data) => axios.post(`/api/empaque-especificaciones/proceso-plantillas/${id}/items`, data),
  procesoPlantillaItemActualizar: (id, itemId, data) => axios.put(`/api/empaque-especificaciones/proceso-plantillas/${id}/items/${itemId}`, data),
  procesoPlantillaItemEliminar: (id, itemId) => axios.delete(`/api/empaque-especificaciones/proceso-plantillas/${id}/items/${itemId}`),
}

