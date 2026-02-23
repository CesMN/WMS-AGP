import { createContext, useContext, useState } from 'react'

const PosicionEnTransitoContext = createContext(null)

export const usePosicionEnTransito = () => {
  const ctx = useContext(PosicionEnTransitoContext)
  return ctx
}

/**
 * Datos de la posición que está siendo movida entre carriles/almacenes.
 * @typedef {{
 *   posicionId: string
 *   numeroPosicion: number
 *   almacenId: string
 *   almacenNombre: string
 *   carrilId: string
 *   carrilNombre: string
 *   nivelId: string
 *   productoResumen?: string
 * }} PosicionEnTransito
 */

export const PosicionEnTransitoProvider = ({ children }) => {
  const [enTransito, setEnTransito] = useState(null)

  const clearTransito = () => setEnTransito(null)

  const value = {
    enTransito,
    setEnTransito,
    clearTransito,
  }

  return (
    <PosicionEnTransitoContext.Provider value={value}>
      {children}
    </PosicionEnTransitoContext.Provider>
  )
}
