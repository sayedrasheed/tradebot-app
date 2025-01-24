import React, { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/tauri";

import { createChart, CrosshairMode, createSeriesMarkers, IChartApi, ISeriesApi, Time, ISeriesMarkersPluginApi, SeriesMarker, CandlestickData, UTCTimestamp, HistogramData, LineData, BoxOptions, LineStyle, IBox, ColorType } from "lightweight-charts";
import { Group, Text } from "@mantine/core";
import { Chart } from "./pb/chart";
import { AlgoChart } from "./pb/algo_chart";
import { Legend, LineVal, SelectedStrategy } from "./types";
import { Candle } from "./pb/candle";
import { Point } from "./pb/point";
import { Rectangle } from "./pb/rectangle";
import { Advice } from "./pb/advice";

interface ChartProps {
    selectedStrategy: SelectedStrategy,
    activeSymbol: string | undefined,
    activePeriod: number | undefined,
    refresh: boolean,
    liveModeActive: boolean,
}

export function ChartContainer({ selectedStrategy, activePeriod, activeSymbol, liveModeActive, refresh }: ChartProps) {
    const defaultRectColor = "#0ff";
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chart = useRef<IChartApi>(undefined);
    const resizeObserver = useRef<ResizeObserver>(undefined);
    const candleSeries = useRef<ISeriesApi<"Candlestick", Time>>(undefined);
    const volumeSeries = useRef<ISeriesApi<"Histogram", Time>>(undefined);
    const adviceMarkerSeries = useRef<ISeriesMarkersPluginApi<Time>>(undefined);
    let lineSeries = useRef<Map<string, ISeriesApi<"Line", Time>>>(new Map());
    let lineSeriesColorMap = useRef<Map<string, string>>(new Map());
    let currentMarkers = useRef<SeriesMarker<Time>[]>([]);
    let currentBoxes = useRef<IBox[]>([]);
    let initialChartReceived = useRef(false);
    let initialAlgoReceived = useRef(false);
    let [legend, setLegend] = React.useState<Legend | null>(null);
    let eastOffset = 14400;

    useEffect(() => {
        const chart_unlisten = listen<Chart>("chart", (event) => {
            let candles: CandlestickData<Time>[] = [];
            let volume: HistogramData<Time>[] = [];

            // Initialize candlestick chart with datafeed chart data
            for (const ohlcv of event.payload.ohlcv) {
                candles.push({
                    time: ohlcv.timestamp_ns / 1000000000 - eastOffset as UTCTimestamp,
                    open: ohlcv.open,
                    high: ohlcv.high,
                    low: ohlcv.low,
                    close: ohlcv.close,
                });

                volume.push({
                    time: ohlcv.timestamp_ns / 1000000000 - eastOffset as UTCTimestamp,
                    value: ohlcv.volume,
                    color: ohlcv.open > ohlcv.close ? "#ff4976" : "#4bffb5",
                });
            }

            candleSeries.current?.setData(candles);
            volumeSeries.current?.setData(volume);

            initialChartReceived.current = true;
        });

        const update_candle_unlisten = listen<Candle>("update_candle", (event) => {
            // New incoming candle so update chart
            if (initialChartReceived.current) {
                if (candleSeries.current !== undefined && event.payload.ohlcv !== undefined) {
                    candleSeries.current.update({
                        time: event.payload.ohlcv.timestamp_ns / 1000000000 - eastOffset as UTCTimestamp,
                        open: event.payload.ohlcv.open,
                        high: event.payload.ohlcv.high,
                        low: event.payload.ohlcv.low,
                        close: event.payload.ohlcv.close,
                    });
                }

                if (volumeSeries.current !== undefined && event.payload.ohlcv !== undefined) {
                    volumeSeries.current.update({
                        time: event.payload.ohlcv.timestamp_ns / 1000000000 - eastOffset as UTCTimestamp,
                        value: event.payload.ohlcv.volume,
                        color: event.payload.ohlcv.open > event.payload.ohlcv.close ? "#ff4976" : "#4bffb5",
                    });
                }
            }
        });

        const algo_chart_unlisten = listen<AlgoChart>("algo_chart", (event) => {
            // Initialize chart with algo data
            let adviceMarkers: SeriesMarker<Time>[] = [];

            for (let advice of event.payload.advices) {
                if (advice.size > 0) {
                    adviceMarkers.push({
                        time: advice.timestamp_ns / 1000000000 - eastOffset as UTCTimestamp,
                        position: "belowBar",
                        color: "#0098d4",
                        shape: "arrowUp",
                        text: "Buy @ " + advice.price,
                    });
                } else {
                    adviceMarkers.push({
                        time: advice.timestamp_ns / 1000000000 - eastOffset as UTCTimestamp,
                        position: "aboveBar",
                        color: "#e91e63",
                        shape: "arrowDown",
                        text: "Sell @ " + advice.price,
                    });
                }
            }

            currentMarkers.current = adviceMarkers;
            adviceMarkerSeries.current?.setMarkers(adviceMarkers);

            for (let line of lineSeries.current.values()) {
                chart.current?.removeSeries(line);
            }

            lineSeries.current = new Map<string, ISeriesApi<"Line", Time>>();
            for (let description of Object.keys(event.payload.lines)) {
                let line = event.payload.lines[description];
                let lineColor: string =
                    line.color !== null && line.color !== undefined
                        ? line.color
                        : "#" + (((1 << 24) * Math.random()) | 0).toString(16).padStart(6, "0");

                if (chart.current !== undefined) {
                    lineSeries.current.set(description, chart.current.addLineSeries(
                        {
                            color: lineColor,
                            lineWidth: 1,
                            priceLineVisible: false,
                            lastValueVisible: false,
                        },
                        line.pane_idx
                    ));
                    lineSeriesColorMap.current.set(description, lineColor);

                    let points: LineData<Time>[] = [];
                    for (let i = 0; i < line.points.length; ++i) {
                        points.push({
                            time: line.points[i].timestamp_ns / 1000000000 - eastOffset as UTCTimestamp,
                            value: line.points[i].value,
                        });
                    }

                    lineSeries.current.get(description)?.setData(points);
                }

            }

            for (let b of currentBoxes.current) {
                candleSeries.current?.removeBox(b);
            }

            currentBoxes.current = [];
            for (let rectangle of event.payload.rectangles) {
                const box: BoxOptions = {
                    lowPrice: rectangle.low_price,
                    highPrice: rectangle.high_price,
                    earlyTime: rectangle.early_timestamp_ns / 1000000000 - eastOffset,
                    lateTime: rectangle.late_timestamp_ns / 1000000000 - eastOffset,
                    borderColor: rectangle.color !== null && rectangle.color !== undefined ? rectangle.color : defaultRectColor,
                    borderWidth: 1,
                    fillColor: rectangle.color !== null && rectangle.color !== undefined ? rectangle.color : defaultRectColor,
                    fillOpacity: 0.2,
                    borderVisible: true,
                    axisLabelVisible: false,
                    title: "box",
                    borderStyle: LineStyle.Solid,
                    corners: [],
                };

                const createdBox = candleSeries.current?.createBox(box);

                if (createdBox !== undefined) {
                    currentBoxes.current.push(createdBox);
                }
            }

            initialAlgoReceived.current = true;
            if (chart.current !== undefined) {
                chart.current.timeScale().resetTimeScale();
                chart.current.priceScale("right").applyOptions({ autoScale: true });
            }
        });

        const point_unlisten = listen<Point>("point", (event) => {
            if (initialAlgoReceived.current) {
                if (lineSeries.current.has(event.payload.description)) {
                    lineSeries.current.get(event.payload.description)!.update({
                        time: event.payload.value!.timestamp_ns / 1000000000 - eastOffset as UTCTimestamp,
                        value: event.payload.value!.value,
                    });
                }
            }
        });

        const rect_unlisten = listen<Rectangle>("rectangle", (event) => {
            if (initialAlgoReceived.current) {
                const box: BoxOptions = {
                    lowPrice: event.payload.low_price,
                    highPrice: event.payload.high_price,
                    earlyTime: event.payload.early_timestamp_ns / 1000000000 - eastOffset,
                    lateTime: event.payload.late_timestamp_ns / 1000000000 - eastOffset,
                    borderColor: event.payload.color !== null && event.payload.color !== undefined ? event.payload.color : defaultRectColor,
                    borderWidth: 1,
                    fillColor: event.payload.color !== null && event.payload.color !== undefined ? event.payload.color : defaultRectColor,
                    fillOpacity: 0.2,
                    borderVisible: true,
                    axisLabelVisible: false,
                    title: "box",
                    borderStyle: LineStyle.Solid,
                    corners: [],
                };
                const createdBox = candleSeries.current?.createBox(box);

                if (createdBox !== undefined) {
                    currentBoxes.current.push(createdBox);
                }
            }
        });

        const advice_unlisten = listen<Advice>("advice", (event) => {
            if (initialAlgoReceived.current) {
                if (event.payload.size > 0) {
                    currentMarkers.current.push({
                        time: event.payload.timestamp_ns / 1000000000 - eastOffset as UTCTimestamp,
                        position: "belowBar",
                        color: "#0098d4",
                        shape: "arrowUp",
                        text: "Buy @ " + event.payload.price,
                    });
                } else {
                    currentMarkers.current.push({
                        time: event.payload.timestamp_ns / 1000000000 - eastOffset as UTCTimestamp,
                        position: "aboveBar",
                        color: "#e91e63",
                        shape: "arrowDown",
                        text: "Sell @ " + event.payload.price,
                    });
                }
                adviceMarkerSeries.current?.setMarkers(currentMarkers.current);
            }
        });

        return () => {
            advice_unlisten.then((fn) => fn());
            rect_unlisten.then((fn) => fn());
            point_unlisten.then((fn) => fn());
            algo_chart_unlisten.then((fn) => fn());
            advice_unlisten.then((fn) => fn());
            update_candle_unlisten.then((fn) => fn());
            chart_unlisten.then((fn) => fn());
        };
    }, []);

    useEffect(
        function () {
            console.log(selectedStrategy);
            console.log(activePeriod);
            console.log(activeSymbol);
            console.log(chart.current);
            console.log(chartContainerRef.current);
            if (selectedStrategy.batchId.length > 0 && selectedStrategy.strategyId.length > 0) {
                if (activePeriod !== undefined && activePeriod > 0 && activeSymbol !== undefined && activeSymbol.length > 0) {
                    if (chart.current === undefined && chartContainerRef.current !== null) {
                        chart.current = createChart(chartContainerRef.current, {
                            width: chartContainerRef.current.clientWidth,
                            height: 500, //"300px", //chartContainerRef.current.clientHeight,
                            layout: {
                                background: { type: ColorType.Solid, color: "transparent" },
                                textColor: "white",
                            },
                            grid: {
                                vertLines: {
                                    color: "#707070",
                                },
                                horzLines: {
                                    color: "#707070",
                                },
                            },
                            crosshair: {
                                mode: CrosshairMode.Normal,
                            },
                            // priceScale: {
                            //     borderColor: "#485c7b",
                            // },
                            timeScale: {
                                borderColor: "#485c7b",
                                timeVisible: true,
                                barSpacing: 12,
                            },
                            autoSize: true,
                        });

                        resizeObserver.current = new ResizeObserver((entries) => {
                            const { width, height } = entries[0].contentRect;
                            chart.current?.applyOptions({ width, height });
                            setTimeout(() => {
                                chart.current?.timeScale().fitContent();
                            }, 0);
                        });

                        if (chartContainerRef.current !== null) {
                            resizeObserver.current.observe(chartContainerRef.current);
                        }

                        candleSeries.current = chart.current.addCandlestickSeries({
                            upColor: "#4bffb5",
                            downColor: "#ff4976",
                            borderDownColor: "#ff4976",
                            borderUpColor: "#4bffb5",
                            wickDownColor: "#838ca1",
                            wickUpColor: "#838ca1",
                        });

                        candleSeries.current.priceScale().applyOptions({
                            scaleMargins: {
                                // positioning the price scale for the area series
                                top: 0.1,
                                bottom: 0.4,
                            },
                        });

                        volumeSeries.current = chart.current.addHistogramSeries({
                            priceFormat: {
                                type: "volume",
                            },
                            priceScaleId: "", // set as an overlay by setting a blank priceScaleId
                        });
                        volumeSeries.current.priceScale().applyOptions({
                            // set the positioning of the volume series
                            scaleMargins: {
                                top: 0.7, // highest point of the series will be 70% away from the top
                                bottom: 0,
                            },
                        });

                        adviceMarkerSeries.current = createSeriesMarkers(candleSeries.current, []);

                        chart.current.subscribeCrosshairMove((param) => {
                            if (candleSeries.current !== undefined && volumeSeries.current !== undefined) {
                                const candle = param.seriesData.get(candleSeries.current);
                                const volume = param.seriesData.get(volumeSeries.current);

                                let lineVals: LineVal[] = [];
                                for (let [description, lineRef] of lineSeries.current.entries()) {
                                    const line = param.seriesData.get(lineRef);

                                    if (line !== undefined) {
                                        lineVals.push({ value: line.value, color: lineSeriesColorMap.current.get(description)!, description });
                                    }
                                }

                                if (candle !== undefined && volume !== undefined) {
                                    let legend: Legend = {
                                        open: candle.open,
                                        high: candle.high,
                                        low: candle.low,
                                        close: candle.close,
                                        volume: volume.value,
                                        lines: lineVals,
                                    };
                                    setLegend(legend);
                                }
                            }
                        });
                    }

                    initialAlgoReceived.current = false;
                    initialChartReceived.current = false;

                    if (liveModeActive) {
                        invoke("chart_request", {
                            batchId: selectedStrategy.batchId,
                            strategyId: selectedStrategy.strategyId,
                            symbol: activeSymbol,
                            periodS: activePeriod,
                        });
                    } else {
                        invoke("strategy_from_log_request", {
                            batchId: selectedStrategy.batchId,
                            strategyId: selectedStrategy.strategyId,
                            symbol: activeSymbol,
                            periodS: activePeriod,
                        });
                    }
                }
            }

            return () => {
                if (resizeObserver.current !== undefined) resizeObserver.current.disconnect();
            };
        },
        [selectedStrategy, activePeriod, activeSymbol]
    );

    useEffect(
        function () {
            if (refresh == true) {
                lineSeries.current = new Map();
                currentMarkers.current = [];

                if (chart.current !== undefined) {
                    chart.current.remove();
                    chart.current = undefined;
                    if (resizeObserver.current !== undefined) resizeObserver.current.disconnect();
                    resizeObserver.current = undefined;
                }

                setLegend(null);
                initialAlgoReceived.current = false;
                initialChartReceived.current = false;
            }
        },
        [refresh]
    );

    return (
        <div>
            <div
                ref={chartContainerRef}
                className="chart-container"
                style={{ height: "770px", width: "1037px" }}
                id="my-chart-container"
            >
                <div>
                    {chart.current && legend && (
                        <Group className="tooltip">
                            <Text c="white" tt="uppercase" fw={700} fz="xs" className="stats-label">
                                O{" "}
                                <span style={{ color: legend.close >= legend.open ? "green" : "red" }}>
                                    {legend.open}
                                </span>
                            </Text>
                            <Text c="white" tt="uppercase" fw={700} fz="xs" className="stats-label">
                                H{" "}
                                <span style={{ color: legend.close >= legend.open ? "green" : "red" }}>
                                    {legend.high}
                                </span>
                            </Text>
                            <Text c="white" tt="uppercase" fw={700} fz="xs" className="stats-label">
                                L{" "}
                                <span style={{ color: legend.close >= legend.open ? "green" : "red" }}>
                                    {legend.low}
                                </span>
                            </Text>
                            <Text c="white" tt="uppercase" fw={700} fz="xs" className="stats-label">
                                C{" "}
                                <span style={{ color: legend.close >= legend.open ? "green" : "red" }}>
                                    {legend.close}
                                </span>
                            </Text>
                            <Text c="white" tt="uppercase" fw={700} fz="xs" className="stats-label">
                                V{" "}
                                <span style={{ color: legend.close >= legend.open ? "green" : "red" }}>
                                    {legend.volume}
                                </span>
                            </Text>
                        </Group>
                    )}
                    {lineSeries.current && legend && legend.lines.length > 0 && (
                        <Group className="tooltip-line">
                            {legend.lines.map((val) => (
                                <Group>
                                    <Text c="white" tt="uppercase" fw={700} fz="xs" className="stats-label">
                                        {val.description}
                                    </Text>
                                    <Text c={val.color} tt="uppercase" fw={700} fz="xs" className="stats-label">
                                        {val.value.toFixed(2)}
                                    </Text>
                                </Group>
                            ))}
                        </Group>
                    )}
                </div>
            </div>
        </div>
    );
}
