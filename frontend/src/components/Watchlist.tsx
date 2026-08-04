import { useState } from 'react'
import type { Quote, SymbolInfo } from '../types'

interface Props {
  symbols: SymbolInfo[]
  quotes: Record<string, Quote>
  selected: string
  onSelect: (s: string) => void
}

export function Watchlist({ symbols, quotes, selected, onSelect }: Props) {
  const [filter, setFilter] = useState('')
  const filtered = symbols.filter(
    (s) => s.symbol.toLowerCase().includes(filter.toLowerCase()) || s.sector.toLowerCase().includes(filter.toLowerCase()),
  )
  return (
    <div className="watchlist">
      <div className="panel-head">Watchlist</div>
      <input className="wl-filter" placeholder="Filter symbols / sector…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <div className="wl-list">
        {filtered.map((s) => {
          const q = quotes[s.symbol]
          const up = (q?.change_pct ?? 0) >= 0
          return (
            <button key={s.symbol} className={`wl-row ${selected === s.symbol ? 'active' : ''}`} onClick={() => onSelect(s.symbol)}>
              <span className="wl-sym">{s.symbol}</span>
              <span className="wl-name">{s.sector}</span>
              <span className="wl-price">{q ? q.price.toFixed(2) : '—'}</span>
              <span className={`wl-chg ${up ? 'up' : 'down'}`}>{q ? `${up ? '+' : ''}${q.change_pct.toFixed(2)}%` : ''}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
