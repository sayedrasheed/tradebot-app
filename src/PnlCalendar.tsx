import React, { Dispatch, SetStateAction, useEffect, useRef, useState } from "react";
import { Flex, Paper, Menu, Button } from "@mantine/core";
import { Calendar } from "@mantine/dates";
import { IconPhoto } from "@tabler/icons-react";

import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/tauri";
import { SelectedStrategy } from "./types";
import { PnlCalendar as PnlCalendarPb } from "./pb/pnl_calendar";
import { OverallDayStats } from "./pb/overall_day_stats";

interface PnlCalendarProps {
    selectedOverallBatch: string;
    liveModeActive: boolean;
    setView: Dispatch<SetStateAction<string>>;
    setSelectedStrategy: Dispatch<SetStateAction<SelectedStrategy>>;
}

export function PnlCalendar({ selectedOverallBatch, setView, setSelectedStrategy, liveModeActive }: PnlCalendarProps) {
    let [pnlCalendar, setPnlCalendar] = React.useState<PnlCalendarPb | undefined>(undefined);
    let currentCalendar = useRef<PnlCalendarPb>(undefined);
    let [maxMonth, setMaxMonth] = useState(new Date());
    let [minMonth, setMinMonth] = useState(new Date());
    let [currDate, setCurrDate] = useState(new Date());

    const icon = <IconPhoto size={10} />;

    useEffect(() => {
        if (selectedOverallBatch !== undefined && selectedOverallBatch.length > 0) {
            if (liveModeActive) {
                invoke("overall_request", { batchId: selectedOverallBatch });
            } else {
                invoke("overall_from_log_request", {
                    batchId: selectedOverallBatch,
                });
            }
        }

        const calendar_unlisten = listen<PnlCalendarPb>("pnl_calendar", (event) => {
            console.log(event.payload);
            setPnlCalendar(event.payload);

            let dates = Object.keys(event.payload.stats).sort();
            if (dates.length > 0) {
                const maxYear = parseInt(dates[dates.length - 1].substring(0, 4), 10); // Extract and parse the year
                const maxMonth = parseInt(dates[dates.length - 1].substring(4, 6), 10) - 1; // Extract and parse the month (zero-based)
                const maxDay = parseInt(dates[dates.length - 1].substring(6, 8), 10); // Extract and parse the day
                setMaxMonth(new Date(maxYear, maxMonth, maxDay));

                const minYear = parseInt(dates[0].substring(0, 4), 10); // Extract and parse the year
                const minMonth = parseInt(dates[0].substring(4, 6), 10) - 1; // Extract and parse the month (zero-based)
                const minDay = parseInt(dates[0].substring(6, 8), 10); // Extract and parse the day
                setMinMonth(new Date(minYear, minMonth, minDay));
                setCurrDate(new Date(minYear, minMonth, minDay));
            }
        });

        const overall_day_unlisten = listen<OverallDayStats>("overall_day_stats", (event) => {
            if (currentCalendar.current !== undefined) {
                let date = event.payload.date;
                let newPnlCalendar = { ...currentCalendar.current };
                newPnlCalendar.stats[date] = event.payload;
                setPnlCalendar(newPnlCalendar);
                const currYear = parseInt(date.substring(0, 4), 10); // Extract and parse the year
                const currMonth = parseInt(date.substring(4, 6), 10) - 1; // Extract and parse the month (zero-based)
                const currDay = parseInt(date.substring(6, 8), 10); // Extract and parse the day

                let currDate = new Date(currYear, currMonth, currDay);
                if (currDate > maxMonth) {
                    setMaxMonth(currDate);
                } else if (currDate < minMonth) {
                    setMinMonth(currDate);
                }
            }
        });

        return () => {
            calendar_unlisten.then((fn) => fn()); // Ensure proper cleanup of the listener
            overall_day_unlisten.then((fn) => fn()); // Ensure proper cleanup of the listener
        };
    }, []);

    useEffect(() => {
        if (selectedOverallBatch !== undefined && selectedOverallBatch.length > 0) {
            invoke("overall_request", { batchId: selectedOverallBatch });
        }
    }, [selectedOverallBatch]);

    useEffect(() => {
        if (pnlCalendar !== undefined) {
            currentCalendar.current = { ...pnlCalendar };
        }
    }, [pnlCalendar]);

    const renderDay = (date: Date) => {
        let year = new Intl.DateTimeFormat("en", { year: "numeric" }).format(date);
        let month = new Intl.DateTimeFormat("en", { month: "2-digit" }).format(date);
        let day = new Intl.DateTimeFormat("en", { day: "2-digit" }).format(date);

        let dateStr = `${year}${month}${day}`;
        const dayNumberSingleDigit = date.getDate();

        const totalRealized =
            pnlCalendar == undefined || pnlCalendar.stats[dateStr] === undefined
                ? undefined
                : pnlCalendar.stats[dateStr].total_realized_pnl;
        let totalRealizedStr =
            pnlCalendar == undefined || pnlCalendar.stats[dateStr] === undefined
                ? "--"
                : pnlCalendar.stats[dateStr].total_realized_pnl.toFixed(2);

        if (
            pnlCalendar !== undefined &&
            pnlCalendar.stats[dateStr] !== undefined &&
            pnlCalendar.stats[dateStr].total_realized_pnl > -0.001
        ) {
            totalRealizedStr = "+" + totalRealizedStr;
        }

        let backgroundColor;
        if (totalRealized === undefined) {
            backgroundColor = "#242424";
        } else if (totalRealized > 0) {
            backgroundColor = "#022e05";
        } else {
            backgroundColor = "#420404";
        }

        return (
            <div style={{ backgroundColor: backgroundColor, position: "relative", height: "100%", width: "100%" }}>
                <span
                    style={{
                        position: "absolute",
                        top: "5px",
                        left: "110px",
                        fontSize: "14px",
                        fontWeight: "bold",
                        color: "#c4ccc5",
                    }}
                >
                    {dayNumberSingleDigit}
                </span>

                <div
                    style={{
                        position: "absolute",
                        bottom: "5px",
                        left: "50%",
                        transform: "translateX(-50%)",
                        fontSize: "20px",
                        color: totalRealized === undefined ? "#46494f" : totalRealized > 0 ? "#1bf539" : "#ff0015",
                    }}
                >
                    {totalRealizedStr}
                </div>
                {pnlCalendar !== undefined &&
                    pnlCalendar.stats[dateStr] !== undefined &&
                    pnlCalendar.stats[dateStr].strategy_ids.length > 1 && (
                        <div
                            style={{
                                position: "absolute",
                                top: "5px",
                                left: "10px",
                            }}
                        >
                            <Menu trigger="hover" openDelay={100} closeDelay={400} shadow="md" width={200}>
                                <Menu.Target>
                                    <Button
                                        style={{
                                            backgroundColor: backgroundColor,
                                        }}
                                        leftSection={icon}
                                        size="xs"
                                    />
                                </Menu.Target>

                                <Menu.Dropdown>
                                    {pnlCalendar.stats[dateStr].strategy_ids.sort().map((strategy) => (
                                        <Menu.Item
                                            key={selectedOverallBatch + "-" + strategy}
                                            onClick={(e: any) => {
                                                setSelectedStrategy({
                                                    batchId: selectedOverallBatch,
                                                    strategyId: strategy,
                                                });
                                                setView("strategy");
                                            }}
                                        >
                                            {strategy}
                                        </Menu.Item>
                                    ))}
                                </Menu.Dropdown>
                            </Menu>
                        </div>
                    )}
            </div>
        );
    };

    return (
        <Calendar
            date={currDate}
            onMonthSelect={setCurrDate}
            onNextMonth={setCurrDate}
            onPreviousMonth={setCurrDate}
            maxDate={maxMonth}
            minDate={minMonth}
            renderDay={renderDay} // Pass the custom render function to the Calendar
            getDayProps={(date) => ({
                onClick: () => {
                    let year = new Intl.DateTimeFormat("en", { year: "numeric" }).format(date);
                    let month = new Intl.DateTimeFormat("en", { month: "2-digit" }).format(date);
                    let day = new Intl.DateTimeFormat("en", { day: "2-digit" }).format(date);
                    let dateStr = `${year}${month}${day}`;
                    let strategy_ids = pnlCalendar!.stats[dateStr].strategy_ids;

                    if (strategy_ids.length == 1) {
                        setView("strategy");
                        setSelectedStrategy({ batchId: selectedOverallBatch, strategyId: strategy_ids[0] });
                    }
                },
            })}
            styles={{
                root: {
                    width: "400px",
                    height: "300px",
                },
                day: {
                    width: "130px", // Set the width of each day cell
                    height: "150px", // Set the height of each day cell
                    fontSize: "14px", // Set the font size for the text in each day cell
                    display: "flex",
                },
                month: {
                    fontSize: "16px", // Adjust the month font size
                    borderWidth: 1, // Change border width
                    borderStyle: "solid", // Ensure it's visible (e.g., solid, dashed)
                    // borderColor: "#3d3d3d",
                },
            }}
        />
    );
}
