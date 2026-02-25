import { useState, useEffect, useRef } from 'react'
import { Settings, Loader2, Save, FolderOpen, Calendar } from 'lucide-react'
import { configuracionApi } from '../../api/configuracion'
import { stockApi } from '../../api/stock'
import { useConfig } from '../../contexts/ConfigContext'
import toast from 'react-hot-toast'

const CLAVES_APARIENCIA = ['tema', 'color_primario', 'logo_empresa', 'tamaño_logo', 'registros_por_pagina']
const CLAVES_TAMAÑOS_TEXTO = ['tamaño_fuente', 'tamaño_modales', 'tamaño_tablas', 'tamaño_texto', 'tamaño_titulos']
const EJEMPLOS_FUENTE = {
  tamaño_fuente: { label: 'Tamaño fuente (base)', ejemplo: 'Texto base de la aplicación' },
  tamaño_modales: { label: 'Tamaño modales', ejemplo: 'Texto en ventanas modales' },
  tamaño_tablas: { label: 'Tamaño tablas', ejemplo: 'Celdas y encabezados de tablas' },
  tamaño_texto: { label: 'Tamaño texto', ejemplo: 'Párrafos y contenido general' },
  tamaño_titulos: { label: 'Tamaño títulos', ejemplo: 'Título de la página (h1, h2)' },
}

