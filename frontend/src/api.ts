import type {
  Analysis,
  BacktestConfigReq,
  BacktestResult,
  BarSeries,
  Indicators,
  Order,
  OrderBook,
  OrderRequest,
  Portfolio,
  Quote,
  SymbolInfo,
  Trade,
} from './types'

const BASE = import.meta.env.VITE_API_BASE || ''

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.json()
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.json()
}

export const api = {
  symbols: () => get<SymbolInfo[]>('/api/symbols'),
  quotes: () => get<{ quotes: Quote[] }>('/api/quotes'),
  index: () => get<{ name: string; level: number; change_pct: number; components: number }>('/api/index'),
  sectors: () => get<Record<string, string[]>>('/api/sectors'),
  sectorPerf: () => get<{ sector: string; change_pct: number; count: number }[]>('/api/sectors/performance'),
  candles: (symbol: string, timeframe: string, limit = 400) =>
    get<BarSeries>(`/api/candles/${symbol}?timeframe=${timeframe}&limit=${limit}`),
  indicators: (symbol: string, timeframe: string, limit = 400) =>
    get<Indicators>(`/api/indicators/${symbol}?timeframe=${timeframe}&limit=${limit}`),
  orderbook: (symbol: string) => get<OrderBook>(`/api/orderbook/${symbol}`),
  analysis: (symbol: string, timeframe = '5m') =>
    get<Analysis>(`/api/analysis/${symbol}?timeframe=${timeframe}`),
  correlations: (symbols: string[]) =>
    get<{ correlation: { symbols: string[]; corr: number[][] } }>(
      `/api/analysis/correlations?symbols=${encodeURIComponent(symbols.join(','))}`,
    ),
  portfolioRisk: (symbols: string[]) =>
    get<Record<string, unknown>>(`/api/analysis/portfolio_risk?symbols=${encodeURIComponent(symbols.join(','))}`),
  insights: (symbols: string[]) =>
    get<{ insights: string[] }>(`/api/analysis/insights?symbols=${encodeURIComponent(symbols.join(','))}`),
  portfolio: () => get<Portfolio>('/api/portfolio'),
  orders: () => get<Order[]>('/api/orders'),
  trades: () => get<Trade[]>('/api/trades'),
  equityHistory: () => get<{ points: { t: number; equity: number }[] }>('/api/equity-history'),
  placeOrder: (req: OrderRequest) => post<Order>('/api/orders', req),
  cancelOrder: (id: string) =>
    fetch(`${BASE}/api/orders/${id}`, { method: 'DELETE' }).then((r) => r.json()),
  backtest: (cfg: BacktestConfigReq) => post<BacktestResult>('/api/backtest', cfg),
  strategies: () => get<{ strategies: string[]; timeframes: string[] }>('/api/strategies'),
}
