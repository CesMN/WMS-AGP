import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { notificacionesApi } from '../api/notificaciones'

const NotificationsContext = createContext(null)

export const useNotifications = () => {
  const ctx = useContext(NotificationsContext)
  if (!ctx) throw new Error('useNotifications debe usarse dentro de NotificationsProvider')
  return ctx
}

export const NotificationsProvider = ({ children }) => {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)
  const [connected, setConnected] = useState(false)
  const eventSourceRef = useRef(null)
  const retryRef = useRef(0)
  const retryTimerRef = useRef(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [listRes, resumenRes] = await Promise.all([
        notificacionesApi.listar({ limit: 20, offset: 0 }),
        notificacionesApi.resumen(),
      ])
      setItems(listRes?.data?.data || [])
      setUnreadCount(Number(resumenRes?.data?.unread || 0))
    } catch (e) {
      setError(e?.response?.data?.message || 'Error cargando notificaciones')
    } finally {
      setLoading(false)
    }
  }, [])

  const markAsRead = useCallback(async (id) => {
    if (!id) return
    await notificacionesApi.marcarLeida(id)
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, leida_at: n.leida_at || new Date().toISOString() } : n)))
    setUnreadCount((c) => Math.max(0, c - 1))
  }, [])

  const markAllAsRead = useCallback(async () => {
    await notificacionesApi.marcarTodasLeidas()
    const now = new Date().toISOString()
    setItems((prev) => prev.map((n) => ({ ...n, leida_at: n.leida_at || now })))
    setUnreadCount(0)
  }, [])

  const dismissOne = useCallback(async (id) => {
    if (!id) return
    await notificacionesApi.descartar(id)
    setItems((prev) => {
      const item = prev.find((n) => n.id === id)
      if (item && !item.leida_at) {
        setUnreadCount((c) => Math.max(0, c - 1))
      }
      return prev.filter((n) => n.id !== id)
    })
  }, [])

  const dismissAll = useCallback(async () => {
    await notificacionesApi.descartarTodas()
    setItems([])
    setUnreadCount(0)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const connectSse = useCallback(() => {
    if (eventSourceRef.current) return
    const url = notificacionesApi.streamUrl()
    const es = new EventSource(url)
    eventSourceRef.current = es
    es.onopen = () => {
      setConnected(true)
      retryRef.current = 0
    }
    es.onerror = () => {
      setConnected(false)
      es.close()
      eventSourceRef.current = null
      const step = Math.min(5, retryRef.current + 1)
      retryRef.current = step
      const waitMs = Math.min(30000, 1000 * 2 ** step)
      clearTimeout(retryTimerRef.current)
      retryTimerRef.current = setTimeout(() => {
        if (document.visibilityState === 'visible') connectSse()
      }, waitMs)
    }
    es.addEventListener('notification', (ev) => {
      try {
        const data = JSON.parse(ev.data || '{}')
        if (!data?.id) return
        setItems((prev) => {
          const exists = prev.some((x) => x.id === data.id)
          if (exists) return prev
          return [data, ...prev].slice(0, 20)
        })
        setUnreadCount((c) => c + 1)
      } catch {
        // ignore
      }
    })
  }, [])

  useEffect(() => {
    connectSse()
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        refresh()
        connectSse()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearTimeout(retryTimerRef.current)
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [connectSse, refresh])

  const value = useMemo(
    () => ({
      items,
      loading,
      error,
      unreadCount,
      connected,
      refresh,
      markAsRead,
      markAllAsRead,
      dismissOne,
      dismissAll,
    }),
    [items, loading, error, unreadCount, connected, refresh, markAsRead, markAllAsRead, dismissOne, dismissAll]
  )

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
}
