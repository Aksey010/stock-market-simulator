import random
import threading
import time
import uuid
from typing import Optional

from .marketdata import make_state
from .models import (
    Order,
    OrderBook,
    OrderRequest,
    OrderSide,
    OrderStatus,
    OrderType,
    Portfolio,
    Position,
    Trade,
)

COMMISSION = 0.0005


class PaperTrader:
    def __init__(self, initial_cash: float = 100_000.0):
        self.cash = initial_cash
        self.initial_cash = initial_cash
        self.positions: dict[str, Position] = {}
        self.orders: dict[str, Order] = {}
        self.trades: list[Trade] = []
        self.price_fn = None
        self._lock = threading.Lock()

    def set_price_fn(self, fn):
        self.price_fn = fn

    def _price(self, symbol: str) -> Optional[float]:
        if self.price_fn:
            return self.price_fn(symbol)
        st = make_state(symbol)
        return st.price

    def place_order(self, req: OrderRequest) -> Order:
        with self._lock:
            price = self._price(req.symbol)
            if price is None:
                return Order(
                    id=uuid.uuid4().hex[:12], symbol=req.symbol, side=req.side, type=req.type,
                    qty=req.qty, filled_qty=0, avg_price=None, price=req.price, stop_price=req.stop_price,
                    status=OrderStatus.REJECTED, created_at=int(time.time() * 1000), error="no price",
                )
            oid = uuid.uuid4().hex[:12]
            created = int(time.time() * 1000)

            if req.type in (OrderType.LIMIT, OrderType.STOP_LIMIT):
                if not req.price or req.price <= 0:
                    return self._reject(req, oid, created, "limit price required")
                fillable = (req.side == OrderSide.BUY and price <= req.price) or (
                    req.side == OrderSide.SELL and price >= req.price
                )
            elif req.type == OrderType.STOP:
                if not req.stop_price or req.stop_price <= 0:
                    return self._reject(req, oid, created, "stop price required")
                fillable = (req.side == OrderSide.SELL and price <= req.stop_price) or (
                    req.side == OrderSide.BUY and price >= req.stop_price
                )
            else:
                fillable = True

            if not fillable:
                order = Order(
                    id=oid, symbol=req.symbol, side=req.side, type=req.type, qty=req.qty,
                    filled_qty=0, avg_price=None, price=req.price, stop_price=req.stop_price,
                    status=OrderStatus.OPEN, created_at=created,
                )
                self.orders[oid] = order
                return order

            return self._execute(req, oid, created, price)

    def _reject(self, req: OrderRequest, oid: str, created: int, err: str) -> Order:
        order = Order(
            id=oid, symbol=req.symbol, side=req.side, type=req.type, qty=req.qty,
            filled_qty=0, avg_price=None, price=req.price, stop_price=req.stop_price,
            status=OrderStatus.REJECTED, created_at=created, error=err,
        )
        self.orders[oid] = order
        return order

    def _execute(self, req: OrderRequest, oid: str, created: int, price: float) -> Order:
        filled_qty = req.qty
        cost = filled_qty * price
        fee = cost * COMMISSION
        if req.side == OrderSide.BUY:
            if cost + fee > self.cash + 1e-9:
                order = self._reject(req, oid, created, "insufficient funds")
                return order
            self.cash -= cost + fee
            pos = self.positions.setdefault(
                req.symbol,
                Position(symbol=req.symbol, qty=0.0, avg_cost=0.0, realized_pnl=0.0),
            )
            new_qty = pos.qty + filled_qty
            pos.avg_cost = (pos.avg_cost * pos.qty + cost) / new_qty if new_qty else 0.0
            pos.qty = new_qty
            pnl = None
        else:
            pos = self.positions.get(req.symbol)
            if not pos or pos.qty < filled_qty - 1e-9:
                return self._reject(req, oid, created, "insufficient shares")
            pos.qty -= filled_qty
            pnl = (price - pos.avg_cost) * filled_qty - fee
            pos.realized_pnl += pnl
            if pos.qty < 1e-9:
                self.positions.pop(req.symbol, None)
            self.cash += cost - fee

        order = Order(
            id=oid, symbol=req.symbol, side=req.side, type=req.type, qty=req.qty,
            filled_qty=filled_qty, avg_price=round(price, 4), price=req.price,
            stop_price=req.stop_price, status=OrderStatus.FILLED, created_at=created,
            filled_at=int(time.time() * 1000),
        )
        self.orders[oid] = order
        self.trades.append(
            Trade(
                id=uuid.uuid4().hex[:12], order_id=oid, symbol=req.symbol, side=req.side,
                qty=filled_qty, price=round(price, 4), ts=created, pnl=round(pnl, 4) if pnl is not None else None,
            )
        )
        return order

    def cancel_order(self, order_id: str) -> Order:
        with self._lock:
            order = self.orders.get(order_id)
            if order and order.status == OrderStatus.OPEN:
                order.status = OrderStatus.CANCELLED
            return order

    def get_orders(self, symbol: Optional[str] = None, status: Optional[str] = None) -> list[Order]:
        out = []
        for o in self.orders.values():
            if symbol and o.symbol != symbol:
                continue
            if status and o.status.value != status:
                continue
            out.append(o)
        return sorted(out, key=lambda o: o.created_at, reverse=True)

    def portfolio(self) -> Portfolio:
        with self._lock:
            unrealized = 0.0
            market_value = 0.0
            positions = []
            for sym, pos in self.positions.items():
                price = self._price(sym)
                if price is None:
                    price = pos.avg_cost
                unrealized += (price - pos.avg_cost) * pos.qty
                market_value += price * pos.qty
                positions.append(
                    Position(
                        symbol=sym, qty=round(pos.qty, 6), avg_cost=round(pos.avg_cost, 4),
                        realized_pnl=round(pos.realized_pnl, 4),
                    )
                )
            realized = sum(p.realized_pnl for p in self.positions.values())
            equity = self.cash + market_value
            return Portfolio(
                cash=round(self.cash, 2),
                equity=round(equity, 2),
                positions=positions,
                total_pnl=round(equity - self.initial_cash, 2),
                unrealized_pnl=round(unrealized, 2),
                account_value=round(equity, 2),
            )

    def recent_trades(self, limit: int = 50) -> list[Trade]:
        return sorted(self.trades, key=lambda t: t.ts, reverse=True)[:limit]

    def equity_history(self, history: list[dict], max_len: int = 500) -> list[dict]:
        history.append({"t": int(time.time() * 1000), "equity": self.portfolio().equity})
        return history[-max_len:]


_default = PaperTrader()


def get_default_trader() -> PaperTrader:
    return _default
