import { useEffect, useState } from 'react'
import { api } from '../api'
import type { BacktestResult } from '../types'

const STRATS = ['sma_cross', 'ema_cross', 'rsi_mean_revert', 'macd_signal', 'bollinger_revert', 'buy_and_hold', 'momentum']

export function BacktestPanel({ symbol, source }: { symbol: string; source?: 'sim' | 'real' }) {
  const [strategy, setStrategy] = useState('sma_cross')
  const [timeframe, setTimeframe] = useState('1d')
  const [cash, setCash] = useState(10000)
  const [result, setResult] = useState<BacktestResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const run = async () => {
    setLoading(true); setErr('')
    try {
      const r = await api.backtest({ symbol, timeframe, strategy, initial_cash: cash, commission: 0.001, source: source || 'sim' })
      setResult(r)
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { run() }, [symbol, source])

  const m = result?.metrics || {}
  const eq = result?.equity_curve || []

  return (
    <div className="panel backtest">
      <div className="panel-head">Backtest · {symbol}</div>
      <div className="bt-controls">
        <label className="fld">
          <span>Strategy</span>
          <select value={strategy} onChange={(e) => setStrategy(e.target.value)}>
            {STRATS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="fld">
          <span>Timeframe</span>
          <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
            {['1m', '5m', '15m', '1h', '4h', '1d'].map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label className="fld">
          <span>Cash</span>
          <input type="number" value={cash} onChange={(e) => setCash(parseFloat(e.target.value) || 0)} />
        </label>
        <button className="submit neutral" onClick={run} disabled={loading}>{loading ? 'Running…' : 'Run'}</button>
      </div>
      {err && <div className="order-msg">{err}</div>}
      {result && (
        <>
          <div className="bt-metrics">
            {[
              ['Return', `${m.return_pct?.toFixed(2) ?? 0}%`, Number(m.return_pct ?? 0) >= 0],
              ['Benchmark', `${m.benchmark_return_pct?.toFixed(2) ?? 0}%`, Number(m.benchmark_return_pct ?? 0) >= 0],
              ['Sharpe', m.sharpe?.toFixed(2), Number(m.sharpe ?? 0) >= 0],
              ['Max DD', `${m.max_drawdown?.toFixed(2) ?? 0}%`, true],
              ['Volatility', `${m.volatility_pct?.toFixed(2) ?? 0}%`, true],
              ['Final Equity', `$${Number(m.final_equity ?? 0).toLocaleString()}`, true],
            ].map(([k, v, up]) => (
              <div key={k as string} className="stat"><span>{k}</span><b className={up ? '' : 'down'}>{v}</b></div>
            ))}
          </div>
          <EquityCurve data={eq} />
          <div className="mini-head">Trades · {result.trades.length}</div>
          <div className="bt-trades">
            {result.trades.slice(0, 10).map((t, i) => (
              <div key={i} className={`bt-trade ${t.side}`}>
                <span>{new Date(t.ts).toLocaleString()}</span>
                <b>{t.side.toUpperCase()}</b>
                <span>{t.qty.toFixed(2)} @ ${t.price.toFixed(2)}</span>
                {t.pnl != null && <span className={t.pnl >= 0 ? 'up' : 'down'}>{t.pnl >= 0 ? '+' : ''}{t.pnl.toFixed(2)}</span>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function EquityCurve({ data }: { data: { t: number; equity: number }[] }) {
  if (!data.length) return null
  const min = Math.min(...data.map((d) => d.equity))
  const max = Math.max(...data.map((d) => d.equity))
  const rng = max - min || 1
  const w = 480, h = 90
  const step = w / (data.length - 1)
  const pts = data.map((d, i) => `${(i * step).toFixed(1)},${(h - ((d.equity - min) / rng) * h).toFixed(1)}`).join(' ')
  const up = data[data.length - 1].equity >= data[0].equity
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ marginTop: 8 }}>
      <polyline points={pts} fill="none" stroke={up ? '#26a69a' : '#ef5350'} strokeWidth="1.5" />
      <polygon points={`${pts} ${w},${h} 0,${h}`} fill={up ? 'rgba(38,166,154,0.15)' : 'rgba(239,83,80,0.15)'} />
    </svg>
  )
}