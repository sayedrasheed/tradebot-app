import { ISeriesApi, Time } from "lightweight-charts";

interface SelectedStrategy {
    batchId: string;
    strategyId: string;
}

interface Batch {
    batchId: string;
    strategies: Map<string, Strategy>;
}

interface Strategy {
    strategyId: string;
    symbolPeriods: Map<string, number[]>;
}

interface StrategyNavEntry {
    batchId: string;
    nextStrategy: string;
    prevStrategy: string;
}

interface LineVal {
    value: number;
    color: string;
    description: string;
}
interface Legend {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    lines: Array<LineVal>;
}

interface StatsType {
    total_realized_pnl: number;
    win_rate: number;
    num_wins: number;
    num_losses: number;
    max_drawdown: number;
    max_drawup: number;
    avg_win: number;
    avg_loss: number;
}

interface OrderTableEntry {
    count: number;
    id: string;
    timestamp_ns: number;
    dt: string;
    side: string;
    amount: string;
    status: string;
    price: string;
    fill_price: string;
    realized: string;
}

export type { SelectedStrategy };
export type { Batch };
export type { Strategy };
export type { StrategyNavEntry };
export type { Legend };
export type { LineVal };
export type { StatsType };
export type { OrderTableEntry };
