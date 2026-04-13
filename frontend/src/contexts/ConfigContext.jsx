import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { configuracionApi } from '../api/configuracion'
import toast from 'react-hot-toast'

const ConfigContext = createContext()

export const useConfig = () => {
  const context = useContext(ConfigContext)
  if (!context) {
    throw new Error('useConfig debe usarse dentro de ConfigProvider')
  }
  return context
}

const CLAVES = {
  TEMA: 'tema',
  COLOR_PRIMARIO: 'color_primario',
  TAMAÑO_FUENTE: 'tamaño_fuente',
  TAMAÑO_TITULOS: 'tamaño_titulos',
  TAMAÑO_TEXTO: 'tamaño_texto',
  TAMAÑO_TABLAS: 'tamaño_tablas',
  TAMAÑO_MODALES: 'tamaño_modales',
  REGISTROS_POR_PAGINA: 'registros_por_pagina',
  LOGO_EMPRESA: 'logo_empresa',
  TAMAÑO_LOGO: 'tamaño_logo',
  NOMBRE_EMPRESA: 'nombre_empresa',
  LOTE_REPUBLICANO_ANOS: 'lote_republicano_anos',
}

export const ConfigProvider = ({ children }) => {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [mapByClave, setMapByClave] = useState({})

  const getValor = useCallback((clave) => mapByClave[clave]?.valor ?? null, [mapByClave])
  const getId = useCallback((clave) => mapByClave[clave]?.id ?? null, [mapByClave])

  const refresh = useCallback(async () => {
    try {
      const { data } = await configuracionApi.listar()
      setItems(data || [])
      const map = {}
      ;(data || []).forEach((c) => {
        map[c.clave] = { id: c.id, valor: c.valor, tipo: c.tipo }
      })
      setMapByClave(map)
      return map
    } catch (e) {
      setItems([])
      setMapByClave({})
      toast.error('No se pudo cargar la configuración')
      return {}
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Aplicar al documento: variables CSS de fuente y color primario
  useEffect(() => {
    const root = document.documentElement
    const color = getValor(CLAVES.COLOR_PRIMARIO)
    if (color != null && color.trim() !== '') {
      root.style.setProperty('--color-primary', color.trim())
    } else {
      root.style.removeProperty('--color-primary')
    }

    const px = (clave, min, max, def) => {
      const v = getValor(clave)
      if (v == null || v === '') return def
      const num = parseInt(v, 10)
      if (isNaN(num)) return def
      const clamped = Math.min(max, Math.max(min, num))
      return `${clamped}px`
    }
    root.style.setProperty('--font-size-base', px(CLAVES.TAMAÑO_FUENTE, 10, 24, '13px'))
    root.style.setProperty('--font-size-titles', px(CLAVES.TAMAÑO_TITULOS, 14, 32, '17px'))
    root.style.setProperty('--font-size-text', px(CLAVES.TAMAÑO_TEXTO, 10, 24, '13px'))
    root.style.setProperty('--font-size-table', px(CLAVES.TAMAÑO_TABLAS, 10, 20, '12px'))
    root.style.setProperty('--font-size-modal', px(CLAVES.TAMAÑO_MODALES, 10, 24, '13px'))
  }, [getValor, mapByClave])

  const setConfigValor = useCallback(
    async (clave, valor) => {
      const id = getId(clave)
      if (!id) return
      await configuracionApi.actualizar(id, { valor: String(valor) })
      await refresh()
    },
    [getId, refresh]
  )

  const value = {
    loading: loading,
    items,
    mapByClave,
    refresh,
    setConfigValor,
    tema: getValor(CLAVES.TEMA) || 'claro',
    colorPrimario: getValor(CLAVES.COLOR_PRIMARIO) || '#2563eb',
    tamañoFuente: getValor(CLAVES.TAMAÑO_FUENTE) || '13',
    tamañoTitulos: getValor(CLAVES.TAMAÑO_TITULOS) || '17',
    tamañoTexto: getValor(CLAVES.TAMAÑO_TEXTO) || '13',
    tamañoTablas: getValor(CLAVES.TAMAÑO_TABLAS) || '12',
    tamañoModales: getValor(CLAVES.TAMAÑO_MODALES) || '13',
    registrosPorPagina: Math.max(10, parseInt(getValor(CLAVES.REGISTROS_POR_PAGINA), 10) || 20),
    logoEmpresa: getValor(CLAVES.LOGO_EMPRESA) || '',
    tamañoLogo: Math.min(120, Math.max(24, parseInt(getValor(CLAVES.TAMAÑO_LOGO), 10) || 48)),
    nombreEmpresa: getValor(CLAVES.NOMBRE_EMPRESA) || 'Sistema WMS',
    lotRepublicanoAnos: (() => {
      const raw = getValor(CLAVES.LOTE_REPUBLICANO_ANOS)
      if (raw == null || raw === '') return {}
      try {
        const parsed = JSON.parse(raw)
        return typeof parsed === 'object' && parsed !== null ? parsed : {}
      } catch {
        return {}
      }
    })(),
    CLAVES,
  }

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>
}
