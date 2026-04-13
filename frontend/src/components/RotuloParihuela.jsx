import React, { useState, useEffect, useRef } from 'react'
import { Printer, Loader2 } from 'lucide-react'
import QRCode from 'qrcode'
import { parihuelasApi } from '../api/parihuelas'
import { useConfig } from '../contexts/ConfigContext'
import Modal from './Modal'

/**
 * Modal que muestra el rótulo de una parihuela (estilo etiqueta: QR, ubicación, contenido, tabla, total).
 * clienteNombre y especieNombre son opcionales: si la vista padre los pasa (ej. desde el lote seleccionado), se usan en el rótulo.
 */
const RotuloParihuela = ({ parihuelaId, onClose, clienteNombre, especieNombre }) => {
  const { logoEmpresa, nombreEmpresa } = useConfig()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(!!parihuelaId)
  const [error, setError] = useState(null)
  const [qrDataUrl, setQrDataUrl] = useState(null)
  const printRef = useRef(null)

  useEffect(() => {
    if (!parihuelaId) {
      setData(null)
      setQrDataUrl(null)
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    parihuelasApi.obtener(parihuelaId)
      .then(({ data: res }) => {
        setData(res)
        if (res?.id) {
          QRCode.toDataURL(res.id, { width: 180, margin: 1 }).then(setQrDataUrl).catch(() => setQrDataUrl(null))
        } else {
          setQrDataUrl(null)
        }
      })
      .catch((err) => setError(err.response?.data?.message || 'Error al cargar'))
      .finally(() => setLoading(false))
  }, [parihuelaId])

  const productoLinea = data ? [data.producto_codigo, data.producto_descripcion || data.producto_nombre, data.producto_presentacion].filter(Boolean).join(' · ') : ''
  const esRecepcionada = data?.estado === 'ALMACENADA'
  const contenido = data?.contenido_posicion || []

  const filasTabla = contenido.length > 0
    ? contenido.map((c) => ({
        producto: [c.producto_codigo, c.producto_descripcion || c.producto_nombre, c.producto_presentacion].filter(Boolean).join(' · '),
        lote: c.lote || '—',
        bultos: c.cantidad_bultos,
        kg: c.total_kg,
      }))
    : data
      ? [{ producto: productoLinea, lote: data.lote_codigo || '—', bultos: Number(data.cantidad) || 0, kg: Number(data.total_kg) || 0 }]
      : []

  const totalBultos = filasTabla.reduce((s, r) => s + (r.bultos || 0), 0)
  const totalKg = filasTabla.reduce((s, r) => s + (r.kg || 0), 0)

  const clienteDisplay = [clienteNombre ?? data?.cliente_nombre, especieNombre ?? data?.especie_nombre].filter(Boolean).join(' — ') || '—'

  const esc = (s) => (s == null ? '' : String(s).replace(/</g, '&lt;').replace(/"/g, '&quot;'))

  const handlePrint = () => {
    if (!data) return
    const ventana = window.open('', '_blank')
    if (!ventana) {
      window.print()
      return
    }
    const qrImg = qrDataUrl ? `<img src="${qrDataUrl.replace(/"/g, '&quot;')}" alt="QR" class="qr-img" />` : '<div class="qr-placeholder">QR</div>'
    const logoImg = logoEmpresa && logoEmpresa.trim() ? `<img src="${esc(logoEmpresa)}" alt="Logo" class="logo-img" />` : ''
    const empresa = (nombreEmpresa && nombreEmpresa.trim()) ? esc(nombreEmpresa) : ''

    const ubicacionHtml = (esRecepcionada && data.ubicacion)
      ? `<div class="rotulo-ubicacion"><span class="rotulo-ubicacion-label">UBICACIÓN:</span><br/><span class="rotulo-ubicacion-valor">${esc(data.ubicacion)}</span></div>`
      : ''

    const filasHtml = filasTabla.map((f) => `
      <tr>
        <td class="td-producto">${esc(f.producto)}</td>
        <td class="td-lote">${esc(f.lote)}</td>
        <td class="td-num">${f.bultos}</td>
        <td class="td-num">${Number(f.kg).toFixed(1)}</td>
      </tr>
    `).join('')

    ventana.document.write(`
      <!DOCTYPE html>
      <html>
        <head><title>Rótulo Parihuela</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 16px; max-width: 480px; margin: 0; }
            .rotulo { border: 2px solid #222; padding: 16px; }
            .rotulo-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
            .rotulo-qr { flex-shrink: 0; width: 90px; height: 90px; display: flex; align-items: center; justify-content: center; border: 1px solid #999; }
            .rotulo-qr .qr-img { width: 100%; height: 100%; object-fit: contain; }
            .rotulo-qr .qr-placeholder { font-size: 24px; color: #999; }
            .rotulo-titulo { flex: 1; text-align: center; border-bottom: 2px solid #222; padding-bottom: 6px; }
            .rotulo-titulo h1 { margin: 0; font-size: 22px; }
            .rotulo-logo { flex-shrink: 0; text-align: right; }
            .rotulo-logo .logo-img { max-height: 48px; max-width: 120px; object-fit: contain; }
            .rotulo-logo .logo-empresa { font-size: 11px; color: #2d5a27; font-weight: bold; margin-top: 2px; }
            .rotulo-ubicacion { margin: 14px 0; }
            .rotulo-ubicacion-label { font-size: 14px; font-weight: bold; }
            .rotulo-ubicacion-valor { font-size: 18px; font-weight: bold; }
            .rotulo-contenido-titulo { text-align: center; text-decoration: underline; font-weight: bold; margin: 12px 0 8px 0; font-size: 15px; }
            .rotulo-cliente { margin: 8px 0; font-size: 14px; }
            .rotulo-cliente strong { margin-right: 6px; }
            .rotulo-tabla { width: 100%; border-collapse: collapse; font-size: 12px; margin: 8px 0; }
            .rotulo-tabla th, .rotulo-tabla td { border: 1px solid #333; padding: 6px 8px; text-align: left; vertical-align: top; }
            .rotulo-tabla th { background: #eee; font-weight: bold; }
            .td-producto { max-width: 220px; }
            .td-lote { white-space: nowrap; }
            .td-num { text-align: right; white-space: nowrap; }
            .rotulo-total { margin-top: 10px; font-size: 16px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="rotulo">
            <div class="rotulo-header">
              <div class="rotulo-qr">${qrImg}</div>
              <div class="rotulo-titulo"><h1>PARIHUELA</h1></div>
              <div class="rotulo-logo">${logoImg}${empresa ? `<div class="logo-empresa">${empresa}</div>` : ''}</div>
            </div>
            ${ubicacionHtml}
            <div class="rotulo-contenido-titulo">CONTENIDO</div>
            <div class="rotulo-cliente"><strong>CLIENTE:</strong> ${esc(clienteDisplay)}</div>
            <table class="rotulo-tabla">
              <thead>
                <tr><th>PRODUCTO</th><th>LOTE</th><th>BULTOS</th><th>CANTIDAD KG</th></tr>
              </thead>
              <tbody>${filasHtml}</tbody>
            </table>
            <div class="rotulo-total">Total: ${totalBultos} Blts → ${totalKg.toFixed(1)} kg</div>
          </div>
        </body>
      </html>
    `)
    ventana.document.close()
    ventana.focus()
    setTimeout(() => {
      ventana.print()
      ventana.close()
    }, 250)
  }

  return (
    <Modal isOpen={!!parihuelaId} onClose={onClose} title="Rótulo de parihuela" size="sm">
      {loading && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
      )}
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 py-4">{error}</p>
      )}
      {!loading && !error && data && (
        <>
          <div ref={printRef} className="rounded-lg border-2 border-gray-300 dark:border-gray-600 p-4 bg-white text-gray-900 max-w-md">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex-shrink-0 w-20 h-20 border border-gray-400 flex items-center justify-center bg-white">
                {qrDataUrl ? <img src={qrDataUrl} alt="QR" className="w-full h-full object-contain" /> : <span className="text-gray-400 text-sm">QR</span>}
              </div>
              <div className="flex-1 text-center border-b-2 border-gray-800 pb-1">
                <h3 className="text-xl font-bold">PARIHUELA</h3>
              </div>
              <div className="flex-shrink-0 text-right">
                {logoEmpresa && logoEmpresa.trim() && <img src={logoEmpresa.trim()} alt="Logo" className="max-h-10 max-w-24 object-contain" />}
                {nombreEmpresa && nombreEmpresa.trim() && <p className="text-xs font-bold text-green-800 mt-0.5">{nombreEmpresa.trim()}</p>}
              </div>
            </div>
            {esRecepcionada && data.ubicacion && (
              <div className="my-3">
                <p className="text-xs font-bold text-gray-700">UBICACIÓN:</p>
                <p className="text-base font-bold">{data.ubicacion}</p>
              </div>
            )}
            <p className="text-center font-bold underline my-2">CONTENIDO</p>
            <p className="text-sm mb-2"><span className="font-bold">CLIENTE:</span> {clienteDisplay}</p>
            <table className="w-full text-xs border border-gray-600 border-collapse">
              <thead>
                <tr className="bg-gray-200">
                  <th className="border border-gray-600 px-2 py-1 text-left">PRODUCTO</th>
                  <th className="border border-gray-600 px-2 py-1 text-left">LOTE</th>
                  <th className="border border-gray-600 px-2 py-1 text-right">BULTOS</th>
                  <th className="border border-gray-600 px-2 py-1 text-right">CANTIDAD KG</th>
                </tr>
              </thead>
              <tbody>
                {filasTabla.map((f, i) => (
                  <tr key={i}>
                    <td className="border border-gray-600 px-2 py-1 max-w-[200px]">{f.producto}</td>
                    <td className="border border-gray-600 px-2 py-1 whitespace-nowrap">{f.lote}</td>
                    <td className="border border-gray-600 px-2 py-1 text-right">{f.bultos}</td>
                    <td className="border border-gray-600 px-2 py-1 text-right">{Number(f.kg).toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-sm font-bold mt-2">Total: {totalBultos} Blts → {totalKg.toFixed(1)} kg</p>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-sm border border-gray-300 dark:border-gray-500 text-gray-700 dark:text-gray-300"
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-primary-600 text-white hover:bg-primary-700"
            >
              <Printer className="w-4 h-4" />
              Imprimir rótulo
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}

export default RotuloParihuela
