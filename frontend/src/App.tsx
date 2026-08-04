import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api'
import type { Candle, Indicators, Quote, SymbolInfo } from './types'
import { useWebSocket, type WsMessage } from './hooks/useWebSocket'
import { Chart } from './components/Chart'
import { TickerTape } from './components/TickerTape'
import { Watchlist } from './components/Watchlist'
import { OrderBookView } from './components/OrderBookView'
import { TradingPanel } from './components/TradingPanel'
import { PortfolioView } from './components/PortfolioView'
import { AnalysisPanel } from './components/AnalysisPanel'
import { BacktestPanel } from './components/BacktestPanel'

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d']

type Tab = 'trading' | 'portfolio' | 'analysis' | 'backtest'

export default function App() {
  const [symbols, setSymbols] = useState<SymbolInfo[]>([])
  const [selected, setSelected] = useState('AAPL')
  const [timeframe, setTimeframe] = useState('5m')
  const [quotes, setQuotes] = useState<Record<string, Quote>>({})
  const [indexInfo, setIndexInfo] = useState<{ level: number; change_pct: number } | null>(null)
  const [book, setBook] = useState<{ symbol: string; asks: { price: number; size: number }[]; bids: { price: number; size: number }[] } | null>(null)
  const [candles, setCandles] = useState<Candle[]>([])
  const [indicators, setIndicators] = useState<Indicators | null>(null)
  const [tab, setTab] = useState<Tab>('trading')
  const [connected, setConnected] = useState(false)
  const [livePrice, setLivePrice] = useState<number | null>(null)
  const livePriceRef = useRef<number | null>(null)
  const selectedRef = useRef(selected)

  useEffect(() => { selectedRef.current = selected }, [selected])

  useEffect(() => {
    api.symbols().then(setSymbols).catch(() => {})
    api.index().then(setIndexInfo).catch(() => {})
  }, [])

  const refreshQuotes = useCallback(async () => {
    try {
      const q = await api.quotes()
      const map: Record<string, Quote> = {}
      q.quotes.forEach((x) => (map[x.symbol] = x))
      setQuotes((prev) => ({ ...prev, ...map }))
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { refreshQuotes(); const t = setInterval(refreshQuotes, 4000); return () => clearInterval(t) }, [refreshQuotes])

  useEffect(() => {
    api.candles(selected, timeframe, 400).then((b) => {
      setCandles(b.values)
      setLivePrice(b.values.length ? b.values[b.values.length - 1].c : null)
    }).catch(() => {})
    api.indicators(selected, timeframe, 400).then(setIndicators).catch(() => setIndicators(null))
  }, [selected, timeframe])

  const onWs = useCallback((msg: WsMessage) => {
    if (msg.type === 'hello') setConnected(true)
    if (msg.type === 'live' && msg.quotes) {
      msg.quotes.forEach((q) => {
        if (q.symbol === selectedRef.current) {
          livePriceRef.current = q.price
          setLivePrice(q.price)
        }
      })
    }
    if (msg.type === 'orderbook' && msg.book) setBook(msg.book)
  }, [])
  const { send } = useWebSocket(onWs)

  const select = useCallback((s: string) => {
    setSelected(s)
    send({ type: 'subscribe', symbol: s })
  }, [send])

  const prices = useMemo(() => {
    const m: Record<string, number> = {}
    Object.values(quotes).forEach((q) => (m[q.symbol] = q.price))
    return m
  }, [quotes])

  const q = quotes[selected]
  const change = q?.change_pct ?? 0
  const up = change >= 0
  const allSymbols = symbols.map((s) => s.symbol)

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">◈</span> Market<span className="acc">Sim</span>
          <span className="index-pill">
            SIM500 <b>{indexInfo?.level?.toLocaleString()}</b>
            <span className={indexInfo && indexInfo.change_pct >= 0 ? 'up' : 'down'}>{indexInfo && `${indexInfo.change_pct >= 0 ? '+' : ''}${indexInfo.change_pct}%`}</span>
          </span>
        </div>
        <nav className="tabs">
          {(['trading', 'portfolio', 'analysis', 'backtest'] as Tab[]).map((t) => (
            <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>
          ))}
        </nav>
        <div className="conn">
          <span className={`dot ${connected ? 'on' : ''}`} /> {connected ? 'LIVE' : 'connecting…'}
        </div>
      </header>

      <TickerTape quotes={Object.values(quotes)} onSelect={select} />

      <div className="layout">
        <Watchlist symbols={symbols} quotes={quotes} selected={selected} onSelect={select} />

        <main className="main">
          <div className="symbol-header">
            <div>
              <h1>{selected}</h1>
              <div className="sub-name">{q?.name} · {q?.sector}</div>
            </div>
            <div className="price-block">
              <span className="big-price">{livePrice?.toFixed(2) ?? '—'}</span>
              <span className={`chg-pill ${up ? 'up' : 'down'}`}>{up ? '+' : ''}{change.toFixed(2)}%</span>
            </div>
            <div className="tf-buttons">
              {TIMEFRAMES.map((tf) => (
                <button key={tf} className={timeframe === tf ? 'active' : ''} onClick={() => setTimeframe(tf)}>{tf}</button>
              ))}
            </div>
          </div>

          {tab === 'trading' && (
            <div className="trading-layout">
              <div className="chart-wrap card">
                <Chart candles={candles} indicators={indicators} live={{ price: livePrice ?? undefined, ts: Date.now() }} />
              </div>
              <div className="side-col">
                <OrderBookView book={book} />
                <TradingPanel symbol={selected} price={livePrice} />
              </div>
            </div>
          )}
          {tab === 'portfolio' && <PortfolioView prices={prices} />}
          {tab === 'analysis' && <AnalysisPanel symbol={selected} symbols={symbols} allSymbols={allSymbols} />}
          {tab === 'backtest' && <BacktestPanel symbol={selected} />}
        </main>
      </div>
    </div>
  )
}