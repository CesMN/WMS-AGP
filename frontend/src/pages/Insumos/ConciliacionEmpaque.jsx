import { useEffect, useMemo, useState } from 'react'
import { Calculator, Loader2, RefreshCw, Plus, Trash2, Send, CheckCircle2, Circle } from 'lucide-react'
import toast from 'react-hot-toast'
import { empaqueEspecificacionesApi } from '../../api/empaque-especificaciones'
import { insumosApi } from '../../api/insumos'
import { ingresosMpApi } from '../../api/ingresos-mp'
import { useAuth } from '../../contexts/AuthContext'

const MOTIVOS = ['DEFORME', 'SIN_LOGO', 'PEDIDO_ESPECIAL', 'CORRECCION', 'OTRO']

const ConciliacionEmpaque = () => {
  const { isAdmin } = useAuth()
  const [lotes, setLotes] = useState([])
  const [componentes, setComponentes] = useState([])
  const [insumosRegistrados, setInsumosRegistrados] = useState([])
  const [procesoPlantillas, setProcesoPlantillas] = useState([])
  const [loteId, setLoteId] = useState('')
  const [plantillaProcesoId, setPlantillaProcesoId] = useState('')
  const [data, setData] = useState([])
  const [resumen, setResumen] = useState(null)
  const [ajustes, setAjustes] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [agregandoProduccion, setAgregandoProduccion] = useState(false)
  const [yaAgregadoAProduccion, setYaAgregadoAProduccion] = useState(false)
  const [insumosOperativos, setInsumosOperativos] = useState([])
  const [seleccionReporte, setSeleccionReporte] = useState({ calculado: new Set(), real: new Set() })
  const [bunkerGalones, setBunkerGalones] = useState('')
  const [savingBunker, setSavingBunker] = useState(false)
  const [reemplazoForm, setReemplazoForm] = useState({
    origen_id: '',
    destino_id: '',
    unidad_base: 'BULTO',
    cantidad_por_unidad: '',
    motivo: 'CORRECCION',
    observaciones: '',
  })

  const loadMeta = async () => {
    try {
      const [lr, cr, ir] = await Promise.all([
        insumosApi.lotesProduccionMeta(),
        empaqueEspecificacionesApi.componentesListar({ activo: 'true' }),
        insumosApi.listar({ limit: 1000 }),
      ])
      setLotes(lr.data?.data ?? [])
      setComponentes(cr.data?.data ?? [])
      setInsumosRegistrados(ir.data?.data ?? [])
      const pr = await empaqueEspecificacionesApi.procesoPlantillasListar()
      setProcesoPlantillas(pr.data?.data ?? [])
    } catch {
      toast.error('No se pudo cargar lotes/insumos')
    }
  }

  const loadConciliacion = async () => {
    if (!loteId || !plantillaProcesoId) return
    setLoading(true)
    try {
      const [conc, aj] = await Promise.all([
        empaqueEspecificacionesApi.conciliacion({ lote_produccion_id: loteId, plantilla_proceso_id: plantillaProcesoId }),
        empaqueEspecificacionesApi.ajustesLoteListar(loteId),
      ])
      const rows = conc.data?.data ?? []
      setData(rows)
      setResumen(conc.data?.resumen ?? null)
      setYaAgregadoAProduccion(Boolean(conc.data?.ya_agregado_a_produccion))
      setInsumosOperativos(conc.data?.insumos_operativos ?? [])
      const gB = conc.data?.operativo_bunker_galones
      setBunkerGalones(gB != null && gB !== '' ? String(gB) : '')
      setAjustes(aj.data?.data ?? [])
      const sr = conc.data?.seleccion_reporte
      if (
        sr &&
        (Array.isArray(sr.calculado) || Array.isArray(sr.real)) &&
        ((sr.calculado?.length ?? 0) > 0 || (sr.real?.length ?? 0) > 0)
      ) {
        setSeleccionReporte({
          calculado: new Set(sr.calculado || []),
          real: new Set(sr.real || []),
        })
      } else {
        const calc = new Set(rows.map((r) => `${r.insumo_id}|${r.categoria}`))
        setSeleccionReporte({ calculado: calc, real: new Set() })
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'No se pudo calcular conciliación')
      setData([])
      setResumen(null)
      setYaAgregadoAProduccion(false)
      setInsumosOperativos([])
      setAjustes([])
      setSeleccionReporte({ calculado: new Set(), real: new Set() })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMeta()
  }, [])

  useEffect(() => {
    if (!loteId) {
      setBunkerGalones('')
      return
    }
    if (plantillaProcesoId) return
    let cancelled = false
    ingresosMpApi
      .loteObtener(loteId)
      .then(({ data }) => {
        if (cancelled) return
        const g = data?.operativo_bunker_galones
        setBunkerGalones(g != null && g !== '' ? String(g) : '')
      })
      .catch(() => {
        if (!cancelled) setBunkerGalones('')
      })
    return () => {
      cancelled = true
    }
  }, [loteId, plantillaProcesoId])

  useEffect(() => {
    if (loteId) loadConciliacion()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loteId, plantillaProcesoId])

  const eliminarAjuste = async (id) => {
    if (!isAdmin()) return
    if (!window.confirm('¿Eliminar ajuste?')) return
    try {
      await empaqueEspecificacionesApi.ajusteLoteEliminar(loteId, id)
      toast.success('Ajuste eliminado')
      await loadConciliacion()
    } catch (err) {
      toast.error(err.response?.data?.message || 'No se pudo eliminar ajuste')
    }
  }

  const guardarReemplazo = async (e) => {
    e.preventDefault()
    if (!loteId) {
      toast.error('Seleccione un lote')
      return
    }
    if (!reemplazoForm.origen_id || !reemplazoForm.destino_id || reemplazoForm.cantidad_por_unidad === '') {
      toast.error('Seleccione insumo origen, destino y cantidad')
      return
    }
    const cant = Number(reemplazoForm.cantidad_por_unidad)
    if (!Number.isFinite(cant) || cant <= 0) {
      toast.error('La cantidad debe ser mayor a 0')
      return
    }
    const origenData = opcionesEmpaque.find((x) => x.id === reemplazoForm.origen_id)
    if (!origenData) {
      toast.error('Seleccione un insumo origen válido')
      return
    }
    const origenComponente = (componentes || []).find((c) => c.id === origenData.id)
    if (!origenComponente) {
      toast.error('No se encontró la configuración del insumo origen')
      return
    }
    if (origenData.insumo_id === reemplazoForm.destino_id) {
      toast.error('Origen y destino no pueden ser el mismo insumo')
      return
    }
    let destinoComponente = (componentes || []).find(
      (c) => c.insumo_id === reemplazoForm.destino_id && c.categoria === origenComponente.categoria
    )
    setSaving(true)
    try {
      if (!destinoComponente?.id) {
        const created = await empaqueEspecificacionesApi.componenteCrear({
          insumo_id: reemplazoForm.destino_id,
          categoria: origenComponente.categoria,
          tipo: origenComponente.tipo || 'SACO',
          subtipo: origenComponente.subtipo || null,
          con_logo: Boolean(origenComponente.con_logo),
          medida: origenComponente.medida || null,
          descripcion: origenComponente.descripcion || 'Creado automáticamente desde ajuste por reemplazo',
          activo: true,
        })
        destinoComponente = created.data
        setComponentes((prev) => [...prev, destinoComponente])
      }
      await empaqueEspecificacionesApi.ajusteLoteCrear(loteId, {
        componente_id: reemplazoForm.origen_id,
        unidad_base: reemplazoForm.unidad_base,
        cantidad_por_unidad: cant,
        motivo: reemplazoForm.motivo,
        observaciones: `__REEMPLAZO_ORIGEN__ ${(reemplazoForm.observaciones || 'Ajuste por reemplazo').trim()}`.trim(),
        obligatorio: false,
      })
      await empaqueEspecificacionesApi.ajusteLoteCrear(loteId, {
        componente_id: destinoComponente.id,
        unidad_base: reemplazoForm.unidad_base,
        cantidad_por_unidad: cant,
        motivo: reemplazoForm.motivo,
        observaciones: `__REEMPLAZO_DESTINO__ ${(reemplazoForm.observaciones || 'Ajuste por reemplazo').trim()}`.trim(),
        obligatorio: false,
      })
      toast.success('Reemplazo aplicado (descuenta origen y suma destino)')
      setReemplazoForm({
        origen_id: '',
        destino_id: '',
        unidad_base: 'BULTO',
        cantidad_por_unidad: '',
        motivo: 'CORRECCION',
        observaciones: '',
      })
      await loadConciliacion()
    } catch (err) {
      toast.error(err.response?.data?.message || 'No se pudo aplicar el reemplazo')
    } finally {
      setSaving(false)
    }
  }

  const agregarAProduccion = async () => {
    if (!loteId || !plantillaProcesoId) {
      toast.error('Seleccione lote y plantilla de proceso')
      return
    }
    if (!window.confirm('Esto cargará los totales del lote al módulo de producción/empaque. ¿Desea continuar?')) return
    setAgregandoProduccion(true)
    try {
      await empaqueEspecificacionesApi.agregarAProduccion(loteId, {
        plantilla_proceso_id: plantillaProcesoId,
        seleccion_reporte: {
          calculado: [...seleccionReporte.calculado],
          real: [...seleccionReporte.real],
        },
      })
      toast.success('Se agregaron los datos a producción')
      await loadConciliacion()
    } catch (err) {
      toast.error(err.response?.data?.message || 'No se pudo agregar a producción')
    } finally {
      setAgregandoProduccion(false)
    }
  }

  const dataOrdenada = useMemo(
    () => [...(data || [])].sort((a, b) => `${a.insumo_nombre || ''}`.localeCompare(`${b.insumo_nombre || ''}`, 'es')),
    [data]
  )

  const opcionesEmpaque = useMemo(() => {
    const out = []
    const seen = new Set()
    for (const r of dataOrdenada) {
      if (!r?.componente_id) continue
      if (!['PRIMARIO', 'SECUNDARIO'].includes(r.categoria)) continue
      const key = `${r.componente_id}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        id: r.componente_id,
        insumo_id: r.insumo_id,
        categoria: r.categoria,
        insumo_nombre: r.insumo_nombre,
      })
    }
    return out
  }, [dataOrdenada])

  const opcionesDestino = useMemo(
    () =>
      [...(insumosRegistrados || [])].sort((a, b) => `${a.nombre || ''}`.localeCompare(`${b.nombre || ''}`, 'es')),
    [insumosRegistrados]
  )

  const labelFuenteOperativo = (fuente) => {
    if (fuente === 'calculado_tm_mp') return 'Fórmula × TM materia prima'
    if (fuente === 'manual_resumen') return 'Resumen manual'
    if (fuente === 'salidas_documento') return 'Salidas con documento'
    return fuente || '—'
  }

  const guardarBunkerGalones = async () => {
    if (!loteId) {
      toast.error('Seleccione un lote')
      return
    }
    const raw = (bunkerGalones || '').trim()
    let enviar
    if (raw === '') {
      enviar = ''
    } else {
      const n = Number(raw.replace(',', '.'))
      if (!Number.isFinite(n) || n < 0) {
        toast.error('Indique galones ≥ 0 o deje vacío para borrar')
        return
      }
      enviar = n
    }
    setSavingBunker(true)
    try {
      const { data } = await ingresosMpApi.loteOperativosBunkerGalones(loteId, {
        operativo_bunker_galones: enviar,
      })
      const saved = data?.operativo_bunker_galones
      setBunkerGalones(saved != null && saved !== '' ? String(saved) : '')
      toast.success('Galones de bunker guardados')
      if (plantillaProcesoId) await loadConciliacion()
    } catch (err) {
      toast.error(err.response?.data?.message || 'No se pudo guardar')
    } finally {
      setSavingBunker(false)
    }
  }

  const keyFila = (r) => `${r.insumo_id}|${r.categoria}`
  const seleccionarExclusivo = (tipo, key) => {
    setSeleccionReporte((prev) => {
      const calc = new Set(prev.calculado)
      const real = new Set(prev.real)
      if (tipo === 'calculado') {
        calc.add(key)
        real.delete(key)
      } else {
        real.add(key)
        calc.delete(key)
      }
      return { calculado: calc, real }
    })
  }

  return (
    <div className="min-w-0 max-w-full">
      <div className="flex items-start gap-3 mb-5 sm:mb-6">
        <div className="p-2 rounded-lg bg-primary-100 dark:bg-primary-900/40 shrink-0">
          <Calculator className="w-6 h-6 text-primary-600 dark:text-primary-400" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white leading-tight">Conciliación empaque</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
            Insumos de <strong className="font-medium text-gray-800 dark:text-gray-200">empaque</strong> (sacos, rafias, etc.): plantilla vs almacén.
            El agua y el hielo son <strong className="font-medium text-gray-800 dark:text-gray-200">generales de planta</strong> (ratios en plantilla de proceso). El bunker (galones) se registra en el resumen de insumos operativos abajo.
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[min(100%,320px)] flex-1">
            <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">Lote de producción</label>
            <select value={loteId} onChange={(e) => setLoteId(e.target.value)} className="w-full min-h-[44px] px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 rounded-lg dark:[color-scheme:dark]">
              <option value="">Seleccione lote...</option>
              {lotes.map((l) => <option key={l.id} value={l.id}>{l.codigo} · {l.estado}</option>)}
            </select>
          </div>
          <div className="min-w-[min(100%,320px)] flex-1">
            <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">Plantilla de proceso</label>
            <select value={plantillaProcesoId} onChange={(e) => setPlantillaProcesoId(e.target.value)} className="w-full min-h-[44px] px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 rounded-lg dark:[color-scheme:dark]">
              <option value="">Seleccione plantilla...</option>
              {procesoPlantillas.map((p) => <option key={p.id} value={p.id}>{p.cliente_nombre} · {p.especie_nombre} · {p.titulo}</option>)}
            </select>
          </div>
          <button type="button" onClick={loadConciliacion} disabled={!loteId || loading} className="inline-flex items-center justify-center gap-2 min-h-[44px] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/40">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Actualizar
          </button>
          <button
            type="button"
            onClick={agregarAProduccion}
            disabled={!loteId || !plantillaProcesoId || agregandoProduccion}
            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-3 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-50"
          >
            {agregandoProduccion ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Agregar a producción
          </button>
        </div>
        {yaAgregadoAProduccion && loteId && plantillaProcesoId && (
          <div
            className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2.5 text-sm text-emerald-900 dark:text-emerald-100"
            role="status"
          >
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" aria-hidden />
            <p>
              <span className="font-semibold">Insumos ya agregados a producción.</span>{' '}
              Los totales de este resumen ya se enviaron al módulo de empaque/producción para este lote y esta plantilla. Puede volver a usar &quot;Agregar a producción&quot; para actualizar esos totales si cambian los datos del lote.
            </p>
          </div>
        )}
        {resumen && (
          <div className="mt-3 text-sm text-gray-700 dark:text-gray-300 flex flex-wrap gap-5">
            <span>Unidades: {Number(resumen.unidades?.bultos || 0)} bultos / {Number(resumen.unidades?.cajas || 0)} cajas</span>
            <span>Esperado: {resumen.total_esperado}</span>
            <span>Real: {resumen.total_real}</span>
            <span className={(resumen.total_desviacion || 0) === 0 ? 'text-emerald-600' : 'text-amber-600'}>Desviación: {resumen.total_desviacion}</span>
          </div>
        )}
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Calculado = consumo esperado de plantilla +/- ajustes. Salidas almacén = dato real de almacén (no se altera por ajustes de reemplazo).
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Icono verde = se enviara a reportes finales. Icono naranja = excluido.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
          <div className="px-3 py-2.5 border-b border-gray-200 dark:border-gray-700 bg-slate-50 dark:bg-slate-900/40">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Insumos de empaque (plantilla)</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">Sacos, láminas, rafia, etc. No incluye insumos operativos generales.</p>
          </div>
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary-600" /></div>
          ) : (
            <div className="wms-table-scroll">
              <table className="min-w-[48rem] w-full text-xs">
                <thead className="bg-gray-50 dark:bg-gray-900/50">
                  <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Insumo</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Origen</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Tipo empaque</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Calculado</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Salidas almacén</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Desv.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {dataOrdenada.map((r, idx) => (
                    <tr key={`${r.insumo_id}-${r.categoria}-${idx}`}>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{r.insumo_nombre} ({r.insumo_unidad})</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        r.origen === 'AJUSTE'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                          : 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300'
                      }`}>
                        {r.origen === 'AJUSTE' ? 'Ajuste' : 'Plantilla'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                      {r.categoria === 'PRIMARIO' ? 'PRIMARIO' : r.categoria === 'SECUNDARIO' ? 'SECUNDARIO' : 'OTROS'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-900 dark:text-gray-100">
                      <span className="inline-flex items-center justify-end gap-2">
                        {r.esperado}
                        <button
                          type="button"
                          onClick={() => seleccionarExclusivo('calculado', keyFila(r))}
                          title="Incluir/excluir calculado para reportes finales"
                        >
                          {seleccionReporte.calculado.has(keyFila(r))
                            ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            : <Circle className="w-4 h-4 text-amber-500" />}
                        </button>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-900 dark:text-gray-100">
                      <span className="inline-flex items-center justify-end gap-2">
                        {r.real}
                        <button
                          type="button"
                          onClick={() => seleccionarExclusivo('real', keyFila(r))}
                          title="Incluir/excluir salida real para reportes finales"
                        >
                          {seleccionReporte.real.has(keyFila(r))
                            ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            : <Circle className="w-4 h-4 text-amber-500" />}
                        </button>
                      </span>
                    </td>
                      <td className={`px-3 py-2 text-right tabular-nums ${(r.desviacion || 0) === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>{r.desviacion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!loading && data.length === 0 && <p className="p-6 text-center text-gray-500 dark:text-gray-400">Sin datos para mostrar.</p>}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Ajustes del lote</h2>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Ajuste por reemplazo de insumo</h3>
          <form onSubmit={guardarReemplazo} className="space-y-2 mb-3">
            <select value={reemplazoForm.origen_id} onChange={(e) => setReemplazoForm((f) => ({ ...f, origen_id: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 rounded-lg text-sm dark:[color-scheme:dark]">
              <option value="">Insumo origen...</option>
              {opcionesEmpaque.map((c) => <option key={c.id} value={c.id}>{c.categoria} · {c.insumo_nombre}</option>)}
            </select>
            <select value={reemplazoForm.destino_id} onChange={(e) => setReemplazoForm((f) => ({ ...f, destino_id: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 rounded-lg text-sm dark:[color-scheme:dark]">
              <option value="">Insumo destino...</option>
              {opcionesDestino.map((i) => <option key={i.id} value={i.id}>{i.nombre} ({i.unidad_medida})</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <select value={reemplazoForm.unidad_base} onChange={(e) => setReemplazoForm((f) => ({ ...f, unidad_base: e.target.value }))} className="px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 rounded-lg text-sm dark:[color-scheme:dark]">
                <option value="BULTO">Saco</option>
                <option value="CAJA">Caja</option>
              </select>
              <input type="number" min="0" step="any" value={reemplazoForm.cantidad_por_unidad} onChange={(e) => setReemplazoForm((f) => ({ ...f, cantidad_por_unidad: e.target.value }))} placeholder="Cantidad a ajustar" className="px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 rounded-lg text-sm" />
            </div>
            <select value={reemplazoForm.motivo} onChange={(e) => setReemplazoForm((f) => ({ ...f, motivo: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 rounded-lg text-sm dark:[color-scheme:dark]">
              {MOTIVOS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <textarea rows={2} value={reemplazoForm.observaciones} onChange={(e) => setReemplazoForm((f) => ({ ...f, observaciones: e.target.value }))} placeholder="Observaciones del reemplazo" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 rounded-lg text-sm" />
            <button type="submit" disabled={!loteId || !plantillaProcesoId || saving} className="w-full inline-flex items-center justify-center gap-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm disabled:opacity-50">
              <Plus className="w-4 h-4" /> {saving ? 'Aplicando...' : 'Aplicar reemplazo'}
            </button>
          </form>
          <div className="max-h-64 overflow-y-auto divide-y divide-gray-200 dark:divide-gray-700">
            {ajustes.map((a) => (
              <div key={a.id} className="py-2 text-sm">
                <p className="font-medium text-gray-900 dark:text-white">{a.tipo} · {a.insumo_nombre}</p>
                <p className="text-gray-500 dark:text-gray-400">{a.cantidad_por_unidad} por {a.unidad_base === 'CAJA' ? 'caja' : 'saco'} · {a.motivo}</p>
                {isAdmin() && (
                  <button type="button" onClick={() => eliminarAjuste(a.id)} className="mt-1 inline-flex items-center gap-1 text-xs text-red-600">
                    <Trash2 className="w-3 h-3" /> Eliminar
                  </button>
                )}
              </div>
            ))}
            {ajustes.length === 0 && <p className="text-sm text-gray-500 py-2">Sin ajustes.</p>}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-xl border-2 border-indigo-200 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/25 p-4">
        <h2 className="text-base font-semibold text-indigo-950 dark:text-indigo-100">Insumos operativos generales (planta)</h2>
        <p className="text-xs text-indigo-900/90 dark:text-indigo-200/90 mt-1 mb-3">
          Agua y hielo: ratios en <strong className="font-medium">Plantillas de proceso</strong> × TM de materia prima. Bunker: indique aquí los galones usados (parte de producción sección IV).
        </p>
        {!loteId ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">Seleccione un lote para registrar bunker y ver el resumen.</p>
        ) : (
          <>
            <div className="mb-4 rounded-lg border border-indigo-200/90 dark:border-indigo-800 bg-white dark:bg-gray-900/50 p-3">
              <label className="block text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">Bunker — galones usados</label>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">Cantidad manual por lote. Deje vacío y guarde para borrar.</p>
              <div className="flex flex-wrap items-end gap-2">
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={bunkerGalones}
                  onChange={(e) => setBunkerGalones(e.target.value)}
                  placeholder="Galones"
                  className="w-40 px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg text-sm"
                />
                <button
                  type="button"
                  onClick={guardarBunkerGalones}
                  disabled={savingBunker}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm disabled:opacity-50"
                >
                  {savingBunker ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Guardar galones
                </button>
              </div>
            </div>
            {!plantillaProcesoId ? (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Seleccione también la plantilla de proceso para ver agua y hielo calculados en la tabla.
              </p>
            ) : loading ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Cargando resumen operativo…</p>
            ) : insumosOperativos.length === 0 ? (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Sin filas de agua/hielo: defina litros/kg por TM en la plantilla o no hay TM de materia prima. Puede registrar bunker arriba.
              </p>
            ) : (
              <div className="wms-table-scroll rounded-lg border border-indigo-200/80 dark:border-indigo-800 bg-white dark:bg-gray-900/50">
                <table className="min-w-[36rem] w-full text-xs text-left">
                  <thead>
                    <tr className="text-indigo-900 dark:text-indigo-200 border-b border-indigo-200 dark:border-indigo-800 bg-indigo-100/50 dark:bg-indigo-950/50">
                      <th className="px-3 py-2 font-medium">Insumo</th>
                      <th className="px-3 py-2 font-medium">Origen del dato</th>
                      <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                      <th className="px-3 py-2 font-medium">Unid.</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-800 dark:text-gray-200">
                    {insumosOperativos.map((r, idx) => (
                      <tr key={`op-${idx}-${r.tipo || ''}-${r.codigo || ''}`} className="border-b border-indigo-100 dark:border-indigo-900/40">
                        <td className="px-3 py-2">
                          {r.descripcion}
                          {r.codigo ? <span className="text-gray-500"> ({r.codigo})</span> : null}
                        </td>
                        <td className="px-3 py-2">{labelFuenteOperativo(r.fuente)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.cantidad}</td>
                        <td className="px-3 py-2">{r.unidad_medida}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default ConciliacionEmpaque

