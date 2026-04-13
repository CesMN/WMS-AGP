import React, { useState, useEffect } from 'react'
import { Truck, Loader2, MapPin, Package, FileText, Pencil, Trash2, Search, RotateCcw } from 'lucide-react'
import { parihuelasApi } from '../../api/parihuelas'
import { almacenesApi } from '../../api/almacenes'
import Modal from '../../components/Modal'
import RotuloParihuela from '../../components/RotuloParihuela'
import toast from 'react-hot-toast'

const HORAS_OPCIONES = Array.from({ length: 24 }, (_, i) => i)
const etiquetaHora = (h) => {
  if (h === 0) return '12-1 AM'
  if (h < 12) return `${h}-${h + 1} AM`
  if (h === 12) return '12-1 PM'
  return `${h - 12}-${h - 11} PM`
}

const cantidadParihuelaValida = (raw) => {
  if (raw === '' || raw == null) return false
  const n = Number(raw)
  return !Number.isNaN(n) && n > 0
}

const LOTE_ABIERTO = ['Iniciado', 'En proceso']

const RecepcionParihuelas = () => {
  const [lotes, setLotes] = useState([])
  const [loteSeleccionado, setLoteSeleccionado] = useState(null)
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalParihuela, setModalParihuela] = useState(null)
  const [almacenes, setAlmacenes] = useState([])
  const [carriles, setCarriles] = useState([])
  const [nivelesPosiciones, setNivelesPosiciones] = useState([])
  const [incompletas, setIncompletas] = useState([])
  const [modo, setModo] = useState('nueva')
  const [posicionId, setPosicionId] = useState('')
  const [remonteStockId, setRemonteStockId] = useState('')
  const [almacenId, setAlmacenId] = useState('')
  const [carrilId, setCarrilId] = useState('')
  const [recepcionando, setRecepcionando] = useState(false)
  const [rotuloParihuelaId, setRotuloParihuelaId] = useState(null)
  const [editandoParihuela, setEditandoParihuela] = useState(null)
  const [editCantidad, setEditCantidad] = useState('')
  const [editHora, setEditHora] = useState(0)
  const [editReferencia, setEditReferencia] = useState('')
  const [guardandoEdit, setGuardandoEdit] = useState(false)
  const [eliminandoId, setEliminandoId] = useState(null)
  const [reabriendoId, setReabriendoId] = useState(null)
  const [busquedaId, setBusquedaId] = useState('')
  const [buscandoPorId, setBuscandoPorId] = useState(false)

  const loadLotesYLista = () => {
    setLoading(true)
    Promise.all([
      parihuelasApi.lotes(),
      parihuelasApi.listar({ limit: 500 })
    ])
      .then(([rLotes, rList]) => {
        setLotes(rLotes.data?.data ?? rLotes.data ?? [])
        setList(rList.data?.data ?? rList.data ?? [])
      })
      .catch(() => toast.error('Error al cargar'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadLotesYLista()
  }, [])

  const hayEnTransito = list.some((p) => p.estado === 'EN_TRANSITO')
  useEffect(() => {
    if (!hayEnTransito) return
    const id = setInterval(loadLotesYLista, 30000)
    return () => clearInterval(id)
  }, [hayEnTransito])

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') loadLotesYLista()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  useEffect(() => {
    almacenesApi.listar()
      .then(({ data }) => setAlmacenes(Array.isArray(data) ? data : (data?.data ?? [])))
      .catch(() => setAlmacenes([]))
  }, [])

  const openModal = (p) => {
    setModalParihuela(p)
    setModo('nueva')
    setPosicionId('')
    setRemonteStockId('')
    setAlmacenId('')
    setCarrilId('')
    setNivelesPosiciones([])
    setCarriles([])
    if (p?.producto_id) {
      parihuelasApi.incompletas(p.producto_id)
        .then(({ data }) => setIncompletas(data?.data ?? data ?? []))
        .catch(() => setIncompletas([]))
    } else {
      setIncompletas([])
    }
  }

  useEffect(() => {
    if (!almacenId) {
      setCarriles([])
      setCarrilId('')
      setNivelesPosiciones([])
      setPosicionId('')
      return
    }
    almacenesApi.carriles(almacenId)
      .then(({ data }) => setCarriles(Array.isArray(data) ? data : (data?.data ?? [])))
      .catch(() => setCarriles([]))
    setCarrilId('')
    setNivelesPosiciones([])
    setPosicionId('')
  }, [almacenId])

  useEffect(() => {
    if (!almacenId || !carrilId) {
      setNivelesPosiciones([])
      setPosicionId('')
      return
    }
    almacenesApi.nivelesPosiciones(almacenId, carrilId)
      .then(({ data }) => setNivelesPosiciones(Array.isArray(data) ? data : (data?.matriz ?? [])))
      .catch(() => setNivelesPosiciones([]))
    setPosicionId('')
  }, [almacenId, carrilId])

  const posicionesPlanas = () => {
    const out = []
    ;(nivelesPosiciones || []).forEach((n) => {
      (n.posiciones || []).forEach((p) => {
        out.push({ ...p, nivel_id: n.nivel_id, numero_nivel: n.numero_nivel })
      })
    })
    return out
  }

  const handleRecepcionar = () => {
    if (!modalParihuela?.id) return
    if (modo === 'remonte') {
      if (!remonteStockId) {
        toast.error('Seleccione una parihuela incompleta para remonte')
        return
      }
    } else {
      if (!posicionId) {
        toast.error('Seleccione una ubicación')
        return
      }
    }
    setRecepcionando(true)
    const payload = modo === 'remonte'
      ? { remonte_stock_posicion_id: remonteStockId }
      : { posicion_id: posicionId }
    parihuelasApi.recepcionar(modalParihuela.id, payload)
      .then(({ data }) => {
        const msg = data?.ubicacion ? `Recepcionada en ${data.ubicacion}` : 'Parihuela recepcionada correctamente'
        toast.success(msg)
        setModalParihuela(null)
        loadLotesYLista()
      })
      .catch((err) => {
        const d = err.response?.data;
        const msg = [d?.message, d?.detail].filter(Boolean).join(' — ');
        toast.error(msg || 'Error al recepcionar');
      })
      .finally(() => setRecepcionando(false))
  }

  const listFiltered = loteSeleccionado ? list.filter((p) => p.lote_id === loteSeleccionado.id) : []
  const puedeReabrir = (p) => p.estado === 'ALMACENADA' && p.lote_estado && LOTE_ABIERTO.includes(p.lote_estado)

  const handleBuscarPorId = () => {
    const id = busquedaId.trim()
    if (!id) { toast.error('Ingrese un ID'); return }
    const found = list.find((p) => p.id === id)
    if (found) {
      const lote = lotes.find((l) => l.id === found.lote_id)
      if (lote) setLoteSeleccionado(lote)
      if (found.estado === 'EN_TRANSITO') openModal(found)
      else toast.success('Parihuela encontrada (recepcionada)')
      setBusquedaId('')
    } else {
      setBuscandoPorId(true)
      parihuelasApi.obtener(id)
        .then(({ data }) => {
          if (data?.estado === 'EN_TRANSITO') {
            const lote = lotes.find((l) => l.id === data.lote_id)
            if (lote) setLoteSeleccionado(lote)
            openModal(data)
            setBusquedaId('')
            loadLotesYLista()
          } else {
            toast.error('La parihuela no está en tránsito o ya fue recepcionada')
          }
        })
        .catch(() => toast.error('ID no encontrado'))
        .finally(() => setBuscandoPorId(false))
    }
  }

  return (
    <div className="min-w-0 max-w-full">
      <div className="flex flex-wrap items-start gap-3 mb-4">
        <div className="p-2 rounded-lg bg-primary-100 dark:bg-primary-900/40 shrink-0">
          <Truck className="w-6 h-6 text-primary-600 dark:text-primary-400" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white leading-tight">Recepción de parihuelas</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Desde Empaque: elija lote, asigne ubicación o remonte.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 ml-auto">
          {lotes.length === 0 && !loading && (
            <span className="text-sm text-gray-500 dark:text-gray-400">No hay lotes con parihuelas.</span>
          )}
          {lotes.map((lote) => {
            const selected = loteSeleccionado?.id === lote.id
            const enTransito = Number(lote.en_transito) || 0
            const almacenadas = Number(lote.almacenadas) || 0
            return (
              <button
                key={lote.id}
                type="button"
                onClick={() => setLoteSeleccionado(lote)}
                className={`text-left min-h-[44px] px-4 py-2.5 rounded-xl border-2 min-w-[200px] transition-colors ${
                  selected
                    ? 'border-primary-500 bg-primary-500/20 dark:bg-primary-500/30 text-gray-900 dark:text-white'
                    : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:border-gray-300 dark:hover:border-gray-500'
                }`}
              >
                <div className="font-semibold text-base">{lote.codigo}</div>
                <div className="text-xs mt-0.5 text-gray-600 dark:text-gray-400">
                  {lote.cliente_nombre || '—'} — {lote.especie_nombre || '—'}
                </div>
                <div className="text-xs mt-1">
                  <span className="text-amber-600 dark:text-amber-400">{enTransito} en tránsito</span>
                  {almacenadas > 0 && <span className="text-gray-500 dark:text-gray-400"> · </span>}
                  {almacenadas > 0 && <span className="text-green-600 dark:text-green-400">{almacenadas} recepcionadas</span>}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 className="w-10 h-10 animate-spin text-primary-600" />
        </div>
      )}

      {!loading && lotes.length === 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center text-gray-500 dark:text-gray-400">
          No hay parihuelas. Genere parihuelas desde el módulo Empaque (Enviar a cámara).
        </div>
      )}

      {!loading && lotes.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 shrink-0">Buscar por ID (QR / pegar):</label>
            <input
              type="text"
              value={busquedaId}
              onChange={(e) => setBusquedaId(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleBuscarPorId(); }}
              placeholder="UUID de la parihuela"
              className="flex-1 min-w-[200px] min-h-[44px] px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            />
            <button type="button" onClick={handleBuscarPorId} disabled={buscandoPorId} className="inline-flex items-center justify-center gap-1 min-h-[44px] px-3 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50">
              {buscandoPorId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Buscar
            </button>
          </div>

          {!loteSeleccionado && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center text-gray-500 dark:text-gray-400">
              Seleccione un lote para ver y recepcionar sus parihuelas.
            </div>
          )}

          {loteSeleccionado && listFiltered.length === 0 && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center text-gray-500 dark:text-gray-400">
              No hay parihuelas para el lote {loteSeleccionado.codigo}.
            </div>
          )}

          {loteSeleccionado && listFiltered.length > 0 && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden shadow-sm">
              <div className="wms-table-scroll">
              <table className="min-w-[56rem] w-full text-sm">
                <thead className="bg-gray-100 dark:bg-gray-700">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-900 dark:text-gray-100">Producto</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-900 dark:text-gray-100">Cantidad</th>
                    <th className="px-3 py-2 text-center font-medium text-gray-900 dark:text-gray-100">Hora</th>
                    <th className="px-3 py-2 text-center font-medium text-gray-900 dark:text-gray-100">Completa</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-900 dark:text-gray-100">Estado</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-900 dark:text-gray-100">Ubicación</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-900 dark:text-gray-100">Referencia</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-900 dark:text-gray-100">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                  {listFiltered.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-3 py-2 text-gray-800 dark:text-gray-200">
                        {[p.producto_codigo, p.producto_descripcion || p.producto_nombre, p.producto_presentacion].filter(Boolean).join(' · ')}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-800 dark:text-gray-200">
                        {p.cantidad} {p.unidad_parihuela === 'CAJAS' ? 'cajas' : 'bultos'}
                      </td>
                      <td className="px-3 py-2 text-center text-gray-600 dark:text-gray-400">
                        {p.hora != null ? etiquetaHora(Number(p.hora)) : '—'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {p.es_completa ? (
                          <span className="text-green-600 dark:text-green-400 font-medium">Sí</span>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400">No</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {p.estado === 'EN_TRANSITO' ? (
                          <span className="text-amber-600 dark:text-amber-400 font-medium">En tránsito</span>
                        ) : (
                          <span className="text-green-600 dark:text-green-400 font-medium">Recepcionada</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-400 max-w-[220px] truncate" title={p.ubicacion || ''}>
                        {p.estado === 'ALMACENADA' && p.ubicacion ? p.ubicacion : '—'}
                      </td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{p.referencia || '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1 flex-wrap">
                          <button type="button" onClick={() => setRotuloParihuelaId(p.id)} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-500 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700" title="Ver / Imprimir rótulo">
                            <FileText className="w-3.5 h-3.5" />
                            Rótulo
                          </button>
                          {p.estado === 'EN_TRANSITO' && (
                            <>
                              <button type="button" onClick={() => { setEditandoParihuela(p); setEditCantidad(String(p.cantidad)); setEditHora(p.hora != null ? Number(p.hora) : new Date().getHours()); setEditReferencia(p.referencia || ''); }} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-500 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700" title="Editar">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button type="button" onClick={() => { if (window.confirm('¿Eliminar esta parihuela en tránsito?')) { setEliminandoId(p.id); parihuelasApi.eliminar(p.id).then(() => { toast.success('Parihuela eliminada'); loadLotesYLista(); }).catch((err) => toast.error(err.response?.data?.message || 'Error')).finally(() => setEliminandoId(null)); } }} disabled={eliminandoId === p.id} className="inline-flex items-center px-2 py-1 rounded-lg text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20" title="Eliminar">
                                {eliminandoId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                              </button>
                              <button type="button" onClick={() => openModal(p)} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-sm font-medium bg-primary-600 text-white hover:bg-primary-700">
                                <MapPin className="w-3.5 h-3.5" />
                                Recepcionar
                              </button>
                            </>
                          )}
                          {p.estado === 'ALMACENADA' && puedeReabrir(p) && (
                            <button
                              type="button"
                              onClick={() => {
                                if (!window.confirm('¿Reabrir esta parihuela? Se revertirá la recepción y podrá asignar otra ubicación.')) return
                                setReabriendoId(p.id)
                                parihuelasApi.reabrir(p.id)
                                  .then(() => {
                                    toast.success('Parihuela reabierta')
                                    loadLotesYLista()
                                  })
                                  .catch((err) => toast.error(err.response?.data?.message || 'Error al reabrir'))
                                  .finally(() => setReabriendoId(null))
                              }}
                              disabled={reabriendoId === p.id}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-sm font-medium border border-amber-500 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                              title="Reabrir para cambiar ubicación"
                            >
                              {reabriendoId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                              Reabrir
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </>
      )}

      <Modal
        isOpen={!!modalParihuela}
        onClose={() => setModalParihuela(null)}
        title="Recepcionar parihuela"
        size="md"
      >
        {modalParihuela && (
          <div className="space-y-4">
            <div className="rounded bg-gray-50 dark:bg-gray-800 p-3 text-sm text-gray-700 dark:text-gray-300">
              {[modalParihuela.producto_codigo, modalParihuela.producto_descripcion || modalParihuela.producto_nombre, modalParihuela.producto_presentacion].filter(Boolean).join(' · ')} — {modalParihuela.cantidad} {modalParihuela.unidad_parihuela === 'CAJAS' ? 'cajas' : 'bultos'}
              {modalParihuela.referencia && ` · Ref: ${modalParihuela.referencia}`}
            </div>

            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={modo === 'nueva'} onChange={() => setModo('nueva')} className="rounded border-gray-300 dark:border-gray-500" />
                <span className="text-sm text-gray-700 dark:text-gray-300">Nueva ubicación</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={modo === 'remonte'} onChange={() => setModo('remonte')} className="rounded border-gray-300 dark:border-gray-500" />
                <span className="text-sm text-gray-700 dark:text-gray-300">Remonte en parihuela incompleta</span>
              </label>
            </div>

            {modo === 'nueva' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">Almacén</label>
                  <select
                    value={almacenId}
                    onChange={(e) => setAlmacenId(e.target.value)}
                    className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-500 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="">Seleccione</option>
                    {almacenes.map((a) => (
                      <option key={a.id} value={a.id}>{a.nombre}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">Carril</label>
                  <select
                    value={carrilId}
                    onChange={(e) => setCarrilId(e.target.value)}
                    disabled={!almacenId}
                    className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-500 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
                  >
                    <option value="">Seleccione</option>
                    {carriles.map((c) => (
                      <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">Posición (Nivel + Posición; Vacía = sin stock)</label>
                  <select
                    value={posicionId}
                    onChange={(e) => setPosicionId(e.target.value)}
                    disabled={!carrilId}
                    className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-500 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
                  >
                    <option value="">Seleccione</option>
                    {posicionesPlanas().map((p) => {
                      const nivelPos = `Nivel ${p.numero_nivel} - Posición ${p.numero_posicion ?? p.nombre}`
                      const ocupacion = p.estado === 'Disponible'
                        ? ' (Vacía)'
                        : p.estado === 'Ocupado'
                          ? ` (Ocupada: ${p.producto_codigo || p.producto_nombre || 'producto'}, ${p.total_bultos ?? 0} bultos)`
                          : ' (Mix: varios productos)'
                      return (
                        <option key={p.id} value={p.id}>
                          {nivelPos}{ocupacion}
                        </option>
                      )
                    })}
                  </select>
                </div>
              </div>
            )}

            {modo === 'remonte' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">Parihuela incompleta (mismo producto)</label>
                <select
                  value={remonteStockId}
                  onChange={(e) => setRemonteStockId(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-500 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">Seleccione</option>
                  {incompletas.map((i) => (
                    <option key={i.stock_posicion_id} value={i.stock_posicion_id}>
                      {i.almacen_nombre} → {i.carril_nombre} N{i.numero_nivel} P{i.numero_posicion} — {i.cantidad_bultos} bultos
                    </option>
                  ))}
                </select>
                {incompletas.length === 0 && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">No hay parihuelas incompletas de este producto en almacén.</p>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setModalParihuela(null)} className="px-3 py-1.5 rounded-lg text-sm border border-gray-300 dark:border-gray-500 text-gray-700 dark:text-gray-300">
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleRecepcionar}
                disabled={recepcionando || (modo === 'nueva' ? !posicionId : !remonteStockId)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {recepcionando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
                Confirmar recepción
              </button>
            </div>
          </div>
        )}
      </Modal>

      {editandoParihuela && (
        <Modal isOpen onClose={() => setEditandoParihuela(null)} title="Editar parihuela" size="sm">
          <div className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">{[editandoParihuela.producto_codigo, editandoParihuela.producto_descripcion || editandoParihuela.producto_nombre, editandoParihuela.producto_presentacion].filter(Boolean).join(' · ')}</p>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">Cantidad</label>
              <input type="number" min="0" step="0.01" inputMode="decimal" value={editCantidad} onChange={(e) => setEditCantidad(e.target.value)} className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-500 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">Hora</label>
              <select value={editHora} onChange={(e) => setEditHora(Number(e.target.value))} className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-500 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                {HORAS_OPCIONES.map((h) => (<option key={h} value={h}>{etiquetaHora(h)}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">Referencia</label>
              <input type="text" value={editReferencia} onChange={(e) => setEditReferencia(e.target.value)} className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-500 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditandoParihuela(null)} className="px-3 py-1.5 rounded-lg text-sm border border-gray-300 dark:border-gray-500 text-gray-700 dark:text-gray-300">Cancelar</button>
              <button type="button" disabled={guardandoEdit || !cantidadParihuelaValida(editCantidad)} onClick={() => { if (!cantidadParihuelaValida(editCantidad)) return; setGuardandoEdit(true); parihuelasApi.actualizar(editandoParihuela.id, { cantidad: Number(editCantidad), hora: editHora, referencia: editReferencia.trim() || undefined }).then(() => { toast.success('Parihuela actualizada'); setEditandoParihuela(null); loadLotesYLista(); }).catch((err) => toast.error(err.response?.data?.message || 'Error')).finally(() => setGuardandoEdit(false)); }} className="px-3 py-1.5 rounded-lg text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50">
                {guardandoEdit ? <Loader2 className="w-4 h-4 animate-spin inline" /> : null}
                Guardar
              </button>
            </div>
          </div>
        </Modal>
      )}

      <RotuloParihuela
        parihuelaId={rotuloParihuelaId}
        onClose={() => setRotuloParihuelaId(null)}
        clienteNombre={(() => {
          const pr = list.find((p) => p.id === rotuloParihuelaId)
          const lote = pr ? lotes.find((l) => l.id === pr.lote_id) : null
          return lote?.cliente_nombre ?? null
        })()}
        especieNombre={(() => {
          const pr = list.find((p) => p.id === rotuloParihuelaId)
          const lote = pr ? lotes.find((l) => l.id === pr.lote_id) : null
          return lote?.especie_nombre ?? null
        })()}
      />
    </div>
  )
}

export default RecepcionParihuelas
