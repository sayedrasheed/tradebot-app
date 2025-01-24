import React, { useEffect, useRef, useState } from "react";
import { Group, Paper, SimpleGrid, Text } from "@mantine/core";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/tauri";
import { StatsType } from "./types";
import { OverallStats } from "./pb/overall_stats";
import { PositionStats } from "./pb/position_stats";

interface StatsProps {
    refresh: boolean,
    statsType: string,
}

export function Stats({ refresh, statsType }: StatsProps) {
    let [statsData, setStatsData] = React.useState<StatsType>({
        total_realized_pnl: 0.0,
        win_rate: 0.0,
        num_wins: 0,
        num_losses: 0,
        max_drawdown: 0.0,
        max_drawup: 0.0,
        avg_win: 0.0,
        avg_loss: 0.0,
    });

    useEffect(() => {
        let unlisten = undefined;
        if (statsType.length > 0) {
            unlisten = listen<OverallStats | PositionStats>(statsType, (event) => {
                setStatsData(event.payload);
            });
        }

        return () => {
            if (unlisten !== undefined) {
                unlisten.then((fn) => fn());
            }
        };
    }, []);

    useEffect(() => {
        setStatsData({
            total_realized_pnl: 0.0,
            win_rate: 0.0,
            num_wins: 0,
            num_losses: 0,
            max_drawdown: 0.0,
            max_drawup: 0.0,
            avg_win: 0.0,
            avg_loss: 0.0,
        });
    }, [refresh]);

    return (
        <div className="stats">
            <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} spacing="md">
                <Paper withBorder p="lg" radius="md" key="total_realized_pnl">
                    <Group justify="apart">
                        <div>
                            <Text c="dimmed" tt="uppercase" fw={700} fz="xs" className="stats-label">
                                Total Profit & Loss
                            </Text>
                            <Text fw={700} fz="xl">
                                ${statsData.total_realized_pnl.toFixed(2)}
                            </Text>
                        </div>
                    </Group>
                    <Text c="dimmed" fz="sm" mt="md">
                        <Text
                            component="span"
                            c={
                                statsData.total_realized_pnl > 0
                                    ? "teal"
                                    : statsData.total_realized_pnl < 0
                                    ? "red"
                                    : ""
                            }
                            fw={700}
                        >
                            ${statsData.total_realized_pnl.toFixed(2)}
                        </Text>{" "}
                        in realized {statsData.total_realized_pnl > 0 ? "profit" : "losses"}
                    </Text>
                </Paper>
                <Paper withBorder p="md" radius="md" key="win_rate">
                    <Group justify="apart">
                        <div>
                            <Text c="dimmed" tt="uppercase" fw={700} fz="xs" className="stats-label">
                                Win Rate
                            </Text>
                            <Text fw={700} fz="xl">
                                {(statsData.win_rate * 100).toFixed(2)}%
                            </Text>
                        </div>
                    </Group>
                    <Text c="dimmed" fz="sm" mt="md">
                        <Text
                            component="span"
                            c={statsData.win_rate > 0.49999 ? "teal" : statsData.win_rate > 0.0001 ? "red" : ""}
                            fw={700}
                        >
                            {(statsData.win_rate * 100).toFixed(2)}%
                        </Text>{" "}
                        current win rate
                    </Text>
                </Paper>
                <Paper withBorder p="md" radius="md" key="num_wins">
                    <Group justify="apart">
                        <div>
                            <Text c="dimmed" tt="uppercase" fw={700} fz="xs" className="stats-label">
                                Number of wins
                            </Text>
                            <Text fw={700} fz="xl">
                                {statsData.num_wins}
                            </Text>
                        </div>
                    </Group>
                    <Text c="dimmed" fz="sm" mt="md">
                        <Text component="span" c={statsData.num_wins > 0 ? "teal" : ""} fw={700}>
                            {statsData.num_wins}
                        </Text>{" "}
                        total wins so far
                    </Text>
                </Paper>
                <Paper withBorder p="md" radius="md" key="num_losses">
                    <Group justify="apart">
                        <div>
                            <Text c="dimmed" tt="uppercase" fw={700} fz="xs" className="stats-label">
                                Number of losses
                            </Text>
                            <Text fw={700} fz="xl">
                                {statsData.num_losses}
                            </Text>
                        </div>
                    </Group>
                    <Text c="dimmed" fz="sm" mt="md">
                        <Text component="span" c={statsData.num_losses > 0 ? "red" : ""} fw={700}>
                            {statsData.num_losses}
                        </Text>{" "}
                        total losses so far
                    </Text>
                </Paper>
                <Paper withBorder p="md" radius="md" key="avg_win">
                    <Group justify="apart">
                        <div>
                            <Text c="dimmed" tt="uppercase" fw={700} fz="xs" className="stats-label">
                                Average win
                            </Text>
                            <Text fw={700} fz="xl">
                                ${statsData.avg_win.toFixed(2)}
                            </Text>
                        </div>
                    </Group>
                    <Text c="dimmed" fz="sm" mt="md">
                        <Text component="span" c={statsData.avg_win > 0.0001 ? "teal" : ""} fw={700}>
                            ${statsData.avg_win.toFixed(2)}
                        </Text>{" "}
                        average profit per trade
                    </Text>
                </Paper>
                <Paper withBorder p="md" radius="md" key="avg_loss">
                    <Group justify="apart">
                        <div>
                            <Text c="dimmed" tt="uppercase" fw={700} fz="xs" className="stats-label">
                                Average loss
                            </Text>
                            <Text fw={700} fz="xl">
                                ${statsData.avg_loss.toFixed(2)}
                            </Text>
                        </div>
                    </Group>
                    <Text c="dimmed" fz="sm" mt="md">
                        <Text component="span" c={statsData.avg_loss < 0.0001 ? "red" : ""} fw={700}>
                            ${statsData.avg_loss.toFixed(2)}
                        </Text>{" "}
                        average loss per trade
                    </Text>
                </Paper>
                <Paper withBorder p="md" radius="md" key="max_drawup">
                    <Group justify="apart">
                        <div>
                            <Text c="dimmed" tt="uppercase" fw={700} fz="xs" className="stats-label">
                                Maximum Drawup
                            </Text>
                            <Text fw={700} fz="xl">
                                ${statsData.max_drawup.toFixed(2)}
                            </Text>
                        </div>
                    </Group>
                    <Text c="dimmed" fz="sm" mt="md">
                        <Text component="span" c={statsData.max_drawup > 0.0001 ? "teal" : ""} fw={700}>
                            ${statsData.max_drawup.toFixed(2)}
                        </Text>{" "}
                        maximum profit
                    </Text>
                </Paper>
                <Paper withBorder p="md" radius="md" key="max_drawdown">
                    <Group justify="apart">
                        <div>
                            <Text c="dimmed" tt="uppercase" fw={700} fz="xs" className="stats-label">
                                Maximum drawdown
                            </Text>
                            <Text fw={700} fz="xl">
                                ${statsData.max_drawdown.toFixed(2)}
                            </Text>
                        </div>
                    </Group>
                    <Text c="dimmed" fz="sm" mt="md">
                        <Text component="span" c={statsData.max_drawdown < 0.0001 ? "red" : ""} fw={700}>
                            ${statsData.max_drawdown.toFixed(2)}
                        </Text>{" "}
                        maximum loss
                    </Text>
                </Paper>
            </SimpleGrid>
        </div>
    );
}
