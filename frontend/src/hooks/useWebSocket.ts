import { useCallback, useEffect, useRef } from 'react'

export interface WsLiveQuote {
  symbol: string
  price: number
  ts: number
  change_pct: number
}

export interface WsMessage {
  type: string
  quotes?: WsLiveQuote[]
  symbol?: string
  book?: { symbol: string; asks: { price: number; size: number }[]; bids: { price: number; size: number }[] }
}

interface Options {
  onMessage: (msg: WsMessage) => void
  onStatus?: (connected: boolean) => void
}

export function useWebSocket({ onMessage, onStatus }: Options) {
  const wsRef = useRef<WebSocket | null>(null)
  const cbRef = useRef(onMessage)
  const statusRef = useRef(onStatus)
  cbRef.current = onMessage
  statusRef.current = onStatus

  const symbolRef = useRef('AAPL')
  const shouldRunRef = useRef(true)
  const attemptsRef = useRef(0)

  const connect = useCallback(() => {
    if (!shouldRunRef.current) return
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const host = import.meta.env.VITE_WS_BASE || window.location.host
    const ws = new WebSocket(`${proto}://${host}/ws`)
    wsRef.current = ws

    ws.onopen = () => {
      attemptsRef.current = 0
      statusRef.current?.(true)
      ws.send(JSON.stringify({ type: 'subscribe', symbol: symbolRef.current }))
    }
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data)
        if (msg.type === 'orderbook' && msg.symbol) {
          symbolRef.current = msg.symbol
        }
        cbRef.current(msg)
      } catch {
        /* ignore malformed */
      }
    }
    ws.onclose = () => {
      statusRef.current?.(false)
      wsRef.current = null
      if (!shouldRunRef.current) return
      const delay = Math.min(1500 * 2 ** attemptsRef.current, 15000)
      attemptsRef.current += 1
      setTimeout(connect, delay)
    }
    ws.onerror = () => {
      try { ws.close() } catch { /* ignore */ }
    }
  }, [])

  useEffect(() => {
    shouldRunRef.current = true
    connect()
    return () => {
      shouldRunRef.current = false
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [connect])

  const send = useCallback((obj: Record<string, unknown>) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj))
    } else {
      // queue intent: remember symbol so it's sent on next (re)connect
      if (typeof obj.symbol === 'string') symbolRef.current = obj.symbol
    }
  }, [])

  const subscribe = useCallback(
    (symbol: string) => {
      symbolRef.current = symbol
      send({ type: 'subscribe', symbol })
    },
    [send],
  )

  return { send, subscribe }
}