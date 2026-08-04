import { useEffect, useState } from 'react'
import { api } from '../api'
import type { Order, OrderRequest, Portfolio, Trade } from '../types'

export function TradingPanel({ symbol, price }: { symbol: string; price: number | null }) {
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [type, setType] = useState<OrderRequest['type']>('market')
  const [qty, setQty] = useState(10)
  const [priceInput, setPriceInput] = useState('')
  const [stopInput, setStopInput] = useState('')
  const [msg, setMsg] = useState('')
  const [orders, setOrders] = useState<Order[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)

  useEffect(() => { api.portfolio().then(setPortfolio).catch(() => {}) }, [])
  useEffect(() => { refresh() }, [symbol])
  useEffect(() => {
    if (price) setPriceInput(price.toFixed(2))
  }, [price])

  const refresh = async () => {
    const [o, t, p] = await Promise.all([api.orders(), api.trades(), api.portfolio()])
    setOrders(o); setTrades(t); setPortfolio(p)
  }

  const submit = async () => {
    setMsg('')
    const req: OrderRequest = {
      symbol, side, qty,
      type,
      price: type === 'limit' || type === 'stop_limit' ? parseFloat(priceInput) || undefined : undefined,
      stop_price: type === 'stop' || type === 'stop_limit' ? parseFloat(stopInput) || undefined : undefined,
    }
    try {
      const o = await api.placeOrder(req)
      setMsg(o.status === 'filled' ? `FILLED @ ${o.avg_price}` : o.status === 'rejected' ? `REJECTED: ${o.error}` : `OPEN (${o.status})`)
      refresh()
    } catch (e: any) {
      setMsg(`ERROR: ${e.message}`)
    }
  }

  const cancel = async (id: string) => { await api.cancelOrder(id); refresh() }

  const pct = portfolio && price ? (portfolio.equity / portfolio.account_value - 1) * 100 : 0

  return (
    <div className="panel trading">
      <div className="panel-head">Trade · {symbol}</div>
      <div className="tt-buy-sell">
        <button className={side === 'buy' ? 'b-btn active' : 'b-btn'} onClick={() => setSide('buy')}>Buy</button>
        <button className={side === 'sell' ? 's-btn active' : 's-btn'} onClick={() => setSide('sell')}>Sell</button>
      </div>
      <label className="fld">
        <span>Order type</span>
        <select value={type} onChange={(e) => setType(e.target.value as OrderRequest['type'])}>
          <option value="market">Market</option>
          <option value="limit">Limit</option>
          <option value="stop">Stop</option>
          <option value="stop_limit">Stop-Limit</option>
        </select>
      </label>
      <label className="fld">
        <span>Quantity</span>
        <input type="number" min={1} value={qty} onChange={(e) => setQty(parseFloat(e.target.value) || 0)} />
      </label>
      {(type === 'limit' || type === 'stop_limit') && (
        <label className="fld">
          <span>Limit price</span>
          <input type="number" value={priceInput} onChange={(e) => setPriceInput(e.target.value)} />
        </label>
      )}
      {(type === 'stop' || type === 'stop_limit') && (
        <label className="fld">
          <span>Stop price</span>
          <input type="number" value={stopInput} onChange={(e) => setStopInput(e.target.value)} />
        </label>
      )}
      <div className="fld">
        <span>Est. value</span>
        <b>{(qty * (type === 'market' ? price || 0 : parseFloat(priceInput) || price || 0)).toFixed(2)}</b>
      </div>
      <button className={`submit ${side}`} onClick={submit}>
        {side === 'buy' ? 'Buy' : 'Sell'} {symbol}
      </button>
      {msg && <div className="order-msg">{msg}</div>}
      {portfolio && (
        <div className="port-mini">
          <div>Cash <b>${portfolio.cash.toLocaleString()}</b></div>
          <div>Equity <b>${portfolio.equity.toLocaleString()}</b> <span className={pct >= 0 ? 'up' : 'down'}>({pct.toFixed(2)}%)</span></div>
        </div>
      )}
      <div className="orders-mini">
        <div className="mini-head">Open orders</div>
        {orders.filter((o) => o.status === 'open').slice(0, 4).map((o) => (
          <div key={o.id} className="order-line">
            <span>{o.symbol} {o.side} {o.qty} @ {o.price ?? 'mkt'}</span>
            <button onClick={() => cancel(o.id)}>×</button>
          </div>
        ))}
        {!orders.some((o) => o.status === 'open') && <div className="muted">No open orders</div>}
      </div>
    </div>
  )
}
