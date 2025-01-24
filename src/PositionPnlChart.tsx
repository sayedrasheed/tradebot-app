import React, { useEffect, useRef, useState } from "react";
import { ColorType, createChart, CrosshairMode, IChartApi, ISeriesApi, Time, UTCTimestamp } from "lightweight-charts";
import { Flex, Paper } from "@mantine/core";

import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/tauri";
import { SelectedStrategy } from "./types";
import { PositionPnlRealized } from "./pb/pos_pnl_realized";
import { PositionPnlUnrealized } from "./pb/pos_pnl_unrealized";

interface PositionPnlChartProps {
    selectedStrategy: SelectedStrategy,
}

export function PositionPnlChart({ selectedStrategy }: PositionPnlChartProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chart = useRef<IChartApi>(undefined);
    let lineSeries = useRef<ISeriesApi<"Baseline", Time>>(undefined);
    let currIdx = 0;
    let positions = useRef(new Set());
    let [pnl, setPnl] = useState<number>(0.0);

    useEffect(() => {
        const realized_unlisten = listen<PositionPnlRealized>("pos_pnl_realized", (event) => {
            setPnl(0.0);
            positions.current.add(event.payload.position_id);
            currIdx += 1;

            if (lineSeries.current !== undefined) {
                lineSeries.current.update({ time: currIdx as UTCTimestamp, value: 0 });
            }
        });

        const unrealized_unlisten = listen<PositionPnlUnrealized>("pos_pnl_unrealized", (event) => {
            if (lineSeries.current !== undefined) {
                if (positions.current.has(event.payload.position_id) === false) {
                    currIdx += 1;
                    lineSeries.current.update({ time: currIdx as UTCTimestamp, value: event.payload.value!.value });
                    setPnl(Number(event.payload.value!.value.toFixed(2)));
                }
            }
        });

        return () => {
            positions.current = new Set();
            realized_unlisten.then((fn) => fn()); // Ensure proper cleanup of the listener
            unrealized_unlisten.then((fn) => fn()); // Ensure proper cleanup of the listener
        };
    }, []);

    useEffect(() => {
        if (selectedStrategy.batchId.length > 0 && selectedStrategy.strategyId.length > 0) {
            if (chart.current == undefined && chartContainerRef.current !== null) {
                chart.current = createChart(chartContainerRef.current, {
                    width: chartContainerRef.current.clientWidth,
                    height: 500, //"300px", //chartContainerRef.current.clientHeight,
                    layout: {
                        background: { type: ColorType.Solid, color: "transparent" },
                        textColor: "white",
                    },
                    grid: {
                        vertLines: {
                            visible: false,
                        },
                        horzLines: {
                            color: "#707070",
                        },
                    },
                    crosshair: {
                        mode: CrosshairMode.Normal,
                    },
                    localization: {
                        timeFormatter: (time: Time) => {
                            return time.toString();
                        },
                    },
                    // priceScale: {
                    //     borderColor: "#485c7b",
                    // },
                    timeScale: {
                        barSpacing: 0.5,
                        borderColor: "#485c7b",
                        timeVisible: true,
                        tickMarkFormatter: (time: Time) => {
                            return time.toString();
                        },
                        fixRightEdge: true,
                    },
                    autoSize: true,
                });

                lineSeries.current = chart.current.addBaselineSeries({
                    baseValue: { type: "price", price: 0 },
                    topLineColor: "rgba( 38, 166, 154, 1)",
                    topFillColor1: "rgba( 38, 166, 154, 0.28)",
                    topFillColor2: "rgba( 38, 166, 154, 0.05)",
                    bottomLineColor: "rgba( 239, 83, 80, 1)",
                    bottomFillColor1: "rgba( 239, 83, 80, 0.05)",
                    bottomFillColor2: "rgba( 239, 83, 80, 0.28)",
                });
            }
        } else {
            if (chart.current !== undefined) {
                chart.current.remove();
                chart.current = undefined;
                lineSeries.current = undefined;
            }
        }

        setPnl(0.0);
        currIdx = 0;
        positions.current = new Set();
    }, [selectedStrategy]);

    return (
        <Flex direction="column">
            <Paper withBorder>
                <h3 style={{ lineHeight: "2px", marginBottom: "8px", textAlign: "center" }}>
                    Current Position Profit & Loss
                </h3>
                <div style={{ color: pnl >= 0.0 ? "green" : "red", fontSize: 20, textAlign: "center" }}>
                    {pnl >= 0.0 ? "+" : "-"}
                    {pnl}
                </div>
                <div>
                    <div
                        ref={chartContainerRef}
                        className="chart-container"
                        style={{ height: "300px", width: "350px", paddingRight: "20px", paddingBottom: "10px" }}
                    />
                </div>
            </Paper>
        </Flex>
    );
}
