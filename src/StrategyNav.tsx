import React, { Dispatch, SetStateAction, useEffect, useRef, useState } from "react";
import { Flex, Paper, Autocomplete, ActionIcon, Group, ComboboxItemGroup } from "@mantine/core";
import { IconArrowLeft, IconArrowRight } from "@tabler/icons-react";
import { Batch, SelectedStrategy, StrategyNavEntry } from "./types";

interface StrategyNavProps {
    batchesMap: Map<string, Batch>,
    selectedStrategy: SelectedStrategy,
    setSelectedStrategy: Dispatch<SetStateAction<SelectedStrategy>>,
}

export function StrategyNav({ batchesMap, selectedStrategy, setSelectedStrategy }: StrategyNavProps) {
    let [autoCompleteData, setAutoCompleteData] = React.useState<ComboboxItemGroup[]>([]);
    let [strategyId, setStrategyId] = React.useState<string>("");
    let strategyNavEntryMap = useRef<Map<string, StrategyNavEntry>>(new Map<string, StrategyNavEntry>());

    const handleNext = () => {
        if (strategyNavEntryMap.current.has(strategyId)) {
            setStrategyId(strategyNavEntryMap.current.get(strategyId)!.nextStrategy);
        }
    };

    const handlePrevious = () => {
        if (strategyNavEntryMap.current.has(strategyId)) {
            setStrategyId(strategyNavEntryMap.current.get(strategyId)!.prevStrategy);
        }
    };

    useEffect(() => {
        if (strategyNavEntryMap.current.has(strategyId)) {
            setSelectedStrategy({ batchId: strategyNavEntryMap.current.get(strategyId)!.batchId, strategyId: strategyId });
        }
    }, [strategyId]);

    useEffect(() => {
        setStrategyId(selectedStrategy.strategyId);
    }, [selectedStrategy]);

    useEffect(
        function () {
            let newAutoCompleteData = [];
            newAutoCompleteData = Array.from(batchesMap.values()).map((batch) => ({
                group: batch.batchId,
                items: Array.from(batch.strategies.keys()).sort(),
            }));

            for (let group of newAutoCompleteData) {
                for (let [i, sid] of group.items.entries()) {
                    strategyNavEntryMap.current.set(sid, {
                        batchId: group.group,
                        prevStrategy: i - 1 < 0 ? group.items[group.items.length - 1] : group.items[i - 1],
                        nextStrategy: i + 1 >= group.items.length ? group.items[0] : group.items[i + 1],
                    });
                }
            }
            setAutoCompleteData(newAutoCompleteData);
        },
        [batchesMap]
    );

    return (
        <Flex direction="column" style={{ paddingBottom: "10px" }}>
            <Group gap="xs">
                <ActionIcon
                    variant="filled"
                    aria-label="Settings"
                    size="xl"
                    radius="0"
                    color="#242424"
                    onClick={handlePrevious}
                >
                    <IconArrowLeft style={{ width: "70%", height: "70%" }} stroke={1.0} />
                </ActionIcon>
                <Autocomplete data={autoCompleteData} value={strategyId} onChange={setStrategyId}></Autocomplete>
                <ActionIcon
                    variant="filled"
                    aria-label="Settings"
                    size="xl"
                    radius="0"
                    color="#242424"
                    onClick={handleNext}
                >
                    <IconArrowRight style={{ width: "70%", height: "70%" }} stroke={1.0} />
                </ActionIcon>
            </Group>
        </Flex>
    );
}
