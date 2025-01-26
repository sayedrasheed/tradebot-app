# TradeBot App
A React-based Tauri application designed to manage TradeBot and monitor its output for debugging and analysis. The app connects with TradeBot backend services, enabling users to launch live strategies and perform backtests using historical data. It offers tools to visualize both real-time and historical market data, review algorithm outputs such as calculated indicators and Buy/Sell signals, and analyze summarized Profit and Loss statistics for strategies. Additionally, users can select TradeBot logs from previous runs to visualize their output in same way as if it were ran live.

It utilizes Tauri events to communicate between the frontend and backend. These events are then forwarded to the TradeBot services through the Zenoh protocol. All interactions between the frontend, backend, and TradeBot are transmitted as Protobuf messages.

For chart visualizations, it leverages TradingView's [Lightweight Charts](https://www.tradingview.com/lightweight-charts/) as the primary charting library. Currently, the app uses my custom fork of Lightweight Charts for two reasons:
1. It uses the unreleased version 5 candidate, which introduces multipane support.
2. It adds custom box-drawing functionality to enable visualization of TradeBot's Rectangle output.

# Installation
1. Install [Node](https://nodejs.org/download/)
2. Install [Tauri](https://v1.tauri.app/v1/guides/getting-started/prerequisites/)
3. Install [Protobuf](https://github.com/protocolbuffers/protobuf/releases/tag/v3.16.0) NOTE: Needs to be version >=3.16.0
4. Clone repo and run npm install

# Demo