const Configuracion = () => {
  const { items, loading: configLoading, refresh } = useConfig()
  const [savingId, setSavingId] = useState(null)
  const [valores, setValores] = useState({})
  const fileInputRef = useRef(null)
  const [letrasAno, setLetrasAno] = useState([])
  const [loadingLetras, setLoadingLetras] = useState(false)
  const [anosPorLetra, setAnosPorLetra] = useState({})
  const [savingLoteAnos, setSavingLoteAnos] = useState(false)

  useEffect(() => {
    if (items?.length) {
      const ini = {}
      items.forEach((c) => { ini[c.id] = c.valor })
      setValores((prev) => ({ ...prev, ...ini }))
      const item = items.find((c) => (c.clave || '').toLowerCase() === 'lote_republicano_anos')
      if (item && item.valor) {
        try {
          const parsed = JSON.parse(item.valor)
          if (typeof parsed === 'object' && parsed !== null) setAnosPorLetra(parsed)
        } catch {}
      }
    }
  }, [items])

  useEffect(() => {
    setLoadingLetras(true)
    stockApi
      .loteRepublicanoLetrasAnos()
      .then((r) => setLetrasAno(r.data?.letras || []))
      .catch(() => setLetrasAno([]))
      .finally(() => setLoadingLetras(false))
  }, [])

  const handleChange = (id, value) => {
    setValores((prev) => ({ ...prev, [id]: value }))
  }

  const handleGuardar = async (item) => {
    const valor = valores[item.id]
    if (valor === undefined) return
    try {
      setSavingId(item.id)
      await configuracionApi.actualizar(item.id, { valor: String(valor) })
      await refresh()
      toast.success(`"${item.clave}" actualizado. Los cambios se aplican en la aplicación.`)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al guardar')
    } finally {
      setSavingId(null)
    }
  }

  const getItemByClave = (clave) => (items || []).find((c) => (c.clave || '').toLowerCase() === clave.toLowerCase())

  const handleGuardarLoteAnos = async () => {
    const item = getItemByClave('lote_republicano_anos')
    if (!item) {
      toast.error('No existe la opción de letras de año. Ejecute las migraciones de la base de datos.')
      return
    }
    try {
      setSavingLoteAnos(true)
      const valor = JSON.stringify(anosPorLetra)
      await configuracionApi.actualizar(item.id, { valor })
      await refresh()
      toast.success('Letras de año guardadas. La traducción de lotes republicanos se actualizará.')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al guardar')
    } finally {
      setSavingLoteAnos(false)
    }
  }

  const setAnoLetra = (letra, ano) => {
    setAnosPorLetra((prev) => {
      const next = { ...prev }
      const v = String(ano).trim()
      if (v === '') delete next[letra]
      else next[letra] = v
      return next
    })
  }

  const letrasParaLista = [...new Set([...letrasAno, ...Object.keys(anosPorLetra)])].sort()

  const handleLogoFile = (item, e) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) {
      toast.error('Seleccione una imagen válida (PNG, JPG, GIF, WebP, etc.)')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      handleChange(item.id, reader.result)
      toast.success('Imagen cargada. Pulse Guardar para aplicar.')
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const renderInput = (item) => {
    const valor = valores[item.id] ?? item.valor ?? ''
    const id = item.id
    const clave = (item.clave || '').toLowerCase()
    const tipo = (item.tipo || 'string').toLowerCase()

    if (clave === 'tema') {
      return (
        <select
          value={valor}
          onChange={(e) => handleChange(id, e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[var(--color-primary,#2563eb)] dark:bg-gray-700 dark:text-white text-sm min-w-[140px]"
        >
          <option value="claro">Claro</option>
          <option value="oscuro">Oscuro</option>
        </select>
      )
    }

    if (clave === 'color_primario') {
      const hex = /^#[0-9A-Fa-f]{6}$/.test(valor) ? valor : '#2563eb'
      return (
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="color"
            value={hex}
            onChange={(e) => handleChange(id, e.target.value)}
            className="w-10 h-10 rounded border border-gray-300 dark:border-gray-600 cursor-pointer p-0"
          />
          <input
            type="text"
            value={valor}
            onChange={(e) => handleChange(id, e.target.value)}
            placeholder="#3B82F6"
            className="w-28 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[var(--color-primary,#2563eb)] dark:bg-gray-700 dark:text-white text-sm font-mono"
          />
        </div>
      )
    }

    if (clave === 'logo_empresa') {
      const tieneImagen = valor && (valor.startsWith('data:') || valor.startsWith('http'))
      return (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleLogoFile(item, e)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 text-sm font-medium"
            >
              <FolderOpen className="w-4 h-4" />
              Examinar...
            </button>
            <span className="text-xs text-gray-500 dark:text-gray-400">Cualquier imagen (PNG, JPG, GIF, WebP) desde tu PC</span>
          </div>
          {tieneImagen && (
            <div className="flex items-center gap-2 mt-1">
              <img src={valor} alt="Vista previa logo" className="h-10 max-w-[140px] object-contain border border-gray-200 dark:border-gray-600 rounded" />
              <button
                type="button"
                onClick={() => handleChange(id, '')}
                className="text-xs text-red-600 dark:text-red-400 hover:underline"
              >
                Quitar logo
              </button>
            </div>
          )}
        </div>
      )
    }

    const numInput = (min, max, w = 'w-20') => (
      <input
        type="number"
        min={min}
        max={max}
        value={valor}
        onChange={(e) => handleChange(id, e.target.value)}
        className={`${w} px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[var(--color-primary,#2563eb)] dark:bg-gray-700 dark:text-white text-sm`}
      />
    )
    if (clave === 'tamaño_fuente') return numInput(10, 24)
    if (clave === 'tamaño_titulos') return numInput(14, 32)
    if (clave === 'tamaño_texto') return numInput(10, 24)
    if (clave === 'tamaño_tablas') return numInput(10, 20)
    if (clave === 'tamaño_modales') return numInput(10, 24)
    if (clave === 'tamaño_logo') return numInput(24, 120)

    if (clave === 'registros_por_pagina') {
      return (
        <input
          type="number"
          min={5}
          max={100}
          value={valor}
          onChange={(e) => handleChange(id, e.target.value)}
          className="w-20 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[var(--color-primary,#2563eb)] dark:bg-gray-700 dark:text-white text-sm"
        />
      )
    }

    if (tipo === 'boolean') {
      const checked = valor === 'true' || valor === true
      return (
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => handleChange(id, e.target.checked ? 'true' : 'false')}
          className="rounded border-gray-300 dark:border-gray-600 text-[var(--color-primary,#2563eb)] focus:ring-[var(--color-primary,#2563eb)] dark:bg-gray-700"
        />
      )
    }
    if (tipo === 'number') {
      return (
        <input
          type="number"
          value={valor}
          onChange={(e) => handleChange(id, e.target.value)}
          className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[var(--color-primary,#2563eb)] dark:bg-gray-700 dark:text-white text-sm"
        />
      )
    }
    if (tipo === 'json') {
      return (
        <textarea
          value={valor}
          onChange={(e) => handleChange(id, e.target.value)}
          rows={2}
          className="w-full max-w-md px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[var(--color-primary,#2563eb)] dark:bg-gray-700 dark:text-white text-sm font-mono"
          placeholder="{}"
        />
      )
    }
    return (
      <input
        type="text"
        value={valor}
        onChange={(e) => handleChange(id, e.target.value)}
        className="flex-1 min-w-[120px] max-w-md px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[var(--color-primary,#2563eb)] dark:bg-gray-700 dark:text-white text-sm"
      />
    )
  }

  if (configLoading && !items?.length) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-10 h-10 text-[var(--color-primary,#2563eb)] animate-spin" />
      </div>
    )
  }

  const list = items || []
  const itemsApariencia = CLAVES_APARIENCIA.map((clave) => getItemByClave(clave)).filter(Boolean)
  const itemsFuente = CLAVES_TAMAÑOS_TEXTO.map((clave) => getItemByClave(clave)).filter(Boolean)

  if (!list.length && !configLoading) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <Settings className="w-8 h-8 text-[var(--color-primary,#2563eb)]" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Configuración</h1>
        </div>
        <p className="text-gray-500 dark:text-gray-400">No hay entradas de configuración. Ejecuta el esquema de la base de datos.</p>
      </div>
    )
  }

  const filaGuardar = (item) => (
    <button
      type="button"
      onClick={() => handleGuardar(item)}
      disabled={savingId === item.id}
      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-white text-xs font-medium disabled:opacity-50"
      style={{ backgroundColor: 'var(--color-primary, #2563eb)' }}
    >
      {savingId === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
      Guardar
    </button>
  )

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Settings className="w-8 h-8 text-[var(--color-primary,#2563eb)]" />
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Sistema</p>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Configuración</h1>
        </div>
      </div>

      <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
        Cada usuario tiene su propia configuración. Los cambios se aplican al guardar cada opción.
      </p>

      {/* 1. Apariencia general: tema, color primario, logo, registros por página */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Apariencia general</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Tema, color primario, logo de la empresa y registros por página en tablas.</p>
        </div>
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {itemsApariencia.map((item) => (
            <div key={item.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="font-medium text-gray-900 dark:text-white">{item.clave}</span>
                {item.descripcion && <span className="text-gray-500 dark:text-gray-400 text-sm ml-2">{item.descripcion}</span>}
              </div>
              <div className="flex items-center gap-2">
                {renderInput(item)}
                {filaGuardar(item)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Tamaños de Textos: con ejemplo en tiempo real */}
      {/* 3. Lotes republicanos - Letras de año */}
      {getItemByClave('lote_republicano_anos') && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Lotes republicanos — Letras de año
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Asigne el año (ej. 2025) a cada letra que aparece en los lotes con formato republicano (ej. 29N-H). Así se mostrará la fecha traducida al costado del lote.
            </p>
          </div>
          <div className="p-4">
            {loadingLetras ? (
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                Cargando letras encontradas en stock...
              </div>
            ) : letrasParaLista.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No hay lotes con formato republicano en el sistema. Cuando ingrese lotes como 29N-H, aquí aparecerán las letras de año para configurarlas.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {letrasParaLista.map((letra) => (
                    <div key={letra} className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-gray-900 dark:text-white w-8">"{letra}"</span>
                      <span className="text-gray-500 dark:text-gray-400">→</span>
                      <input
                        type="number"
                        min={2000}
                        max={2099}
                        placeholder="Año (ej. 2025)"
                        value={anosPorLetra[letra] ?? ''}
                        onChange={(e) => setAnoLetra(letra, e.target.value)}
                        className="flex-1 min-w-0 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[var(--color-primary,#2563eb)] dark:bg-gray-700 dark:text-white text-sm"
                      />
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleGuardarLoteAnos}
                  disabled={savingLoteAnos}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                  style={{ backgroundColor: 'var(--color-primary, #2563eb)' }}
                >
                  {savingLoteAnos ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Guardar letras de año
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tamaños de Textos: con ejemplo en tiempo real */}
      {itemsFuente.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Tamaños de textos</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Cada opción controla el tamaño en píxeles. El ejemplo debajo cambia en tiempo real al modificar el valor (guarde para aplicar en toda la app).</p>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {itemsFuente.map((item) => {
              const clave = (item.clave || '').toLowerCase()
              const ej = EJEMPLOS_FUENTE[clave]
              const valorNum = parseInt(valores[item.id] ?? item.valor ?? '14', 10) || 14
              const px = Math.min(32, Math.max(10, valorNum))
              return (
                <div key={item.id} className="px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                    <div>
                      <span className="font-medium text-gray-900 dark:text-white">{ej?.label || item.clave}</span>
                      <span className="text-gray-500 dark:text-gray-400 text-sm ml-2">({item.clave})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {renderInput(item)}
                      {filaGuardar(item)}
                    </div>
                  </div>
                  <div className="mt-2 pl-1 text-gray-600 dark:text-gray-400 border-l-2 border-gray-300 dark:border-gray-600" style={{ fontSize: `${px}px` }}>
                    Ejemplo en tiempo real: {ej?.ejemplo || 'Texto de ejemplo'}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default Configuracion
