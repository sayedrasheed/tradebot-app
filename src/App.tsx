import React, { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/tauri";
import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import { MantineProvider, Flex, Divider, Paper, Title } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Toolbar } from "./Toolbar";
import { ChartContainer } from "./Chart";
import { TotalPnlChart } from "./TotalPnlChart";
import { PositionPnlChart } from "./PositionPnlChart";
import { OrderTable } from "./OrderTable";
import { Stats } from "./Stats";
import "./App.css";
import { PnlCalendar } from "./PnlCalendar";
import { PnlDayChart } from "./PnlDayChart";
import { PnlTimeChart } from "./PnlTimeChart";
import { OverallPnlChart } from "./OverallPnlChart";
import { StrategyNav } from "./StrategyNav";
import { AppResponse } from "./pb/app_response";
import { SelectedStrategy, Strategy, Batch } from "./types";

function App() {
    let [batchesMap, setBatchesMap] = useState<Map<string, Batch>>(new Map<string, Batch>());
    let [selectedStrategy, setSelectedStrategy] = React.useState<SelectedStrategy>({ batchId: "", strategyId: "" });
    let [selectedOverallBatch, setSelectedOverallBatch] = React.useState<string>("");
    let [activePeriod, setActivePeriod] = React.useState<number | undefined>(0);
    let [activeSymbol, setActiveSymbol] = React.useState<string | undefined>("");
    let [liveModeActive, setLiveModeActive] = React.useState<boolean>(true);
    let [loading, handler] = useDisclosure();
    let [refresh, setRefresh] = useState<boolean>(false);
    let [view, setView] = useState<string>("strategy");

    const positionStatsEvent = "position_stats";
    const overallStatsEvent = "overall_stats";

    useEffect(() => {
        invoke("strategies_request");

        handler.open();
        listen<AppResponse>("strategy_list", (event) => {
            // Populate batch and strategy lists
            let bmap = new Map<string, Batch>();
            let app_response = event.payload as AppResponse;
            for (let batch of app_response.batches) {
                let batchId = batch.batch_id;
                bmap.set(batch.batch_id, { batchId: batchId, strategies: new Map<string, Strategy>() });

                let batchMap = bmap.get(batch.batch_id);
                for (let strategy of batch.strategies) {
                    let strategyId = strategy.strategy_id;

                    batchMap?.strategies.set(strategyId, {
                        strategyId: strategyId,
                        symbolPeriods: new Map<string, []>(),
                    });
                    let strategyMap = batchMap?.strategies.get(strategyId);
                    for (let symbol of strategy.symbol_periods) {
                        strategyMap?.symbolPeriods.set(symbol.symbol, symbol.period_s);
                    }
                }
            }
            setBatchesMap(bmap);
            handler.close();
        });

        listen("open_log_successful", (_event) => {
            setLiveModeActive(false);
            handler.close();
        });

        listen("loading", (_event) => {
            handler.open();
        });
    }, []);

    return (
        <MantineProvider defaultColorScheme="dark">
            <Toolbar
                batchesMap={batchesMap}
                selectedStrategy={selectedStrategy}
                activePeriod={activePeriod}
                activeSymbol={activeSymbol}
                setSelectedStrategy={setSelectedStrategy}
                setActivePeriod={setActivePeriod}
                setActiveSymbol={setActiveSymbol}
                loading={loading}
                setRefresh={setRefresh}
                setSelectedOverallBatch={setSelectedOverallBatch}
                setView={setView}
            />
            <Divider size="sm" />
            {view === "strategy" && (
                <div style={{ padding: "30px", marginTop: "-15px" }}>
                    <StrategyNav
                        batchesMap={batchesMap}
                        selectedStrategy={selectedStrategy}
                        setSelectedStrategy={setSelectedStrategy}
                    ></StrategyNav>
                    <Flex direction="row" height="size-6000" gap="lg">
                        <Paper withBorder>
                            <ChartContainer
                                selectedStrategy={selectedStrategy}
                                activePeriod={activePeriod}
                                activeSymbol={activeSymbol}
                                liveModeActive={liveModeActive}
                                refresh={refresh}
                            />
                        </Paper>
                        <Flex direction="column" gap="xl">
                            <TotalPnlChart selectedStrategy={selectedStrategy} />
                            <PositionPnlChart selectedStrategy={selectedStrategy} />
                        </Flex>
                    </Flex>
                    <Stats refresh={refresh} statsType={positionStatsEvent}></Stats>
                    <OrderTable selectedStrategy={selectedStrategy}></OrderTable>
                </div>
            )}
            {view === "overall" && (
                <div style={{ padding: "30px" }}>
                    <Stats refresh={refresh} statsType={overallStatsEvent}></Stats>
                    <OverallPnlChart selectedOverallBatch={selectedOverallBatch}></OverallPnlChart>
                    <Flex direction="row" height="size-6000" gap="lg">
                        <PnlCalendar
                            selectedOverallBatch={selectedOverallBatch}
                            setView={setView}
                            setSelectedStrategy={setSelectedStrategy}
                            liveModeActive={liveModeActive}
                        ></PnlCalendar>
                        <Flex direction="column" gap="xl" style={{ paddingTop: "45px" }}>
                            <PnlDayChart
                                liveModeActive={liveModeActive}
                                selectedOverallBatch={selectedOverallBatch}>
                            </PnlDayChart>
                            <PnlTimeChart
                                liveModeActive={liveModeActive}
                                selectedOverallBatch={selectedOverallBatch}
                            ></PnlTimeChart>
                        </Flex>
                    </Flex>
                </div>
            )}
        </MantineProvider>
    );
}

export default App;
