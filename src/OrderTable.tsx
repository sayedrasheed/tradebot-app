import React, { useEffect } from "react";
import { Flex, Paper, Table } from "@mantine/core";
import { listen } from "@tauri-apps/api/event";
import { OrderTableEntry, SelectedStrategy } from "./types";
import { Order } from "./pb/order";
import { PositionPnlRealized } from "./pb/pos_pnl_realized";
import { OrderFilled } from "./pb/order_filled";
import { PositionPnlRealizedList } from "./pb/pos_pnl_realized_list";
import { OrderList } from "./pb/order_list";

interface OrderTableProps {
    selectedStrategy: SelectedStrategy;
}

export function OrderTable({ selectedStrategy }: OrderTableProps) {
    const orderStatusStrMap = new Map<number, string>([
        [0, "OPEN"],
        [1, "FILLED"],
        [2, "CANCELLED"],
    ]);

    let orderTableData = React.useRef<Map<number, OrderTableEntry>>(new Map());
    let [orders, setOrders] = React.useState<OrderTableEntry[]>([]);
    let columns = [
        { name: "Date & Time", uid: "dt" },
        { name: "Side", uid: "side" },
        { name: "Amount", uid: "amount" },
        { name: "Price", uid: "price" },
        { name: "Status", uid: "status" },
        { name: "Fill Price", uid: "fill_price" },
        { name: "Realized", uid: "realized" },
    ];

    useEffect(() => {
        const order_unlisten = listen<Order>("order", (event) => {
            if (orderTableData.current.has(event.payload.order_id)) {
                let orderTableEntry = orderTableData.current.get(event.payload.order_id);
                orderTableEntry!.dt = getTimestamp(event.payload.timestamp_ns / 1000000000);
                orderTableEntry!.side = event.payload.size > 0 ? "BUY" : "SELL";

                if (orderTableEntry!.status.length == 0) {
                    orderTableEntry!.status = orderStatusStrMap.has(event.payload.order_status)
                        ? orderStatusStrMap.get(event.payload.order_status)!
                        : "";
                }
                orderTableEntry!.price = event.payload.price.toFixed(2);
                orderTableEntry!.timestamp_ns = event.payload.timestamp_ns;
            } else {
                orderTableData.current.set(event.payload.order_id, {
                    id: (event.payload.order_id + 1).toString(),
                    dt: getTimestamp(event.payload.timestamp_ns / 1000000000),
                    side: event.payload.size > 0 ? "BUY" : "SELL",
                    amount: event.payload.size.toString(),
                    status: orderStatusStrMap.has(event.payload.order_status)
                        ? orderStatusStrMap.get(event.payload.order_status)!
                        : "",
                    price: event.payload.price.toFixed(2),
                    fill_price: event.payload.filled_price.toFixed(2),
                    realized: "",
                    count: orderTableData.current.size + 1,
                    timestamp_ns: event.payload.timestamp_ns,
                });
            }

            setOrders(Array.from(orderTableData.current.values()).sort(compare));
        });

        const pos_realized_unlisten = listen<PositionPnlRealized>("pos_pnl_realized", (event) => {
            if (orderTableData.current.has(event.payload.position_id)) {
                let orderTableEntry = orderTableData.current.get(event.payload.position_id);
                orderTableEntry!.realized = event.payload.value!.value.toFixed(2);
            } else {
                orderTableData.current.set(event.payload.position_id, {
                    id: "",
                    fill_price: "",
                    status: "",
                    dt: "",
                    side: "",
                    amount: "",
                    price: "",
                    realized: event.payload.value!.value.toFixed(2),
                    count: orderTableData.current.size + 1,
                    timestamp_ns: 0,
                });
            }

            setOrders(Array.from(orderTableData.current.values()).sort(compare));
        });

        const order_filled_unlisten = listen<OrderFilled>("order_filled", (event) => {
            if (orderTableData.current.has(event.payload.order_id)) {
                let orderTableEntry = orderTableData.current.get(event.payload.order_id);
                orderTableEntry!.fill_price = event.payload.price.toFixed(2);
                orderTableEntry!.status = "FILLED";
            } else {
                orderTableData.current.set(event.payload.order_id, {
                    id: "",
                    fill_price: event.payload.price.toFixed(2),
                    status: "FILLED",
                    dt: "",
                    side: "",
                    amount: "",
                    price: "",
                    realized: "",
                    count: orderTableData.current.size + 1,
                    timestamp_ns: 0,
                });
            }

            setOrders(Array.from(orderTableData.current.values()).sort(compare));
        });

        const realized_list_unlisten = listen<PositionPnlRealizedList>("pos_pnl_realized_list", (event) => {
            for (let realized of event.payload.realized_list) {
                if (orderTableData.current.has(realized.position_id)) {
                    let orderTableEntry = orderTableData.current.get(realized.position_id);
                    orderTableEntry!.realized = realized.value!.value.toFixed(2);
                } else {
                    orderTableData.current.set(realized.position_id, {
                        id: "",
                        dt: "",
                        side: "",
                        amount: "",
                        status: "",
                        price: "",
                        fill_price: "",
                        realized: realized.value!.value.toFixed(2),
                        count: orderTableData.current.size + 1,
                        timestamp_ns: 0,
                    });
                }
            }

            setOrders(Array.from(orderTableData.current.values()).sort(compare));
        });

        const order_list_unlisten = listen<OrderList>("order_list", (event) => {
            console.log(event.payload);
            for (let order of event.payload.orders) {
                if (orderTableData.current.has(order.order_id)) {
                    let orderTableEntry = orderTableData.current.get(order.order_id);
                    orderTableEntry!.dt = getTimestamp(order.timestamp_ns / 1000000000);
                    orderTableEntry!.side = order.size > 0 ? "BUY" : "SELL";
                    orderTableEntry!.status = orderStatusStrMap.has(order.order_status)
                        ? orderStatusStrMap.get(order.order_status)!
                        : "";
                    orderTableEntry!.price = order.price.toFixed(2);
                    orderTableEntry!.fill_price = order.filled_price.toFixed(2);
                    orderTableEntry!.timestamp_ns = order.timestamp_ns;
                } else {
                    orderTableData.current.set(order.order_id, {
                        id: (order.order_id + 1).toString(),
                        dt: getTimestamp(order.timestamp_ns / 1000000000),
                        side: order.size > 0 ? "BUY" : "SELL",
                        amount: order.size.toString(),
                        status: orderStatusStrMap.has(order.order_status)
                            ? orderStatusStrMap.get(order.order_status)!
                            : "",
                        price: order.price.toFixed(2),
                        fill_price: order.filled_price.toFixed(2),
                        realized: "",
                        count: orderTableData.current.size + 1,
                        timestamp_ns: order.timestamp_ns,
                    });
                }
            }

            setOrders(Array.from(orderTableData.current.values()).sort(compare));
        });

        return () => {
            order_list_unlisten.then((fn) => fn()); // Ensure proper cleanup of the listener
            order_filled_unlisten.then((fn) => fn()); // Ensure proper cleanup of the listener
            order_unlisten.then((fn) => fn()); // Ensure proper cleanup of the listener
            realized_list_unlisten.then((fn) => fn()); // Ensure proper cleanup of the listener
            pos_realized_unlisten.then((fn) => fn()); // Ensure proper cleanup of the listener
        };
    }, []);

    useEffect(() => {
        orderTableData.current = new Map();
        setOrders([]);
    }, [selectedStrategy]);

    return (
        <Flex direction="row" style={{ padding: "10px" }}>
            <Paper withBorder className="ordertable">
                <Table.ScrollContainer minWidth={1370} h={300}>
                    <Table stickyHeader horizontalSpacing="lg">
                        <Table.Thead>
                            <Table.Tr>
                                {columns.map((c) => (
                                    <Table.Th>{c.name}</Table.Th>
                                ))}
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {orders.map((order: OrderTableEntry) => (
                                <Table.Tr key={order.count}>
                                    <Table.Td>{order.dt}</Table.Td>
                                    <Table.Td
                                        style={{
                                            color: order.side == "BUY" ? "green" : "red",
                                        }}
                                    >
                                        {order.side}
                                    </Table.Td>
                                    <Table.Td>{order.amount}</Table.Td>
                                    <Table.Td>{order.price}</Table.Td>
                                    <Table.Td>{order.status}</Table.Td>
                                    <Table.Td>{order.fill_price}</Table.Td>
                                    <Table.Td
                                        style={{
                                            color: Number(order.realized) > 0 ? "green" : "red",
                                        }}
                                    >
                                        {order.realized}
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                </Table.ScrollContainer>
            </Paper>
        </Flex>
    );
}

function getTimestamp(timestamp_s: number) {
    const d = new Date(timestamp_s * 1000);
    return d.toLocaleString("en-US", { timeZone: "America/New_York" });
}
function compare(a: OrderTableEntry, b: OrderTableEntry) {
    if (a.timestamp_ns < b.timestamp_ns) {
        return -1;
    }
    if (a.timestamp_ns > b.timestamp_ns) {
        return 1;
    }
    return 0;
}
