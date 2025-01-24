import React, { useEffect, useRef, useState } from "react";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/tauri";
import { Group, Paper, SimpleGrid, Text } from "@mantine/core";
import { PnlCalendar } from "./pb/pnl_calendar";
import { OverallDayStats } from "./pb/overall_day_stats";

interface PnlDayProps {
    selectedOverallBatch: string;
    liveModeActive: boolean;
}

export function PnlDayChart({ selectedOverallBatch, liveModeActive }: PnlDayProps) {
    const chartRef = useRef<HTMLDivElement>(null);
    let [pnlCalendar, setPnlCalendar] = React.useState<PnlCalendar>();
    let currWins = useRef<number[]>([]);
    let currLosses = useRef<number[]>([]);

    const dayToIdxMap = new Map<string, number>([
        ["Sun", 0],
        ["Mon", 1],
        ["Tue", 2],
        ["Wed", 3],
        ["Thu", 4],
        ["Fri", 5],
        ["Sat", 6],
    ]);

    const options = {
        chart: {
            type: "column", // Set the chart type to "column"
            height: 375, // Set chart height in pixels
            width: 425, // Set chart width in pixels
        },
        title: {
            text: "Profit & Loss Day of Week", // Chart title
        },
        xAxis: {
            categories: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
            title: {
                text: "Days",
            },
        },
        yAxis: {
            title: {
                text: "Profit & Loss",
            },
        },
        series: [
            {
                name: "Profit", // Series name
                data: [], // Data for the series
            },
            {
                name: "Loss",
                data: [],
            },
        ],
        colors: ["#07d91f", "#d90707"],
    };

    // Define a dark theme
    const darkTheme = {
        chart: {
            backgroundColor: "#242424", // Dark background color
            style: {
                fontFamily: "'Roboto', sans-serif", // Font style
            },
        },
        title: {
            style: {
                color: "#FFFFFF", // Title text color
            },
        },
        subtitle: {
            style: {
                color: "#FFFFFF", // Subtitle text color
            },
        },
        xAxis: {
            gridLineColor: "#444444",
            labels: {
                style: {
                    color: "#FFFFFF", // X-axis label color
                },
            },
            lineColor: "#444444",
            title: {
                style: {
                    color: "#FFFFFF", // X-axis title color
                },
            },
        },
        yAxis: {
            gridLineColor: "#444444",
            labels: {
                style: {
                    color: "#FFFFFF", // Y-axis label color
                },
            },
            lineColor: "#444444",
            title: {
                style: {
                    color: "#FFFFFF", // Y-axis title color
                },
            },
        },
        tooltip: {
            backgroundColor: "#333333", // Tooltip background
            style: {
                color: "#FFFFFF", // Tooltip text color
            },
        },
        legend: {
            itemStyle: {
                color: "#FFFFFF", // Legend text color
            },
            itemHoverStyle: {
                color: "#CCCCCC", // Legend hover color
            },
        },
        plotOptions: {
            series: {
                dataLabels: {
                    color: "#FFFFFF", // Data labels color
                },
                marker: {
                    lineColor: "#333333", // Marker border color
                },
            },
        },
    };
    useEffect(() => {
        const calendar_unlisten = listen<PnlCalendar>("pnl_calendar", (event) => {
            setPnlCalendar(event.payload);
        });

        const overall_day_unlisten = listen<OverallDayStats>("overall_day_stats", (event) => {
            const chart = chartRef.current.chart;
            const winsSeries = chart.series[0];
            const lossesSeries = chart.series[1];
            let dayIdx = dayToIdxMap.get(event.payload.day);

            if (dayIdx !== undefined) {
                currWins.current[dayIdx] += event.payload.last_realized_pnl > 0 ? event.payload.last_realized_pnl : 0.0;
                currLosses.current[dayIdx] +=
                    event.payload.last_realized_pnl < 0 ? event.payload.last_realized_pnl : 0.0;

                winsSeries.setData(currWins.current);
                lossesSeries.setData(currLosses.current);
            }
        });

        if (selectedOverallBatch !== undefined && selectedOverallBatch.length > 0) {
            if (liveModeActive) {
                invoke("overall_request", { batchId: selectedOverallBatch });
            } else {
                invoke("overall_from_log_request", {
                    batchId: selectedOverallBatch,
                });
            }
        }

        return () => {
            calendar_unlisten.then((fn) => fn()); // Ensure proper cleanup of the listener
            overall_day_unlisten.then((fn) => fn()); // Ensure proper cleanup of the listener
        };
    }, []);

    useEffect(() => {
        let wins = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
        let losses = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];

        const chart = chartRef.current.chart;
        const winsSeries = chart.series[0];
        const lossesSeries = chart.series[1];

        if (pnlCalendar !== undefined) {
            for (const dayStats of Object.values(pnlCalendar.stats)) {
                let dayIdx = dayToIdxMap.get(dayStats.day)!;
                wins[dayIdx] += dayStats.total_realized_pnl > 0 ? dayStats.total_realized_pnl : 0.0;
                losses[dayIdx] += dayStats.total_realized_pnl < 0 ? dayStats.total_realized_pnl : 0.0;
            }
        }

        winsSeries.setData(wins);
        lossesSeries.setData(losses);

        currWins.current = [];
        for (let w of wins) {
            currWins.current.push(w);
        }

        currLosses.current = [];
        for (let l of losses) {
            currLosses.current.push(l);
        }
    }, [pnlCalendar]);

    Highcharts.setOptions(darkTheme);

    return (
        <Paper withBorder>
            <HighchartsReact highcharts={Highcharts} options={options} ref={chartRef} />
        </Paper>
    );
}
