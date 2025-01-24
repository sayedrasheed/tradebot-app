import React, { useEffect, useRef, useState } from "react";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/tauri";
import { Group, Paper, SimpleGrid, Text } from "@mantine/core";
import { PnlHour } from "./pb/pnl_hour";
import { OverallDayStats } from "./pb/overall_day_stats";

interface PnlTimeProps {
    selectedOverallBatch: string;
    liveModeActive: boolean;
}

export function PnlTimeChart({ selectedOverallBatch, liveModeActive }: PnlTimeProps) {
    const chartRef = useRef<HTMLDivElement>(null);
    let currPnlHourChart = useRef<PnlHour>(undefined);
    let [pnlHour, setPnlHour] = React.useState<PnlHour | undefined>(undefined);

    const options = {
        chart: {
            type: "column", // Set the chart type to "column"
            height: 375, // Set chart height in pixels
            width: 425, // Set chart width in pixels
        },
        title: {
            text: "Profit & Loss Hour of Day",
        },
        xAxis: {
            categories: [
                "0:00",
                "1:00",
                "2:00",
                "3:00",
                "4:00",
                "5:00",
                "6:00",
                "7:00",
                "8:00",
                "9:00",
                "10:00",
                "11:00",
                "12:00",
                "13:00",
                "14:00",
                "15:00",
                "16:00",
                "17:00",
                "18:00",
                "19:00",
                "20:00",
                "21:00",
                "22:00",
                "23:00",
                "24:00",
            ],
            title: {
                text: "Hour",
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
        const calendar_unlisten = listen<PnlHour>("pnl_hour", (event) => {
            console.log(event.payload);
            setPnlHour(event.payload);
        });

        const overall_day_unlisten = listen<OverallDayStats>("overall_day_stats", (event) => {
            if (currPnlHourChart.current !== undefined) {
                let hour = event.payload.position_hour;
                let newPnlHour = { ...currPnlHourChart.current };

                if (newPnlHour.stats !== undefined) {
                    newPnlHour.stats[hour].total_realized_pnl += event.payload.last_realized_pnl;
                    setPnlHour(newPnlHour);
                }
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
        let wins = [
            0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
            0.0, 0.0, 0.0, 0.0, 0.0,
        ];
        let losses = [
            0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
            0.0, 0.0, 0.0, 0.0, 0.0,
        ];
        if (chartRef.current !== null && pnlHour !== undefined) {
            const chart = chartRef.current.chart;
            const winsSeries = chart.series[0];
            const lossesSeries = chart.series[1];

            for (const [hour, dayStats] of Object.entries(pnlHour.stats)) {
                wins[hour] += dayStats.total_realized_pnl > 0 ? dayStats.total_realized_pnl : 0.0;
                losses[hour] += dayStats.total_realized_pnl < 0 ? dayStats.total_realized_pnl : 0.0;
            }

            winsSeries.setData(wins);
            lossesSeries.setData(losses);
            currPnlHourChart.current = { ...pnlHour };
        }
    }, [pnlHour]);

    Highcharts.setOptions(darkTheme);

    return (
        <Paper withBorder>
            <HighchartsReact highcharts={Highcharts} options={options} ref={chartRef} />
        </Paper>
    );
}
