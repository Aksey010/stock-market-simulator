import type { Quote } from '../types'

export function TickerTape({ quotes, onSelect }: { quotes: Quote[]; onSelect: (s: string) => void }) {
  const items = [...quotes, ...quotes]
  return (
    <div className="ticker">
      <div className="ticker-track">
        {items.map((q, i) => {
          const up = q.change_pct >= 0
          return (
            <button key={`${q.symbol}-${i}`} className="ticker-item" onClick={() => onSelect(q.symbol)}>
              <span className="ticker-sym">{q.symbol}</span>
              <span className="ticker-price">{q.price.toFixed(2)}</span>
              <span className={up ? 'up' : 'down'}>{up ? '+' : ''}{q.change_pct.toFixed(2)}%</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
