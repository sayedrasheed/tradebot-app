import React, { useEffect, useRef, useState } from "react";
import { BaselineData, ColorType, createChart, CrosshairMode, IChartApi, ISeriesApi, Time, UTCTimestamp } from "lightweight-charts";
import { Flex, Paper, Title } from "@mantine/core";

import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/tauri";
import { PnlCalendar } from "./pb/pnl_calendar";
import { OverallDayStats } from "./pb/overall_day_stats";

interface OverallPnlChartProps {
    selectedOverallBatch: string,
}

export function OverallPnlChart({ selectedOverallBatch }: OverallPnlChartProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chart = useRef<IChartApi>(undefined);
    let lineSeries = useRef<ISeriesApi<"Baseline", Time>>(undefined);
    let [pnlCalendar, setPnlCalendar] = React.useState<PnlCalendar>();
    let currentCalendar = useRef<PnlCalendar>(undefined);

    useEffect(() => {
        const calendar_unlisten = listen<PnlCalendar>("pnl_calendar", (event) => {
            setPnlCalendar(event.payload);
        });

        const overall_day_unlisten = listen<OverallDayStats>("overall_day_stats", (event) => {
            if (currentCalendar.current !== undefined) {
                let dateStr = event.payload.date;

                let newCalendar = { ...currentCalendar.current };
                newCalendar.stats[dateStr] = event.payload;
                setPnlCalendar(newCalendar);
            }
        });

        return () => {
            calendar_unlisten.then((fn) => fn()); // Ensure proper cleanup of the listener
            overall_day_unlisten.then((fn) => fn()); // Ensure proper cleanup of the listener
        };
    }, []);

    useEffect(() => {
        if (pnlCalendar !== undefined) {
            let lineSeriesData: BaselineData[] = [];
            let totalRealizedPnl = 0.0;
            for (const dayStats of Object.values(pnlCalendar.stats)) {
                totalRealizedPnl += dayStats.total_realized_pnl;
                lineSeriesData.push({
                    value: totalRealizedPnl,
                    time: dayStats.day_timestamp_ns / 1000000000 as UTCTimestamp,
                });
            }

            if (chart.current !== undefined && lineSeries.current !== undefined) {
                lineSeries.current.setData(lineSeriesData);
                chart.current.timeScale().fitContent();
            }

            currentCalendar.current = { ...pnlCalendar };
        }
    }, [pnlCalendar]);

    useEffect(() => {
        if (selectedOverallBatch !== undefined && selectedOverallBatch.length > 0) {
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
                    timeScale: {
                        borderColor: "#485c7b",
                        timeVisible: true,
                        barSpacing: 12,
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
    }, [selectedOverallBatch]);

    return (
        <Flex direction="row">
            <Paper withBorder style={{ paddingRight: "20px", paddingBottom: "10px" }}>
                <div>
                    <Title order={3} style={{ paddingLeft: "15px" }}>
                        Total Profit & Loss
                    </Title>
                    <div
                        ref={chartContainerRef}
                        className="chart-container"
                        style={{ height: "306px", width: "1360px", paddingRight: "20px", paddingBottom: "10px" }}
                    />
                </div>
            </Paper>
        </Flex>
    );
}
