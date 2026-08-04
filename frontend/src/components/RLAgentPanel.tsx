import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { RLResult, RLSignal } from '../types'

export function RLAgentPanel({ symbol, source }: { symbol: string; source: 'sim' | 'real' }) {
  const [timeframe, setTimeframe] = useState('1d')
  const [episodes, setEpisodes] = useState(120)
  const [jobId, setJobId] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('idle')
  const [result, setResult] = useState<RLResult | null>(null)
  const [signal, setSignal] = useState<RLSignal | null>(null)
  const [error, setError] = useState('')
  const pollRef = useRef<number | null>(null)

  const loadSignal = async () => {
    try {
      const s = await api.rlSignal(symbol, timeframe, source)
      setSignal(s)
    } catch { /* ignore */ }
  }

  useEffect(() => {
    setResult(null); setSignal(null); setJobId(null); setStatus('idle')
    loadSignal()
  }, [symbol, timeframe, source])

  useEffect(() => {
    const t = setInterval(loadSignal, 6000)
    return () => clearInterval(t)
  }, [symbol, timeframe, source])

  const train = async () => {
    setError(''); setResult(null); setStatus('training'); setProgress(0)
    try {
      const j = await api.rlTrain(symbol, timeframe, episodes, source)
      setJobId(j.job_id)
    } catch (e: any) {
      setError(e.message); setStatus('idle')
    }
  }

  // poll job
  useEffect(() => {
    if (!jobId) return
    const t = setInterval(async () => {
      try {
        const job = await api.rlJob(jobId!)
        setStatus(job.status)
        if (job.progress != null) setProgress(job.progress)
        if (job.status === 'done' && job.result) {
          setResult(job.result)
          setStatus('done')
          setJobId(null)
          clearInterval(t)
          loadSignal()
        } else if (job.status === 'error') {
          setError(job.error || 'training failed')
          setStatus('idle')
          setJobId(null)
          clearInterval(t)
        }
      } catch {
        /* retry */
      }
    }, 800)
    return () => clearInterval(t)
  }, [jobId])

  const sig = signal?.signal
  const sigCls = sig === 'buy' ? 'up' : sig === 'sell' ? 'down' : ''

  return (
    <div className="panel rl">
      <div className="panel-head">RL Trading Agent · {symbol} <span className="muted">(Q-learning)</span></div>

      <div className="rl-controls">
        <label className="fld">
          <span>Timeframe</span>
          <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
            {['1d', '1h', '4h', '15m', '5m'].map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label className="fld">
          <span>Episodes</span>
          <input type="number" min={20} max={1000} value={episodes} onChange={(e) => setEpisodes(parseInt(e.target.value) || 20)} />
        </label>
        <label className="fld">
          <span>Data source</span>
          <select value={source} disabled>
            <option value="sim">Simulated</option>
            <option value="real">Real (yfinance)</option>
          </select>
        </label>
        <button className="submit neutral" onClick={train} disabled={status === 'training'}>
          {status === 'training' ? `Training… ${Math.round(progress)}%` : 'Train'}
        </button>
      </div>

      {status === 'training' && (
        <div className="rl-progress">
          <div className="bar" style={{ width: `${progress}%` }} />
        </div>
      )}
      {error && <div className="order-msg">{error}</div>}

      <div className="rl-signal">
        <div className="signal-box">
          <span className="muted">Live signal</span>
          <b className={sigCls}>{signal ? signal.signal.toUpperCase() : '—'}</b>
          {signal && <span className="muted">conf {signal.confidence.toFixed(2)} · RSI {signal.rsi.toFixed(1)}</span>}
          {signal && !signal.trained && <span className="muted hint2">Untrained — train the agent to get signals</span>}
        </div>
        <div className="signal-box">
          <span className="muted">Price ({source})</span>
          <b>${signal ? signal.price.toFixed(2) : '—'}</b>
          <span className="muted">ROC {signal ? signal.roc.toFixed(2) : '—'}%</span>
        </div>
      </div>

      {result && (
        <>
          <div className="bt-metrics rl-metrics">
            {[
              ['Agent Return', `${result.return_pct.toFixed(2)}%`, result.return_pct >= 0],
              ['Buy&Hold', `${result.benchmark_return_pct.toFixed(2)}%`, result.benchmark_return_pct >= 0],
              ['Sharpe', result.sharpe.toFixed(2), result.sharpe >= 0],
              ['Volatility', `${result.volatility_pct.toFixed(2)}%`, true],
              ['Final Equity', `$${result.final_equity.toLocaleString()}`, true],
              ['Total Reward', result.total_reward.toFixed(0), result.total_reward >= 0],
            ].map(([k, v, up]) => (
              <div key={k as string} className="stat"><span>{k}</span><b className={up ? '' : 'down'}>{v}</b></div>
            ))}
          </div>
          <div className="rl-charts">
            <div className="rl-chart">
              <div className="mini-head">Equity curve (backtest)</div>
              <LineChart data={result.equity_curve} />
            </div>
            <div className="rl-chart">
              <div className="mini-head">Episode rewards</div>
              <Bars data={result.episode_rewards} />
            </div>
          </div>
          <div className="mini-head">Actions</div>
          <div className="rl-actions">
            <span className="hold">Hold {result.action_counts.HOLD}</span>
            <span className="up">Buy {result.action_counts.BUY}</span>
            <span className="down">Sell {result.action_counts.SELL}</span>
          </div>
        </>
      )}
    </div>
  )
}

function LineChart({ data }: { data: number[] }) {
  if (!data.length) return <div className="muted">—</div>
  const min = Math.min(...data), max = Math.max(...data), rng = max - min || 1
  const w = 300, h = 70, step = w / (data.length - 1)
  const pts = data.map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / rng) * h).toFixed(1)}`).join(' ')
  const up = data[data.length - 1] >= data[0]
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={up ? '#26a69a' : '#ef5350'} strokeWidth="1.5" />
      <polygon points={`${pts} ${w},${h} 0,${h}`} fill={up ? 'rgba(38,166,154,0.15)' : 'rgba(239,83,80,0.15)'} />
    </svg>
  )
}

function Bars({ data }: { data: number[] }) {
  if (!data.length) return <div className="muted">—</div>
  const w = 300, h = 70
  const maxAbs = Math.max(...data.map(Math.abs), 1)
  const bw = w / data.length
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {data.map((v, i) => (
        <rect key={i} x={i * bw + 1} width={Math.max(bw - 2, 0.5)} y={h / 2 - (Math.max(v, 0) / maxAbs) * (h / 2)} height={(Math.abs(v) / maxAbs) * (h / 2)} fill={v >= 0 ? '#26a69a' : '#ef5350'} />
      ))}
    </svg>
  )
}