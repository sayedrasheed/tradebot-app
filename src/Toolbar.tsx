import React, { useEffect, useRef, useState } from "react";
import { Flex, ActionIcon, Divider, Button, Menu } from "@mantine/core";
import {
    IconFolderOpen,
    IconRefresh,
    IconRocket,
    IconHeartRateMonitor,
    IconReportAnalytics,
} from "@tabler/icons-react";
import { invoke } from "@tauri-apps/api";
import { SelectedStrategy, Batch } from "./types";
import { Dispatch, SetStateAction } from "react"

interface ToolbarProps {
    batchesMap: Map<string, Batch>,
    selectedStrategy: SelectedStrategy,
    activeSymbol: string | undefined,
    activePeriod: number | undefined,
    loading: boolean,
    setSelectedStrategy: Dispatch<SetStateAction<SelectedStrategy>>,
    setActiveSymbol: Dispatch<SetStateAction<string | undefined>>,
    setActivePeriod: Dispatch<SetStateAction<number | undefined>>,
    setRefresh: Dispatch<SetStateAction<boolean>>,
    setView: Dispatch<SetStateAction<string>>,
    setSelectedOverallBatch: Dispatch<SetStateAction<string>>,
}

export function Toolbar({
    batchesMap,
    selectedStrategy,
    activeSymbol,
    activePeriod,
    setSelectedStrategy,
    setActivePeriod,
    setActiveSymbol,
    loading,
    setRefresh,
    setView,
    setSelectedOverallBatch,
}: ToolbarProps) {
    let [symbolList, setSymbolList] = useState<string[]>([]);
    let [periodList, setPeriodList] = useState<number[]>([]);

    const periodStrMap = new Map<number, string>([
        [60, "1m"],
        [120, "2m"],
        [180, "3m"],
        [300, "5m"],
        [900, "15m"],
        [1800, "30m"],
        [3600, "1h"],
        [14400, "4h"],
        [86400, "1d"],
        [604800, "1w"]]
    );

    const periodMap = new Map<string, number>([
        ["1m", 60],
        ["2m", 120],
        ["3m", 180],
        ["5m", 300],
        ["15m", 900],
        ["30m", 1800],
        ["1h", 3600],
        ["4h", 1440],
        ["1d", 86400],
        ["1w", 604900]]
    );

    useEffect(
        function () {
            let batch = batchesMap.get(selectedStrategy.batchId);
            if (batch !== undefined) {
                let strategy = batch.strategies.get(selectedStrategy.strategyId);
                if (strategy !== undefined) {
                    let symbols = Array.from(strategy.symbolPeriods.keys());
                    setSymbolList(symbols);
                    setActiveSymbol(symbols[0]);

                    let periods = strategy.symbolPeriods.get(symbols[0]);

                    if (periods !== undefined) {
                        setPeriodList(periods);
                        setActivePeriod(Math.min(...periods));
                    }
                    setRefresh(false);
                }
            }
        },
        [selectedStrategy]
    );

    return (
        <Flex height="35px" direction="row">
            <ActionIcon
                variant="filled"
                aria-label="Settings"
                size="xl"
                radius="0"
                color="#242424"
                onClick={(e: any) => {
                    setRefresh(true);
                    invoke("chart_request", { batchId: "", strategyId: "", symbol: "", periodS: 0 });
                    setSelectedStrategy({ batchId: "", strategyId: "" });
                    setActiveSymbol("");
                    setActivePeriod(0);
                    invoke("app_request");
                    setView("strategy");
                }}
            >
                <IconRefresh style={{ width: "70%", height: "70%" }} stroke={1.0} />
            </ActionIcon>
            <ActionIcon
                variant="filled"
                aria-label="Settings"
                size="xl"
                radius="0"
                color="#242424"
                onClick={(e: any) => {
                    invoke("read_from_dir");
                }}
            >
                <IconFolderOpen style={{ width: "70%", height: "70%" }} stroke={1.0} />
            </ActionIcon>
            <ActionIcon
                variant="filled"
                aria-label="Settings"
                size="xl"
                radius="0"
                color="#242424"
                onClick={(e: any) => {
                    invoke("run_yaml");
                }}
            >
                <IconRocket style={{ width: "70%", height: "70%" }} stroke={1.0} />
            </ActionIcon>
            <Menu>
                <Menu.Target>
                    <ActionIcon
                        variant="filled"
                        aria-label="Settings"
                        size="xl"
                        radius="0"
                        color="#242424"
                        loading={loading}
                    >
                        <IconHeartRateMonitor style={{ width: "70%", height: "70%" }} stroke={1.0} />
                    </ActionIcon>
                </Menu.Target>

                <Menu.Dropdown>
                    {Array.from(batchesMap.values()).map((batch) => (
                        <div>
                            <Menu.Label>{batch.batchId}</Menu.Label>
                            {Array.from(batch.strategies.keys())
                                .sort()
                                .map((strategy) => (
                                    <Menu.Item
                                        key={batch + "-" + strategy}
                                        style={{
                                            backgroundColor: selectedStrategy.strategyId == strategy ? "black" : "",
                                        }}
                                        onClick={(e: any) => {
                                            setSelectedStrategy({ batchId: batch.batchId, strategyId: strategy });
                                            setView("strategy");
                                        }}
                                    >
                                        {strategy}
                                    </Menu.Item>
                                ))}
                        </div>
                    ))}
                </Menu.Dropdown>
            </Menu>
            <Menu>
                <Menu.Target>
                    <ActionIcon
                        variant="filled"
                        aria-label="Settings"
                        size="xl"
                        radius="0"
                        color="#242424"
                        loading={loading}
                    >
                        <IconReportAnalytics style={{ width: "70%", height: "70%" }} stroke={1.0} />
                    </ActionIcon>
                </Menu.Target>

                <Menu.Dropdown>
                    {Array.from(batchesMap.keys())
                        .sort()
                        .map((batch) => (
                            <div>
                                <Menu.Item
                                    key={batch}
                                    onClick={(e: any) => {
                                        setSelectedOverallBatch(batch);
                                        setView("overall");
                                    }}
                                >
                                    {batch}
                                </Menu.Item>
                            </div>
                        ))}
                </Menu.Dropdown>
            </Menu>
            <Divider size="md" orientation="vertical" />
            <>
                {symbolList.length == 1 && (
                    <ActionIcon size="xl" variant="filled" color="#242424">
                        {activeSymbol}
                    </ActionIcon>
                )}
                {symbolList.length > 1 && (
                    <Menu>
                        <Menu.Target>
                            <ActionIcon size="xl" variant="filled" color="#242424">
                                {activeSymbol}
                            </ActionIcon>
                        </Menu.Target>

                        <Menu.Dropdown>
                            <Menu.Label>Symbols</Menu.Label>
                            {symbolList.map(
                                (symbol) =>
                                    symbol != activeSymbol && (
                                        <Menu.Item
                                            key={symbol}
                                            onClick={(e: any) => {
                                                setActiveSymbol(e.target.textContent);
                                            }}
                                        >
                                            {symbol}
                                        </Menu.Item>
                                    )
                            )}
                        </Menu.Dropdown>
                    </Menu>
                )}
                <Menu>
                    <Menu.Target>
                        <ActionIcon size="xl" variant="filled" color="#242424">
                            {activePeriod !== undefined ? periodStrMap.get(activePeriod) : ""}
                        </ActionIcon>
                    </Menu.Target>

                    <Menu.Dropdown>
                        <Menu.Label>Periods</Menu.Label>
                        {periodList.map(
                            (period) =>
                                period != activePeriod && (
                                    <Menu.Item
                                        key={period}
                                        onClick={(e: any) => {
                                            setActivePeriod(periodMap.get(e.target.textContent));
                                        }}
                                    >
                                        {periodStrMap.get(period)}
                                    </Menu.Item>
                                )
                        )}
                    </Menu.Dropdown>
                </Menu>
            </>
        </Flex>
    );
}
