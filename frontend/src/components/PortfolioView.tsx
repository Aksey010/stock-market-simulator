import { useEffect, useState } from 'react'
import { api } from '../api'
import type { Portfolio } from '../types'

export function PortfolioView({ prices }: { prices: Record<string, number> }) {
  const [p, setP] = useState<Portfolio | null>(null)
  const [hist, setHist] = useState<{ t: number; equity: number }[]>([])
  useEffect(() => {
    api.portfolio().then(setP).catch(() => {})
    api.equityHistory().then((h) => setHist(h.points)).catch(() => {})
  }, [])
  useEffect(() => { api.portfolio().then(setP).catch(() => {}) }, [prices])

  if (!p) return <div className="panel">Portfolio…</div>
  const alloc = p.positions.map((pos) => pos.qty * (prices[pos.symbol] ?? pos.avg_cost))
  const totalAlloc = alloc.reduce((a, b) => a + b, 0) || 1

  return (
    <div className="panel portfolio">
      <div className="panel-head">Portfolio</div>
      <div className="p-summary">
        <div><span>Account value</span><b>${p.account_value.toLocaleString()}</b></div>
        <div><span>Cash</span><b>${p.cash.toLocaleString()}</b></div>
        <div><span>Total P&L</span><b className={p.total_pnl >= 0 ? 'up' : 'down'}>${p.total_pnl >= 0 ? '+' : ''}{p.total_pnl.toLocaleString()}</b></div>
        <div><span>Unrealized</span><b className={p.unrealized_pnl >= 0 ? 'up' : 'down'}>${p.unrealized_pnl >= 0 ? '+' : ''}{p.unrealized_pnl.toLocaleString()}</b></div>
      </div>
      <div className="p-chart">
        {p.positions.map((pos) => {
          const v = pos.qty * (prices[pos.symbol] ?? pos.avg_cost)
          const wt = (v / totalAlloc) * 100
          return <div key={pos.symbol} className="alloc-bar" style={{ width: `${wt}%` }} title={`${pos.symbol} ${wt.toFixed(1)}%`} />
        })}
      </div>
      <table className="p-table">
        <thead><tr><th>Symbol</th><th>Qty</th><th>Avg</th><th>Val</th><th>R P&L</th></tr></thead>
        <tbody>
          {p.positions.map((pos) => (
            <tr key={pos.symbol}>
              <td><b>{pos.symbol}</b></td>
              <td>{pos.qty}</td>
              <td>${pos.avg_cost.toFixed(2)}</td>
              <td>${(pos.qty * (prices[pos.symbol] ?? pos.avg_cost)).toFixed(2)}</td>
              <td className={pos.realized_pnl >= 0 ? 'up' : 'down'}>{pos.realized_pnl.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="eq-title">Equity history</div>
      <Sparkline data={hist.map((h) => h.equity)} up={hist.length > 1 && hist[hist.length - 1].equity >= hist[0].equity} />
    </div>
  )
}

function Sparkline({ data, up }: { data: number[]; up: boolean }) {
  if (!data.length) return <div className="muted">No data yet</div>
  const min = Math.min(...data); const max = Math.max(...data); const rng = max - min || 1
  const w = 240, h = 60
  const step = w / (data.length - 1)
  const pts = data.map((v, i) => `${(i * step).toFixed(0)},${(h - ((v - min) / rng) * h).toFixed(1)}`).join(' ')
  const color = up ? '#26a69a' : '#ef5350'
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="spark">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" />
      <polygon points={`${pts} ${w},${h} 0,${h}`} fill={up ? 'rgba(38,166,154,0.15)' : 'rgba(239,83,80,0.15)'} />
    </svg>
  )
}