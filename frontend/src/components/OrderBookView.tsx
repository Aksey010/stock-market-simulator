export function OrderBookView({ book }: {
  book: { symbol: string; asks: { price: number; size: number; count?: number }[]; bids: { price: number; size: number; count?: number }[] } | null
}) {
  if (!book) return <div className="panel">Order book…</div>
  const mid = book.bids.length && book.asks.length ? (book.bids[0].price + book.asks[0].price) / 2 : 0
  const spread = book.bids.length && book.asks.length ? book.asks[0].price - book.bids[0].price : 0
  const maxSize = Math.max(...book.asks.map((a) => a.size), ...book.bids.map((b) => b.size), 1)
  return (
    <div className="panel orderbook">
      <div className="panel-head">Order Book · {book.symbol}</div>
      <div className="ob-row ob-head">
        <span>Price</span><span>Size</span><span>Count</span>
      </div>
      <div className="ob-asks">
        {book.asks.map((a) => (
          <div className="ob-row" key={`a${a.price}`}>
            <span className="down">{a.price.toFixed(2)}</span>
            <span>{a.size.toLocaleString()}</span>
            <span>{a.count}</span>
            <span className="ob-bar" style={{ width: `${(a.size / maxSize) * 100}%`, right: 0 }} />
          </div>
        ))}
      </div>
      <div className="ob-mid">
        Mid <b>{mid.toFixed(2)}</b> · Spread <b>{spread.toFixed(2)}</b>
      </div>
      <div className="ob-bids">
        {book.bids.map((b) => (
          <div className="ob-row" key={`b${b.price}`}>
            <span className="up">{b.price.toFixed(2)}</span>
            <span>{b.size.toLocaleString()}</span>
            <span>{b.count}</span>
            <span className="ob-bar" style={{ width: `${(b.size / maxSize) * 100}%`, left: 0 }} />
          </div>
        ))}
      </div>
    </div>
  )
}
