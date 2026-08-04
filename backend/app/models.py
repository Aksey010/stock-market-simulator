from enum import Enum
from typing import Optional

from pydantic import BaseModel


class OrderSide(str, Enum):
    BUY = "buy"
    SELL = "sell"


class OrderType(str, Enum):
    MARKET = "market"
    LIMIT = "limit"
    STOP = "stop"
    STOP_LIMIT = "stop_limit"


class OrderStatus(str, Enum):
    OPEN = "open"
    FILLED = "filled"
    PARTIAL = "partial"
    CANCELLED = "cancelled"
    REJECTED = "rejected"
    EXPIRED = "expired"


class SymbolInfo(BaseModel):
    symbol: str
    name: str
    description: str
    sector: str
    volatility: float
    initial_price: float
    drift: float
    regime: str


class Candle(BaseModel):
    t: int
    o: float
    h: float
    l: float
    c: float
    v: float


class BarSeries(BaseModel):
    symbol: str
    timeframe: str
    values: list[Candle]


class OrderBookLevel(BaseModel):
    price: float
    size: float
    count: int


class OrderBook(BaseModel):
    symbol: str
    asks: list[OrderBookLevel]
    bids: list[OrderBookLevel]
    spread: float
    mid: float


class OrderRequest(BaseModel):
    symbol: str
    side: OrderSide
    qty: float
    type: OrderType = OrderType.MARKET
    price: Optional[float] = None
    stop_price: Optional[float] = None
    time_in_force: str = "gtc"


class Order(BaseModel):
    id: str
    symbol: str
    side: OrderSide
    type: OrderType
    qty: float
    filled_qty: float
    avg_price: Optional[float]
    price: Optional[float]
    stop_price: Optional[float]
    status: OrderStatus
    created_at: int
    filled_at: Optional[int] = None
    error: str = ""


class Position(BaseModel):
    symbol: str
    qty: float
    avg_cost: float
    realized_pnl: float = 0.0


class Portfolio(BaseModel):
    cash: float
    equity: float
    positions: list[Position]
    total_pnl: float
    unrealized_pnl: float
    account_value: float


class Trade(BaseModel):
    id: str
    order_id: str
    symbol: str
    side: OrderSide
    qty: float
    price: float
    ts: int
    pnl: Optional[float] = None


class BacktestConfig(BaseModel):
    symbol: str
    timeframe: str = "1d"
    strategy: str = "sma_cross"
    params: dict = {}
    initial_cash: float = 10000.0
    commission: float = 0.001


class BacktestResult(BaseModel):
    trades: list[Trade]
    equity_curve: list[dict]
    metrics: dict
    symbol: str


class Attribution(BaseModel):
    metric: str
    values: list[float]
    labels: list[dict]