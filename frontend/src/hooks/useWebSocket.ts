import { useEffect, useRef } from 'react'

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

export function useWebSocket(onMessage: (msg: WsMessage) => void) {
  const wsRef = useRef<WebSocket | null>(null)
  const cbRef = useRef(onMessage)
  cbRef.current = onMessage

  useEffect(() => {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const host = import.meta.env.VITE_WS_BASE || window.location.host
    const ws = new WebSocket(`${proto}://${host}/ws`)
    wsRef.current = ws

    ws.onopen = () => ws.send(JSON.stringify({ type: 'subscribe', symbol: 'AAPL' }))
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data)
        cbRef.current(data)
      } catch {
        /* ignore */
      }
    }
    ws.onclose = () => {
      setTimeout(() => {
        // minimal reconnect handled by caller remount if desired
      }, 3000)
    }
    return () => ws.close()
  }, [])

  const send = (obj: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(obj))
  }

  return { send }
}