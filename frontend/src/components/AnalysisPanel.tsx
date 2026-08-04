import { useEffect, useState } from 'react'
import { api } from '../api'
import type { Analysis, SymbolInfo } from '../types'

export function AnalysisPanel({ symbol, symbols, allSymbols, source }: { symbol: string; symbols: SymbolInfo[]; allSymbols: string[]; source?: 'sim' | 'real' }) {
  const [an, setAn] = useState<Analysis | null>(null)
  const [corr, setCorr] = useState<{ symbols: string[]; corr: number[][] } | null>(null)
  const [risk, setRisk] = useState<Record<string, unknown> | null>(null)
  const [insights, setInsights] = useState<string[]>([])
  const [corrSymbols, setCorrSymbols] = useState(allSymbols.slice(0, 6))

  useEffect(() => {
    api.analysis(symbol, '5m', source || 'sim').then(setAn).catch(() => setAn(null))
  }, [symbol, source])

  useEffect(() => {
    api.correlations(corrSymbols).then((r) => setCorr(r.correlation)).catch(() => setCorr(null))
    api.portfolioRisk(corrSymbols).then(setRisk).catch(() => setRisk(null))
    api.insights(corrSymbols).then((r) => setInsights(r.insights)).catch(() => setInsights([]))
  }, [corrSymbols.join(',')])

  const toggle = (s: string) => {
    setCorrSymbols((prev) => {
      const has = prev.includes(s)
      return has ? prev.filter((x) => x !== s) : [...prev, s]
    })
  }

  const riskRecord = (risk as { expected_return_pct?: number; volatility_pct?: number; sharpe?: number } | null) || {}

  return (
    <div className="analysis">
      <div className="panel an-stat">
        <div className="panel-head">Quant Stats · {symbol}</div>
        {an ? (
          <div className="stat-grid">
            {Object.entries({
              Price: an.stats.current, 'Mean Return %': an.stats.mean_return, 'Std %': an.stats.std_return,
              'Ann. Volatility %': an.stats.annualized_volatility, 'Sharpe': an.stats.sharpe,
              'VaR 95%': an.stats.var_95, 'VaR 99%': an.stats.var_99, 'Max Drawdown %': an.stats.max_drawdown,
              'Hit Rate %': an.stats.hit_rate, 'Skewness': an.stats.skewness, 'Kurtosis': an.stats.kurtosis,
              'Worst Day %': an.stats.worst_day, 'Best Day %': an.stats.best_day,
            }).map(([k, v]) => (
              <div key={k} className="stat"><span>{k}</span><b>{typeof v === 'number' ? v.toFixed(2) : v}</b></div>
            ))}
          </div>
        ) : <div className="muted">loading…</div>}
      </div>

      <div className="panel an-regime">
        <div className="panel-head">Market Regime</div>
        {an && (
          <>
            <div className="regime-tag">{an.regime.regime}</div>
            <div className="mini-grid">
              <div className="stat"><span>Trend (ann.)</span><b>{an.regime.trend_annualized_pct.toFixed(2)}%</b></div>
              <div className="stat"><span>Volatility (ann.)</span><b>{an.regime.volatility_annualized_pct.toFixed(2)}%</b></div>
            </div>
            <div className="tech-summary">
              <div>RSI(14) <b className={an.technical.rsi > 70 ? 'down' : an.technical.rsi < 30 ? 'up' : ''}>{an.technical.rsi.toFixed(1)}</b></div>
              <div>Trend <b>{an.technical.trend}</b></div>
              <div>Suggested <b className={an.technical.suggested === 'buy' ? 'up' : an.technical.suggested === 'sell' ? 'down' : ''}>{an.technical.suggested.toUpperCase()}</b></div>
            </div>
            {an.technical.signals.map((s) => <div key={s} className="signal">◈ {s}</div>)}
          </>
        )}
        <div className="panel-head sub">30-step forecast</div>
        {an && <Spark data={an.forecast} />}
      </div>

      <div className="panel an-corr">
        <div className="panel-head">Correlation Matrix</div>
        <div className="corr-symbols">
          {allSymbols.slice(0, 12).map((s) => (
            <button key={s} className={`chip ${corrSymbols.includes(s) ? 'on' : ''}`} onClick={() => toggle(s)}>{s}</button>
          ))}
        </div>
        {corr && (
          <table className="corr-table">
            <thead><tr><th>ρ</th>{corr.symbols.map((s) => <th key={s}>{s}</th>)}</tr></thead>
            <tbody>
              {corr.corr.map((row, i) => (
                <tr key={i}>
                  <td><b>{corr.symbols[i]}</b></td>
                  {row.map((v, j) => (
                    <td key={j} style={{ background: cellColor(v), color: Math.abs(v) > 0.6 ? '#fff' : '#c8d0dc' }}>{v.toFixed(2)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel an-risk">
        <div className="panel-head">Portfolio Risk Analysis</div>
        {risk && (
          <div className="stat-grid two">
            <div className="stat"><span>Exp. Return %</span><b>{riskRecord.expected_return_pct?.toFixed(2)}</b></div>
            <div className="stat"><span>Portfolio Vol %</span><b>{riskRecord.volatility_pct?.toFixed(2)}</b></div>
            <div className="stat"><span>Sharpe</span><b>{riskRecord.sharpe?.toFixed(2)}</b></div>
          </div>
        )}
        <div className="panel-head sub">Heuristic Insights</div>
        {insights.map((t, i) => <div key={i} className="insight">• {t}</div>)}
        <div className="muted hint">Sector info: {symbols.find((s) => s.symbol === symbol)?.sector}</div>
      </div>
    </div>
  )
}

function cellColor(v: number): string {
  const a = Math.min(Math.abs(v), 1)
  if (v >= 0) return `rgba(38,166,154,${(a * 0.85 + 0.1).toFixed(2)})`
  return `rgba(239,83,80,${(a * 0.85 + 0.1).toFixed(2)})`
}

function Spark({ data }: { data: number[] }) {
  const min = Math.min(...data), max = Math.max(...data), rng = max - min || 1
  const w = 240, h = 60, step = w / (data.length - 1)
  const pts = data.map((v, i) => `${(i * step).toFixed(0)},${(h - ((v - min) / rng) * h).toFixed(1)}`).join(' ')
  const up = data[data.length - 1] >= data[0]
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={up ? '#26a69a' : '#ef5350'} strokeWidth="1.5" />
      <polygon points={`${pts} ${w},${h} 0,${h}`} fill={up ? 'rgba(38,166,154,0.15)' : 'rgba(239,83,80,0.15)'} />
    </svg>
  )
}