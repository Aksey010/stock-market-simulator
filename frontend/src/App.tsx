import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api'
import type { Candle, Indicators, MarketSources, Quote, SymbolInfo } from './types'
import { useWebSocket, type WsMessage } from './hooks/useWebSocket'
import { Chart } from './components/Chart'
import { TickerTape } from './components/TickerTape'
import { Watchlist } from './components/Watchlist'
import { OrderBookView } from './components/OrderBookView'
import { TradingPanel } from './components/TradingPanel'
import { PortfolioView } from './components/PortfolioView'
import { AnalysisPanel } from './components/AnalysisPanel'
import { BacktestPanel } from './components/BacktestPanel'
import { RLAgentPanel } from './components/RLAgentPanel'

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d']

type Tab = 'trading' | 'portfolio' | 'analysis' | 'backtest' | 'rl'
type DataSource = 'sim' | 'real'

export default function App() {
  const [symbols, setSymbols] = useState<SymbolInfo[]>([])
  const [selected, setSelected] = useState('AAPL')
  const [timeframe, setTimeframe] = useState('5m')
  const [source, setSource] = useState<DataSource>('sim')
  const [sourcesInfo, setSourcesInfo] = useState<MarketSources | null>(null)
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
  const sourceRef = useRef<DataSource>('sim')
  const [candleNote, setCandleNote] = useState('')

  useEffect(() => { selectedRef.current = selected }, [selected])
  useEffect(() => { sourceRef.current = source }, [source])

  // Retry initial loads until the backend is reachable.
  useEffect(() => {
    let stopped = false
    const load = async () => {
      try {
        const [s, ix] = await Promise.all([api.symbols(), api.index()])
        if (stopped) return
        setSymbols(s)
        setIndexInfo(ix)
        return true
      } catch {
        return false
      }
    }
    let timer = 0
    const attempt = async () => {
      const ok = await load()
      if (!ok && !stopped) timer = window.setTimeout(attempt, 1500)
    }
    attempt()
    return () => { stopped = true; clearTimeout(timer) }
  }, [])

  const refreshQuotes = useCallback(async () => {
    try {
      const q = await api.quotes()
      const map: Record<string, Quote> = {}
      q.quotes.forEach((x) => (map[x.symbol] = x))
      setQuotes((prev) => ({ ...prev, ...map }))
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { refreshQuotes(); const t = setInterval(refreshQuotes, 2000); return () => clearInterval(t) }, [refreshQuotes])

  // market sources availability
  useEffect(() => {
    api.marketSources().then(setSourcesInfo).catch(() => {})
  }, [])

  // Load candles + indicators, retrying until they arrive.
  useEffect(() => {
    let stopped = false
    let timer = 0
    const load = async () => {
      try {
        const [b, ind] = await Promise.all([
          api.candles(selected, timeframe, 400, source),
          api.indicators(selected, timeframe, 400, source),
        ])
        if (stopped) return
        setCandles(b.values)
        setIndicators(ind)
        setCandleNote(b.note || '')
        if (b.values.length) setLivePrice(b.values[b.values.length - 1].c)
      } catch {
        if (!stopped) timer = window.setTimeout(load, 1500)
      }
    }
    load()
    return () => { stopped = true; clearTimeout(timer) }
  }, [selected, timeframe, source])

  // Order book: fetch over REST as a fallback, refresh periodically while WS is down.
  useEffect(() => {
    let stopped = false
    const fetchBook = async () => {
      try {
        const b = await api.orderbook(selected)
        if (!stopped) setBook(b)
      } catch { /* ignore */ }
    }
    fetchBook()
    const t = setInterval(() => {
      if (!connected) fetchBook()
    }, 2500)
    return () => { stopped = true; clearInterval(t) }
  }, [selected, connected])

  // Periodic candle refresh so newly formed bars appear (esp. on 1m).
  useEffect(() => {
    if (tab !== 'trading') return
    let stopped = false
    const intervalMs = timeframe === '1m' ? 10000 : timeframe === '5m' ? 20000 : 30000
    const t = setInterval(async () => {
      if (stopped) return
      try {
        const b = await api.candles(selected, timeframe, 400, source)
        if (!stopped) { setCandles(b.values); setCandleNote(b.note || '') }
      } catch { /* ignore */ }
    }, intervalMs)
    return () => { stopped = true; clearInterval(t) }
  }, [selected, timeframe, tab, source])

  // Real quote polling when Real mode is active (live WS feed stays simulated).
  useEffect(() => {
    if (source !== 'real') return
    let stopped = false
    const load = async () => {
      try {
        const q = await api.realQuote(selected)
        if (!stopped) setLivePrice(q.price)
      } catch { /* ignore */ }
    }
    load()
    const t = setInterval(load, 15000)
    return () => { stopped = true; clearInterval(t) }
  }, [source, selected])

  const onWs = useCallback((msg: WsMessage) => {
    if (msg.type === 'hello') setConnected(true)
    if (msg.type === 'live' && msg.quotes) {
      msg.quotes.forEach((q) => {
        if (q.symbol === selectedRef.current && sourceRef.current === 'sim') {
          livePriceRef.current = q.price
          setLivePrice(q.price)
        }
      })
    }
    if (msg.type === 'orderbook' && msg.book) setBook(msg.book)
  }, [])
  const { send, subscribe } = useWebSocket({ onMessage: onWs, onStatus: setConnected })

  const select = useCallback((s: string) => {
    setSelected(s)
    subscribe(s)
  }, [subscribe])

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
          {(['trading', 'portfolio', 'analysis', 'backtest', 'rl'] as Tab[]).map((t) => (
            <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>
          ))}
        </nav>
        <div className="source-switch" title="Chart data source">
          <button
            className={source === 'sim' ? 'on' : ''}
            onClick={() => setSource('sim')}
            disabled={!sourcesInfo?.real_available && source === 'sim'}
          >SIM</button>
          <button
            className={source === 'real' ? 'on' : ''}
            onClick={() => setSource('real')}
            disabled={!sourcesInfo?.real_available}
          >REAL</button>
        </div>
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
                {candleNote && <div className="candle-note">{candleNote}</div>}
                <Chart
                  candles={candles}
                  indicators={indicators}
                  live={source === 'sim' ? { price: livePrice ?? undefined, ts: Date.now() } : undefined}
                />
              </div>
              <div className="side-col">
                <OrderBookView book={book} />
                <TradingPanel symbol={selected} price={livePrice} />
              </div>
            </div>
          )}
          {tab === 'portfolio' && <PortfolioView prices={prices} />}
          {tab === 'analysis' && <AnalysisPanel symbol={selected} symbols={symbols} allSymbols={allSymbols} source={source} />}
          {tab === 'backtest' && <BacktestPanel symbol={selected} source={source} />}
          {tab === 'rl' && <RLAgentPanel symbol={selected} source={source} />}
        </main>
      </div>
    </div>
  )
}