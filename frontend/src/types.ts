export interface SymbolInfo {
  symbol: string
  name: string
  description: string
  sector: string
  volatility: number
  initial_price: number
  drift: number
  regime: string
}

export interface Candle {
  t: number
  o: number
  h: number
  l: number
  c: number
  v: number
}

export interface BarSeries {
  symbol: string
  timeframe: string
  values: Candle[]
  source?: string
  note?: string
}

export interface RealQuote {
  symbol: string
  price: number
  change_pct: number
  currency: string
}

export interface MarketSources {
  real_available: boolean
  real_timeframes: string[]
  mode: string
}

export interface RLJob {
  job_id: string
  status: string
  progress?: number
  symbol?: string
  result?: RLResult
  error?: string
}

export interface RLResult {
  symbol: string
  timeframe: string
  final_equity: number
  return_pct: number
  benchmark_return_pct: number
  sharpe: number
  volatility_pct: number
  total_reward: number
  action_counts: { HOLD: number; BUY: number; SELL: number }
  trained_on: number
  episodes: number
  equity_curve: number[]
  episode_rewards: number[]
}

export interface RLSignal {
  symbol: string
  signal: 'buy' | 'sell' | 'hold'
  confidence: number
  price: number
  rsi: number
  roc: number
  trained: boolean
  timeframe: string
  source: string
}

export interface RLAgentStatus {
  symbol: string
  timeframe: string
  trained_episodes: number
  return_pct: number
  q_size: number
}

export interface Indicators {
  sma_10: number[]
  sma_20: number[]
  sma_50: number[]
  ema_12: number[]
  ema_26: number[]
  rsi_14: number[]
  macd: number[]
  macd_signal: number[]
  macd_hist: number[]
  bb_upper: number[]
  bb_mid: number[]
  bb_lower: number[]
  bb_width: number[]
  bb_pct_b: number[]
  stoch_k: number[]
  stoch_d: number[]
  atr_14: number[]
  obv: number[]
  roc_12: number[]
  williams_r: number[]
  cci_20: number[]
  volatility_20: number[]
}

export interface OrderBookLevel {
  price: number
  size: number
  count: number
}

export interface OrderBook {
  symbol: string
  asks: OrderBookLevel[]
  bids: OrderBookLevel[]
  spread: number
  mid: number
}

export interface Quote {
  symbol: string
  price: number
  change_pct: number
  sector: string
  name: string
}

export interface Portfolio {
  cash: number
  equity: number
  positions: Position[]
  total_pnl: number
  unrealized_pnl: number
  account_value: number
}

export interface Position {
  symbol: string
  qty: number
  avg_cost: number
  realized_pnl: number
}

export interface Order {
  id: string
  symbol: string
  side: 'buy' | 'sell'
  type: string
  qty: number
  filled_qty: number
  avg_price: number | null
  price: number | null
  stop_price: number | null
  status: string
  created_at: number
  filled_at: number | null
  error: string
}

export interface Trade {
  id: string
  order_id: string
  symbol: string
  side: 'buy' | 'sell'
  qty: number
  price: number
  ts: number
  pnl: number | null
}

export interface OrderRequest {
  symbol: string
  side: 'buy' | 'sell'
  qty: number
  type: 'market' | 'limit' | 'stop' | 'stop_limit'
  price?: number | null
  stop_price?: number | null
}

export interface Stats {
  current: number
  mean: number
  median: number
  std: number
  min: number
  max: number
  range: number
  skewness: number
  kurtosis: number
  mean_return: number
  std_return: number
  annualized_volatility: number
  sharpe: number
  var_95: number
  var_99: number
  max_drawdown: number
  positive_days: number
  negative_days: number
  hit_rate: number
  worst_day: number
  best_day: number
}

export interface Regime {
  regime: string
  trend_annualized_pct: number
  volatility_annualized_pct: number
}

export interface TechnicalSummary {
  price: number
  rsi: number
  macd_hist: number
  trend: string
  signals: string[]
  suggested: string
}

export interface Analysis {
  symbol: string
  stats: Stats
  regime: Regime
  technical: TechnicalSummary
  forecast: number[]
}

export interface BacktestConfigReq {
  symbol: string
  timeframe: string
  strategy: string
  initial_cash: number
  commission: number
  source?: string
}

export interface BacktestResult {
  trades: Trade[]
  equity_curve: { t: number; equity: number }[]
  metrics: Record<string, number>
  symbol: string
}

export interface IndexInfo {
  name: string
  level: number
  change_pct: number
  components: number
}
