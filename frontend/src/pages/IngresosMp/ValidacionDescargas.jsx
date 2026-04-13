import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FileCheck, Loader2, Upload, Trash2, FileText, ChevronRight, Eye } from 'lucide-react'
import { ingresosMpApi } from '../../api/ingresos-mp'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'

const TIPOS_DOCUMENTO = [
  { key: 'guia_interna', label: 'Guía interna', plural: true },
  { key: 'vehiculo', label: 'Vehículo', plural: true },
  { key: 'desembarcadero', label: 'Desembarcadero', plural: false },
  { key: 'transportista', label: 'Transportista', plural: false },
  { key: 'wincha', label: 'Winchas', plural: true, porWincha: true },
  { key: 'guia_remitente', label: 'Guías de remitente', plural: true, porWincha: true },
  { key: 'embarcacion', label: 'Embarcaciones', plural: true, porWincha: true },
  { key: 'otros', label: 'Otros documentos', plural: true },
]

const formatDate = (d) => (d ? new Date(d).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—')

export default function ValidacionDescargas() {
  const [searchParams] = useSearchParams()
  const { isAdmin } = useAuth()
  const [loading, setLoading] = useState(true)
  const [descargas, setDescargas] = useState([])
  const [selected, setSelected] = useState(null)
  const [detalle, setDetalle] = useState(null)
  const [documentos, setDocumentos] = useState([])
  const [loadingDetalle, setLoadingDetalle] = useState(false)
  const [validando, setValidando] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ingresosMpApi
      .validacionDescargasListar({ limit: 300 })
      .then(({ data }) => {
        if (!cancelled) setDescargas(data?.data ?? [])
      })
      .catch(() => {
        if (!cancelled) {
          toast.error('Error al cargar descargas')
          setDescargas([])
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const descargaIdFromUrl = searchParams.get('descarga_id')
  useEffect(() => {
    if (!descargaIdFromUrl || descargas.length === 0) return
    const d = descargas.find((x) => String(x.id) === String(descargaIdFromUrl))
    if (d) setSelected(d)
  }, [descargaIdFromUrl, descargas])

  const porLote = useMemo(() => {
    const map = new Map()
    for (const d of descargas) {
      const key = d.lote_id || d.lote_codigo || 'sin-lote'
      if (!map.has(key)) {
        map.set(key, {
          lote_codigo: d.lote_codigo || 'Sin lote',
          lote_fecha: d.lote_fecha,
          items: [],
        })
      }
      map.get(key).items.push(d)
    }
    return Array.from(map.entries()).map(([id, g]) => ({ id, ...g }))
  }, [descargas])

  useEffect(() => {
    if (!selected) {
      setDetalle(null)
      setDocumentos([])
      return
    }
    let cancelled = false
    setLoadingDetalle(true)
    Promise.all([
      ingresosMpApi.descargaObtener(selected.id),
      ingresosMpApi.documentosValidacionListar(selected.id),
    ])
      .then(([resDet, resDocs]) => {
        if (cancelled) return
        setDetalle(resDet.data)
        setDocumentos(resDocs.data ?? [])
      })
      .catch(() => {
        if (!cancelled) {
          toast.error('Error al cargar detalle')
          setDetalle(null)
          setDocumentos([])
        }
      })
      .finally(() => { if (!cancelled) setLoadingDetalle(false) })
    return () => { cancelled = true }
  }, [selected?.id])

  const handleFile = (tipo, winchaId, e) => {
    const file = e?.target?.files?.[0]
    if (!file || !selected) return
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result?.split(',')?.[1] || ''
      ingresosMpApi
        .documentoValidacionSubir(selected.id, {
          tipo,
          wincha_id: winchaId || undefined,
          nombre_archivo: file.name,
          content_type: file.type,
          contenido_base64: base64,
        })
        .then(() => {
          toast.success('Documento subido')
          return ingresosMpApi.documentosValidacionListar(selected.id)
        })
        .then(({ data }) => setDocumentos(data ?? []))
        .catch(() => toast.error('Error al subir documento'))
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleEliminarDoc = (docId) => {
    if (!window.confirm('¿Eliminar este documento?')) return
    ingresosMpApi
      .documentoValidacionEliminar(docId)
      .then(() => {
        toast.success('Documento eliminado')
        return ingresosMpApi.documentosValidacionListar(selected.id)
      })
      .then(({ data }) => setDocumentos(data ?? []))
      .catch(() => toast.error('Error al eliminar'))
  }

  const handleValidar = () => {
    if (!selected) return
    if (!window.confirm('¿Confirmar que todos los datos y documentos están correctos y validar esta descarga?')) return
    setValidando(true)
    ingresosMpApi
      .descargaValidar(selected.id)
      .then(({ data }) => {
        toast.success('Descarga validada')
        setDetalle((p) => (p ? { ...p, validated_at: data?.validated_at ?? new Date().toISOString(), validated_by: data?.validated_by ?? 'Usuario' } : null))
        setDescargas((prev) => prev.map((d) => (d.id === selected.id ? { ...d, validated_at: new Date().toISOString(), validated_by: 'Usuario' } : d)))
      })
      .catch(() => toast.error('Error al validar'))
      .finally(() => setValidando(false))
  }

  const [reabriendoValidacion, setReabriendoValidacion] = useState(false)
  const handleReabrirValidacion = () => {
    if (!selected) return
    if (!window.confirm('¿Quitar la validación de esta descarga? Volverá a estado pendiente de validación. Solo un administrador puede hacer esto.')) return
    setReabriendoValidacion(true)
    ingresosMpApi
      .descargaReabrirValidacion(selected.id)
      .then(() => {
        toast.success('Validación reabierta')
        setDetalle((p) => (p ? { ...p, validated_at: null, validated_by: null } : null))
      })
      .catch(() => toast.error('Error al reabrir validación'))
      .finally(() => setReabriendoValidacion(false))
  }

  const docsByTipo = (tipo, winchaId) =>
    documentos.filter((d) => d.tipo === tipo && (winchaId ? d.wincha_id === winchaId : !d.wincha_id))

  const verDocumento = (docId) => {
    ingresosMpApi
      .documentoValidacionObtener(docId)
      .then(({ data }) => {
        if (data?.contenido_base64 && data?.content_type) {
          const dataUrl = `data:${data.content_type};base64,${data.contenido_base64}`
          window.open(dataUrl, '_blank', 'noopener,noreferrer')
        } else {
          toast.error('No se puede abrir el documento')
        }
      })
      .catch(() => toast.error('Error al cargar documento'))
  }

  const filasDatos = [
    { label: 'Nº guía interna', value: detalle?.numero_guia_interna, tipo: 'guia_interna' },
    { label: 'Fecha descarga', value: detalle ? formatDate(detalle.fecha_descarga) : '', tipo: null },
    { label: 'Especie', value: detalle?.especie_nombre, tipo: null },
    { label: 'Cliente', value: detalle?.cliente_nombre, tipo: null },
    { label: 'Placas vehículo', value: detalle?.placas_vehiculo, tipo: 'vehiculo' },
    { label: 'Proveedor', value: detalle?.proveedor_razon_social, tipo: null },
    { label: 'RUC proveedor', value: detalle?.ruc_proveedor, tipo: null },
    { label: 'Desembarcadero', value: detalle?.desembarcadero, tipo: 'desembarcadero' },
    { label: 'Origen', value: detalle?.origen, tipo: null },
    { label: 'RUC transportista', value: detalle?.ruc_transportista, tipo: 'transportista' },
    { label: 'Datos chofer', value: detalle?.datos_chofer, tipo: null },
    { label: 'Otros documentos', value: null, tipo: 'otros' },
  ]
  const mitad = Math.ceil(filasDatos.length / 2)
  const col1 = filasDatos.slice(0, mitad)
  const col2 = filasDatos.slice(mitad)

  const puedeValidar = useMemo(() => {
    if (!detalle || detalle.validated_at) return true
    const tiposGenerales = ['guia_interna', 'vehiculo', 'desembarcadero', 'transportista', 'otros']
    for (const t of tiposGenerales) {
      if (docsByTipo(t, null).length === 0) return false
    }
    const winchas = detalle.winchas || []
    for (const w of winchas) {
      if (docsByTipo('wincha', w.id).length === 0) return false
      if (docsByTipo('guia_remitente', w.id).length === 0) return false
      if (docsByTipo('embarcacion', w.id).length === 0) return false
    }
    return true
  }, [detalle, documentos])

  const ChipDoc = ({ doc, puedeEliminar }) => (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-sm text-gray-800 dark:text-gray-200">
      <FileText className="w-3.5 h-3.5 shrink-0" />
      {doc.nombre_archivo}
      <button type="button" onClick={() => verDocumento(doc.id)} className="p-0.5 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/30 rounded" title="Ver documento">
        <Eye className="w-3.5 h-3.5" />
      </button>
      {puedeEliminar && (
        <button type="button" onClick={() => handleEliminarDoc(doc.id)} className="p-0.5 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded" title="Eliminar">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </span>
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-10 h-10 animate-spin text-primary-600" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <FileCheck className="w-8 h-8 text-[var(--color-primary,#2563eb)]" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Validación de Descargas</h1>
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-300">
        Descargas agrupadas por lote. Seleccione una descarga para revisar los datos y adjuntar documentos (PDF o foto), luego valide.
      </p>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Lista por lote */}
        <div className="lg:w-96 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden flex-shrink-0">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 font-medium text-gray-900 dark:text-white">
            Descargas por lote
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {porLote.length === 0 ? (
              <p className="p-4 text-sm text-gray-500 dark:text-gray-300">No hay descargas.</p>
            ) : (
              porLote.map((grupo) => (
                <div key={grupo.id} className="border-b border-gray-100 dark:border-gray-700 last:border-0">
                  <div className="px-4 py-2 bg-gray-50 dark:bg-gray-700/30 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
                    Lote {grupo.lote_codigo} · {formatDate(grupo.lote_fecha)}
                  </div>
                  {grupo.items.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setSelected(d)}
                      className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-2 border-l-2 transition-colors ${
                        selected?.id === d.id
                          ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                          : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-800 dark:text-gray-200'
                      }`}
                    >
                      <span className="truncate text-sm">
                        {d.numero_guia_interna || 'Sin guía'} · {d.cliente_nombre || '—'} · {d.especie_nombre || '—'}
                      </span>
                      {d.validated_at ? (
                        <span className="shrink-0 text-xs text-green-600 dark:text-green-400 font-medium">Validado</span>
                      ) : (
                        <ChevronRight className="w-4 h-4 shrink-0 text-gray-400" />
                      )}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Detalle y documentos */}
        <div className="flex-1 min-w-0 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {!selected ? (
            <div className="p-12 text-center text-gray-500 dark:text-gray-300">
              Seleccione una descarga de la lista para ver los datos y subir documentos.
            </div>
          ) : loadingDetalle ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
            </div>
          ) : detalle ? (
            <div className="p-4 sm:p-6 space-y-6 overflow-y-auto max-h-[75vh]">
              {detalle.validated_at && (
                <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 text-sm">
                  <FileCheck className="w-4 h-4" />
                  Validado el {formatDate(detalle.validated_at)} por {detalle.validated_by || '—'}
                </div>
              )}

              <section>
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Datos de la descarga</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-0">
                  {[col1, col2].map((column, idx) => (
                    <ul key={idx} className="space-y-1 text-sm">
                      {column.map(({ label, value, tipo }) => (
                        <li key={label} className="flex flex-wrap items-center gap-2 py-2 border-b border-gray-100 dark:border-gray-700/50">
                          <span className="text-gray-500 dark:text-gray-400 shrink-0 w-32">{label}:</span>
                          <span className="text-gray-900 dark:text-white break-words min-w-0 flex-1">{value || '—'}</span>
                          {tipo && !detalle.validated_at && (
                            <>
                              <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-xs cursor-pointer hover:opacity-90 shrink-0">
                                <Upload className="w-3.5 h-3.5" />
                                Subir
                                <input type="file" accept=".pdf,image/*" className="hidden" onChange={(e) => handleFile(tipo, null, e)} />
                              </label>
                              {docsByTipo(tipo, null).map((doc) => (
                                <ChipDoc key={doc.id} doc={doc} puedeEliminar />
                              ))}
                            </>
                          )}
                          {tipo && detalle.validated_at && docsByTipo(tipo, null).map((doc) => (
                            <ChipDoc key={doc.id} doc={doc} puedeEliminar={false} />
                          ))}
                        </li>
                      ))}
                    </ul>
                  ))}
                </div>
              </section>

              {detalle.winchas?.length > 0 && (
                <section>
                  <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Winchas</h2>
                  <ul className="space-y-2 text-sm">
                    {detalle.winchas.map((w) => (
                      <li key={w.id} className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 flex flex-wrap items-center gap-2">
                        <span className="text-gray-900 dark:text-gray-100 shrink-0">
                          Wincha {w.numero_wincha || '—'} · {w.nombre_embarcacion || w.matricula_embarcacion || '—'} · Guía remitente: {w.numero_guia_remitente || '—'} · {w.peso_kg ?? '—'} kg · {w.cajas ?? '—'} cajas
                        </span>
                        {!detalle.validated_at && (
                          <>
                            {['wincha', 'guia_remitente', 'embarcacion'].map((tipo) => {
                              const t = TIPOS_DOCUMENTO.find((x) => x.key === tipo)
                              const docs = docsByTipo(tipo, w.id)
                              return (
                                <span key={tipo} className="inline-flex items-center gap-1.5 flex-wrap">
                                  <label className="inline-flex items-center gap-1 px-2 py-1 rounded bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-xs cursor-pointer hover:opacity-90">
                                    <Upload className="w-3 h-3" />
                                    {t?.label}
                                    <input type="file" accept=".pdf,image/*" className="hidden" onChange={(e) => handleFile(tipo, w.id, e)} />
                                  </label>
                                  {docs.map((doc) => (
                                    <ChipDoc key={doc.id} doc={doc} puedeEliminar />
                                  ))}
                                </span>
                              )
                            })}
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {!detalle.validated_at && (
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                  {!puedeValidar && (
                    <p className="text-sm text-amber-600 dark:text-amber-400 mb-2">
                      Debe subir al menos un documento en cada ítem (Guía interna, Vehículo, Desembarcadero, Transportista, Otros documentos y por cada wincha: Winchas, Guías de remitente, Embarcaciones) para poder validar.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={handleValidar}
                    disabled={validando || !puedeValidar}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {validando ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCheck className="w-4 h-4" />}
                    Validar descarga
                  </button>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-300">
                    {puedeValidar ? 'Confirme que los datos y documentos adjuntos son correctos antes de validar.' : 'Complete todos los documentos requeridos para habilitar la validación.'}
                  </p>
                </div>
              )}
              {detalle.validated_at && isAdmin() && (
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={handleReabrirValidacion}
                    disabled={reabriendoValidacion}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Reabrir validación (solo Admin)"
                  >
                    {reabriendoValidacion ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Reabrir validación
                  </button>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-300">Quitar la validación para poder editar documentos o validar de nuevo. Solo administradores.</p>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
