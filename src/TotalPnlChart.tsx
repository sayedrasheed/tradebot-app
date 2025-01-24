import React, { useEffect, useRef, useState } from "react";
import { ColorType, createChart, CrosshairMode, IChartApi, ISeriesApi, LineData, Time, UTCTimestamp } from "lightweight-charts";
import { Flex, Paper } from "@mantine/core";

import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/tauri";
import { SelectedStrategy } from "./types";
import { TotalPnl } from "./pb/total_pnl";
import { TotalPnlRealized } from "./pb/total_pnl_realized";
import { TotalPnlUnrealized } from "./pb/total_pnl_unrealized";

interface TotalPnlChartProps {
    selectedStrategy: SelectedStrategy,
}

export function TotalPnlChart({ selectedStrategy }: TotalPnlChartProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chart = useRef<IChartApi>(undefined);
    let lineSeries = useRef<ISeriesApi<"Baseline", Time>>(undefined);
    let pointIdx = 1;
    let closedPositions = useRef(new Set());
    let [pnl, setPnl] = useState<number>(0.0);

    useEffect(() => {
        const total_pnl_unlisten = listen<TotalPnl>("total_pnl", (event) => {
            let lineSeriesData: LineData<Time>[] = [{ time: 0 as UTCTimestamp, value: 0 }];
            for (let i = 0; i < event.payload.points.length; i++) {
                lineSeriesData.push({
                    value: event.payload.points[i].value,
                    time: i + 1 as UTCTimestamp,
                });
            }

            pointIdx = event.payload.points.length + 1;

            if (lineSeries.current !== undefined) {
                lineSeries.current.setData(lineSeriesData);
                setPnl(Number(lineSeriesData[pointIdx - 1].value.toFixed(2)));
            }
        });

        const realized_unlisten = listen<TotalPnlRealized>("total_pnl_realized", (event) => {
            if (chart.current !== undefined && lineSeries.current !== undefined) {
                lineSeries.current.update({ time: pointIdx as UTCTimestamp, value: event.payload.value!.value });
                pointIdx += 1;
                setPnl(Number(event.payload.value!.value.toFixed(2)));

                closedPositions.current.add(event.payload.position_id);
                chart.current.timeScale().fitContent();
            }
        });

        const unrealized_unlisten = listen<TotalPnlUnrealized>("total_pnl_unrealized", (event) => {
            if (chart.current !== undefined && lineSeries.current !== undefined) {
                if (!closedPositions.current.has(event.payload.position_id)) {
                    lineSeries.current.update({ time: pointIdx as UTCTimestamp, value: event.payload.value!.value });
                    setPnl(Number(event.payload.value!.value.toFixed(2)));
                }
            }
        });

        return () => {
            total_pnl_unlisten.then((fn) => fn()); // Ensure proper cleanup of the listener
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
                        borderColor: "#485c7b",
                        timeVisible: true,
                        tickMarkFormatter: (time: Time) => {
                            return time.toString();
                        },
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

                lineSeries.current.update({ time: 0 as UTCTimestamp, value: 0.0 });
            }
        } else {
            if (chart.current !== undefined) {
                chart.current.remove();
                chart.current = undefined;
                lineSeries.current = undefined;
            }

            setPnl(0.0);
            pointIdx = 1;
            closedPositions.current = new Set();
        }
    }, [selectedStrategy]);

    return (
        <Flex direction="column">
            <Paper withBorder>
                <h3 style={{ lineHeight: "2px", marginBottom: "8px", textAlign: "center" }}>Total Profit & Loss</h3>
                <div style={{ color: pnl >= 0.0 ? "green" : "red", fontSize: 20, textAlign: "center" }}>
                    {pnl >= 0.0 ? "+" : ""}
                    {pnl}
                </div>
                <div>
                    <div
                        ref={chartContainerRef}
                        className="chart-container"
                        style={{ height: "306px", width: "350px", paddingRight: "20px", paddingBottom: "10px" }}
                    />
                </div>
            </Paper>
        </Flex>
    );
}
