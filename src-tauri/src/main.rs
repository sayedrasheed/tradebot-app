// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tradebot_protos::messages::enums::MessageType;
use tradebot_protos::messages::{
    Advice, AlgoChart, AppRequest, AppResponse, Candle, Chart, ChartRequest, Order, OrderFilled,
    OrderList, OverallDayStats, OverallFromLogRequest, OverallRequest, OverallStats, PnlCalendar,
    PnlHour, Point, PositionPnlRealized, PositionPnlRealizedList, PositionPnlUnrealized,
    PositionStats, ReadFromDirRequest, ReadFromDirResponse, Rectangle, RunYaml,
    StrategyFromLogRequest, TotalPnl, TotalPnlRealized, TotalPnlUnrealized,
};
use zenoh_node::builder::NodeBuilder;
use zenoh_node::error::NodeError;
use zenoh_node::node::{Abort, Node, Publisher, Subscribe, SubscriberError};

use std::env;
use std::thread::sleep;
use std::time::Duration;
use tauri::async_runtime::Mutex;
use tauri::{AppHandle, Manager, State};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub struct ServiceConfig {
    pub zenoh_config_path: Option<String>,
    pub ip: String,
    pub port: u16,
    pub topics: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub struct TopicConfig {
    pub topics: HashMap<String, String>,
}

impl TopicConfig {
    // Mapping of topic name from config. If no mapping exists then this returns default topic
    pub fn get(&self, default_topic: &str) -> String {
        self.topics
            .get(default_topic)
            .map_or_else(|| default_topic.to_owned(), |topic| topic.clone())
    }
}

impl Default for TopicConfig {
    fn default() -> Self {
        Self {
            topics: HashMap::new(),
        }
    }
}

impl From<&HashMap<String, String>> for TopicConfig {
    fn from(topics: &HashMap<String, String>) -> Self {
        Self {
            topics: topics.clone(),
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub struct TopicMtype {
    pub mtype: MessageType,
    pub topic: String,
}

struct PassToState {
    strategies_req_publisher: Publisher<AppRequest>,
    overall_req_publisher: Publisher<OverallRequest>,
    run_yaml_publisher: Publisher<RunYaml>,
    strategies_from_dir_req_publisher: Publisher<ReadFromDirRequest>,
    strategy_from_log_req_publisher: Publisher<StrategyFromLogRequest>,
    overall_from_log_req_publisher: Publisher<OverallFromLogRequest>,
    chart_req_publisher: Publisher<ChartRequest>,
    app_subscriber: Mutex<Option<Box<dyn Abort>>>,
}

const SERVICE_CONFIG_PATH: &str = "../config/service.yml"; // TODO: make command line arg

#[tokio::main]
async fn main() {
    // Read service config yaml file so we can subscribe to service feed
    let f = std::fs::read_to_string(SERVICE_CONFIG_PATH).unwrap();
    let service_config: ServiceConfig = serde_yaml::from_str(&f).unwrap();

    let service_ip = service_config.ip;
    let service_port = service_config.port;

    let mut builder = NodeBuilder::new();
    if let Some(config) = &service_config.zenoh_config_path {
        builder.set_config_path(config);
    }

    builder.set_network((service_ip.clone(), service_port));
    let service_node = builder.build().await.unwrap();

    let topics = if let Some(topics) = &service_config.topics {
        TopicConfig::from(topics)
    } else {
        TopicConfig::default()
    };

    // Create publishers on the service node. Use topics from service config if they exist, otherwise use hard coded topic
    let strategies_req_publisher = service_node
        .new_publisher(&topics.get("app_request"))
        .await
        .unwrap();

    let run_yaml_publisher = service_node
        .new_publisher(&topics.get("run_yaml"))
        .await
        .unwrap();

    let chart_req_publisher = service_node
        .new_publisher(&topics.get("chart_request"))
        .await
        .unwrap();
    let overall_req_publisher = service_node
        .new_publisher(&topics.get("overall_request"))
        .await
        .unwrap();
    let strategies_from_dir_req_publisher = service_node
        .new_publisher(&topics.get("read_from_dir_request"))
        .await
        .unwrap();
    let strategy_from_log_req_publisher = service_node
        .new_publisher(&topics.get("strategy_from_log_request"))
        .await
        .unwrap();
    let overall_from_log_req_publisher = service_node
        .new_publisher(&topics.get("overall_from_log_request"))
        .await
        .unwrap();

    tauri::Builder::default()
        .manage(PassToState {
            strategies_req_publisher,
            strategy_from_log_req_publisher,
            overall_from_log_req_publisher,
            chart_req_publisher,
            run_yaml_publisher,
            strategies_from_dir_req_publisher,
            overall_req_publisher,
            app_subscriber: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            app_request,
            overall_request,
            chart_request,
            read_from_dir,
            strategy_from_log_request,
            overall_from_log_request,
            run_yaml,
        ])
        .setup(|app| {
            let app_handle = app.handle();
            tauri::async_runtime::spawn(async move {
                // Create app service subscriber
                let f = std::fs::read_to_string(SERVICE_CONFIG_PATH).unwrap();
                let service_config: ServiceConfig = serde_yaml::from_str(&f).unwrap();

                let ip = service_config.ip;
                let port = service_config.port;

                let topics = if let Some(topics) = &service_config.topics {
                    TopicConfig::from(topics)
                } else {
                    TopicConfig::default()
                };

                let app_service_subscriber = AppServiceSubscriber::new(app_handle);
                let mut subscriber = service_node
                    .new_subscriber(app_service_subscriber)
                    .await
                    .unwrap();

                service_node
                    .subscribe::<AppResponse>(&topics.get("app_response"), &mut subscriber)
                    .await
                    .unwrap();

                service_node
                    .subscribe::<ReadFromDirResponse>(
                        &topics.get("read_from_dir_response"),
                        &mut subscriber,
                    )
                    .await
                    .unwrap();

                let mut builder = NodeBuilder::new();
                if let Some(config) = &service_config.zenoh_config_path {
                    builder.set_config_path(config);
                }

                builder.set_network((ip.clone(), port));
                let service_node = builder.build().await.unwrap();

                let strategies_req_publisher = service_node
                    .new_publisher(&topics.get("app_request"))
                    .await
                    .unwrap();

                sleep(Duration::from_millis(1000));

                // Let backend know the app is up and running
                strategies_req_publisher
                    .publish(AppRequest {
                        timestamp_ns: 0,
                        user_id: String::new(),
                    })
                    .await
                    .unwrap();
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

async fn send_strategy_list<R: tauri::Runtime>(msg: &AppResponse, manager: &impl Manager<R>) {
    manager.emit_all("strategy_list", msg).unwrap();
}

async fn send_read_from_dir_list<R: tauri::Runtime>(
    msg: &ReadFromDirResponse,
    manager: &impl Manager<R>,
) {
    manager.emit_all("strategy_list", msg).unwrap();
    manager.emit_all("open_log_successful", msg).unwrap();
}

fn send_chart<R: tauri::Runtime>(msg: Chart, manager: &impl Manager<R>) {
    manager.emit_all("chart", msg).unwrap();
}

fn send_candle<R: tauri::Runtime>(msg: Candle, manager: &impl Manager<R>) {
    manager.emit_all("update_candle", msg).unwrap();
}

fn send_point<R: tauri::Runtime>(msg: Point, manager: &impl Manager<R>) {
    manager.emit_all("point", msg).unwrap();
}

fn send_rectangle<R: tauri::Runtime>(msg: Rectangle, manager: &impl Manager<R>) {
    manager.emit_all("rectangle", msg).unwrap();
}

fn send_advice<R: tauri::Runtime>(msg: Advice, manager: &impl Manager<R>) {
    manager.emit_all("advice", msg).unwrap();
}

fn send_algo_chart<R: tauri::Runtime>(msg: AlgoChart, manager: &impl Manager<R>) {
    manager.emit_all("algo_chart", msg).unwrap();
}

fn send_order<R: tauri::Runtime>(msg: Order, manager: &impl Manager<R>) {
    manager.emit_all("order", msg).unwrap();
}

fn send_order_list<R: tauri::Runtime>(msg: OrderList, manager: &impl Manager<R>) {
    manager.emit_all("order_list", msg).unwrap();
}

fn send_order_filled<R: tauri::Runtime>(msg: OrderFilled, manager: &impl Manager<R>) {
    manager.emit_all("order_filled", msg).unwrap();
}

fn send_pnl_line<R: tauri::Runtime>(msg: TotalPnl, manager: &impl Manager<R>) {
    manager.emit_all("total_pnl", msg).unwrap();
}

fn send_pnl_realized<R: tauri::Runtime>(msg: TotalPnlRealized, manager: &impl Manager<R>) {
    manager.emit_all("total_pnl_realized", msg).unwrap();
}

fn send_pnl_unrealized<R: tauri::Runtime>(msg: TotalPnlUnrealized, manager: &impl Manager<R>) {
    manager.emit_all("total_pnl_unrealized", msg).unwrap();
}

fn send_pos_realized<R: tauri::Runtime>(msg: PositionPnlRealized, manager: &impl Manager<R>) {
    manager.emit_all("pos_pnl_realized", msg).unwrap();
}

fn send_pos_realized_list<R: tauri::Runtime>(
    msg: PositionPnlRealizedList,
    manager: &impl Manager<R>,
) {
    manager.emit_all("pos_pnl_realized_list", msg).unwrap();
}

fn send_pos_unrealized<R: tauri::Runtime>(msg: PositionPnlUnrealized, manager: &impl Manager<R>) {
    manager.emit_all("pos_pnl_unrealized", msg).unwrap();
}

fn send_position_stats<R: tauri::Runtime>(msg: PositionStats, manager: &impl Manager<R>) {
    manager.emit_all("position_stats", msg).unwrap();
}

fn send_overall_stats<R: tauri::Runtime>(msg: OverallStats, manager: &impl Manager<R>) {
    manager.emit_all("overall_stats", msg).unwrap();
}

fn send_overall_day_stats<R: tauri::Runtime>(msg: OverallDayStats, manager: &impl Manager<R>) {
    manager.emit_all("overall_day_stats", msg.clone()).unwrap();
}

fn send_pnl_calendar<R: tauri::Runtime>(msg: PnlCalendar, manager: &impl Manager<R>) {
    manager.emit_all("pnl_calendar", msg).unwrap();
}

fn send_pnl_hour<R: tauri::Runtime>(msg: PnlHour, manager: &impl Manager<R>) {
    manager.emit_all("pnl_hour", msg).unwrap();
}

#[tauri::command]
async fn app_request(state: tauri::State<'_, PassToState>) -> Result<(), String> {
    state
        .strategies_req_publisher
        .publish(AppRequest {
            timestamp_ns: 0,
            user_id: String::new(),
        })
        .await
        .unwrap();
    Ok(())
}

#[tauri::command]
async fn chart_request(
    batch_id: String,
    strategy_id: String,
    symbol: String,
    period_s: u32,
    state: tauri::State<'_, PassToState>,
    _app_handle: tauri::AppHandle,
) -> Result<(), String> {
    state
        .chart_req_publisher
        .publish(ChartRequest {
            timestamp_ns: 0,
            batch_id,
            strategy_id,
            symbol,
            period_s,
        })
        .await
        .unwrap();

    Ok(())
}

#[tauri::command]
async fn overall_request(
    state: tauri::State<'_, PassToState>,
    batch_id: String,
) -> Result<(), String> {
    sleep(Duration::from_millis(100));
    state
        .overall_req_publisher
        .publish(OverallRequest {
            timestamp_ns: 0,
            batch_id,
        })
        .await
        .unwrap();
    Ok(())
}

#[tauri::command]
async fn read_from_dir(
    state: tauri::State<'_, PassToState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    use tauri::api::dialog::blocking::FileDialogBuilder;

    let dialog_result = FileDialogBuilder::new().pick_folder();

    if let Some(dr) = dialog_result {
        state
            .strategies_from_dir_req_publisher
            .publish(ReadFromDirRequest {
                timestamp_ns: 0,
                log_dir: dr.display().to_string(),
            })
            .await
            .unwrap();

        app_handle.emit_all("loading", {}).unwrap();
    }

    Ok(())
}

#[tauri::command]
async fn strategy_from_log_request(
    batch_id: String,
    strategy_id: String,
    symbol: String,
    period_s: u32,
    state: tauri::State<'_, PassToState>,
    _app_handle: tauri::AppHandle,
) -> Result<(), String> {
    if strategy_id.len() > 0 && symbol.len() > 0 && period_s > 0 {
        state
            .strategy_from_log_req_publisher
            .publish(StrategyFromLogRequest {
                timestamp_ns: 0,
                batch_id: batch_id.clone(),
                strategy_id: strategy_id.clone(),
                symbol: symbol.clone(),
                period_s,
            })
            .await
            .unwrap();
    }

    Ok(())
}

#[tauri::command]
async fn overall_from_log_request(
    batch_id: String,
    state: tauri::State<'_, PassToState>,
    _app_handle: tauri::AppHandle,
) -> Result<(), String> {
    if batch_id.len() > 0 {
        state
            .overall_from_log_req_publisher
            .publish(OverallFromLogRequest {
                timestamp_ns: 0,
                batch_id: batch_id.clone(),
            })
            .await
            .unwrap();
    }

    Ok(())
}

#[tauri::command]
async fn run_yaml(
    state: tauri::State<'_, PassToState>,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    use tauri::api::dialog::blocking::FileDialogBuilder;

    let dialog_result = FileDialogBuilder::new()
        .add_filter("yaml", &["yml"])
        .pick_file();

    if let Some(dr) = dialog_result {
        let app_subscriber = state.app_subscriber.lock().await;
        if let Some(subscriber) = &*app_subscriber {
            subscriber.abort();
        }

        state
            .run_yaml_publisher
            .publish(RunYaml {
                timestamp_ns: 0,
                yaml_path: dr.display().to_string(),
            })
            .await
            .unwrap();

        app_handle.emit_all("loading", {}).unwrap();
    }

    Ok(String::new())
}

pub struct AppServiceSubscriber {
    app_handle: AppHandle,
}

impl AppServiceSubscriber {
    pub fn new(app_handle: AppHandle) -> Self {
        Self { app_handle }
    }
}

#[async_trait]
impl Subscribe<ReadFromDirResponse> for AppServiceSubscriber {
    async fn on_data(&mut self, msg: ReadFromDirResponse) -> Result<(), SubscriberError> {
        send_read_from_dir_list(&msg, &self.app_handle).await;
        Ok(())
    }
}

#[async_trait]
impl Subscribe<AppResponse> for AppServiceSubscriber {
    async fn on_data(&mut self, msg: AppResponse) -> Result<(), SubscriberError> {
        // When we receive the app response, we can subscribe to the app feed so we can visualize
        let state: State<PassToState> = self.app_handle.state();
        let mut apps: tokio::sync::MutexGuard<'_, Option<Box<dyn Abort>>> =
            state.app_subscriber.lock().await;

        if let Some(subscriber) = &*apps {
            subscriber.abort();
            *apps = None;
        }

        let nw = msg.network.as_ref().unwrap();
        let node = create_node(&nw.ip, nw.port as u16).await.unwrap();

        let app_subscriber = AppSubscriber::new(&self.app_handle);
        let mut subscriber = node.new_subscriber(app_subscriber).await.unwrap();

        // Subscribe to topics we need to get the data we need to visualize
        for topic in &msg.topics {
            let mtype = MessageType::try_from(topic.mtype)?;
            match mtype {
                MessageType::Chart => {
                    node.subscribe::<Chart>(&topic.topic, &mut subscriber)
                        .await
                        .unwrap();
                }
                MessageType::AlgoChart => {
                    node.subscribe::<AlgoChart>(&topic.topic, &mut subscriber)
                        .await
                        .unwrap();
                }
                MessageType::PositionStats => {
                    node.subscribe::<PositionStats>(&topic.topic, &mut subscriber)
                        .await
                        .unwrap();
                }
                MessageType::OrderList => {
                    node.subscribe::<OrderList>(&topic.topic, &mut subscriber)
                        .await
                        .unwrap();
                }

                MessageType::Candle => {
                    node.subscribe::<Candle>(&topic.topic, &mut subscriber)
                        .await
                        .unwrap();
                }
                MessageType::Point => {
                    node.subscribe::<Point>(&topic.topic, &mut subscriber)
                        .await
                        .unwrap();
                }
                MessageType::Advice => {
                    node.subscribe::<Advice>(&topic.topic, &mut subscriber)
                        .await
                        .unwrap();
                }
                MessageType::Order => {
                    node.subscribe::<Order>(&topic.topic, &mut subscriber)
                        .await
                        .unwrap();
                }
                MessageType::OrderFilled => {
                    node.subscribe::<OrderFilled>(&topic.topic, &mut subscriber)
                        .await
                        .unwrap();
                }
                MessageType::TotalPnl => {
                    node.subscribe::<TotalPnl>(&topic.topic, &mut subscriber)
                        .await
                        .unwrap();
                }
                MessageType::TotalPnlRealized => {
                    node.subscribe::<TotalPnlRealized>(&topic.topic, &mut subscriber)
                        .await
                        .unwrap();
                }
                MessageType::TotalPnlUnrealized => {
                    node.subscribe::<TotalPnlUnrealized>(&topic.topic, &mut subscriber)
                        .await
                        .unwrap();
                }
                MessageType::PositionPnlRealized => {
                    node.subscribe::<PositionPnlRealized>(&topic.topic, &mut subscriber)
                        .await
                        .unwrap();
                }
                MessageType::PositionPnlRealizedList => {
                    node.subscribe::<PositionPnlRealizedList>(&topic.topic, &mut subscriber)
                        .await
                        .unwrap();
                }
                MessageType::PositionPnlUnrealized => {
                    node.subscribe::<PositionPnlUnrealized>(&topic.topic, &mut subscriber)
                        .await
                        .unwrap();
                }
                MessageType::OverallStats => {
                    node.subscribe::<OverallStats>(&topic.topic, &mut subscriber)
                        .await
                        .unwrap();
                }
                MessageType::OverallDayStats => {
                    node.subscribe::<OverallDayStats>(&topic.topic, &mut subscriber)
                        .await
                        .unwrap();
                }
                MessageType::PnlCalendar => {
                    node.subscribe::<PnlCalendar>(&topic.topic, &mut subscriber)
                        .await
                        .unwrap();
                }
                MessageType::PnlHour => {
                    node.subscribe::<PnlHour>(&topic.topic, &mut subscriber)
                        .await
                        .unwrap();
                }
                MessageType::Rectangle => {
                    node.subscribe::<Rectangle>(&topic.topic, &mut subscriber)
                        .await
                        .unwrap();
                }
                _ => (),
            }
        }

        *apps = Some(Box::new(subscriber));

        send_strategy_list(&msg, &self.app_handle).await;

        Ok(())
    }
}

// App subscriber that will subscribe to protobuf messages and just relay them to the Tauri front end.
// Since front end uses the same protobufs as well, nothing else we need to do
pub struct AppSubscriber {
    app_handle: AppHandle,
}

impl AppSubscriber {
    pub fn new(app_handle: &AppHandle) -> Self {
        Self {
            app_handle: app_handle.clone(),
        }
    }
}

#[async_trait]
impl Subscribe<Chart> for AppSubscriber {
    async fn on_data(&mut self, msg: Chart) -> Result<(), SubscriberError> {
        send_chart(msg, &self.app_handle);
        Ok(())
    }
}

#[async_trait]
impl Subscribe<Candle> for AppSubscriber {
    async fn on_data(&mut self, msg: Candle) -> Result<(), SubscriberError> {
        send_candle(msg, &self.app_handle);
        Ok(())
    }
}

#[async_trait]
impl Subscribe<Point> for AppSubscriber {
    async fn on_data(&mut self, msg: Point) -> Result<(), SubscriberError> {
        send_point(msg, &self.app_handle);
        Ok(())
    }
}

#[async_trait]
impl Subscribe<PositionPnlRealized> for AppSubscriber {
    async fn on_data(&mut self, msg: PositionPnlRealized) -> Result<(), SubscriberError> {
        send_pos_realized(msg, &self.app_handle);
        Ok(())
    }
}

#[async_trait]
impl Subscribe<PositionPnlRealizedList> for AppSubscriber {
    async fn on_data(&mut self, msg: PositionPnlRealizedList) -> Result<(), SubscriberError> {
        send_pos_realized_list(msg, &self.app_handle);
        Ok(())
    }
}

#[async_trait]
impl Subscribe<PositionPnlUnrealized> for AppSubscriber {
    async fn on_data(&mut self, msg: PositionPnlUnrealized) -> Result<(), SubscriberError> {
        send_pos_unrealized(msg, &self.app_handle);
        Ok(())
    }
}

#[async_trait]
impl Subscribe<TotalPnlRealized> for AppSubscriber {
    async fn on_data(&mut self, msg: TotalPnlRealized) -> Result<(), SubscriberError> {
        send_pnl_realized(msg, &self.app_handle);
        Ok(())
    }
}

#[async_trait]
impl Subscribe<TotalPnlUnrealized> for AppSubscriber {
    async fn on_data(&mut self, msg: TotalPnlUnrealized) -> Result<(), SubscriberError> {
        send_pnl_unrealized(msg, &self.app_handle);
        Ok(())
    }
}

#[async_trait]
impl Subscribe<Advice> for AppSubscriber {
    async fn on_data(&mut self, msg: Advice) -> Result<(), SubscriberError> {
        send_advice(msg, &self.app_handle);
        Ok(())
    }
}

#[async_trait]
impl Subscribe<TotalPnl> for AppSubscriber {
    async fn on_data(&mut self, msg: TotalPnl) -> Result<(), SubscriberError> {
        send_pnl_line(msg, &self.app_handle);
        Ok(())
    }
}

#[async_trait]
impl Subscribe<AlgoChart> for AppSubscriber {
    async fn on_data(&mut self, msg: AlgoChart) -> Result<(), SubscriberError> {
        send_algo_chart(msg, &self.app_handle);
        Ok(())
    }
}

#[async_trait]
impl Subscribe<Order> for AppSubscriber {
    async fn on_data(&mut self, msg: Order) -> Result<(), SubscriberError> {
        send_order(msg, &self.app_handle);
        Ok(())
    }
}

#[async_trait]
impl Subscribe<OrderFilled> for AppSubscriber {
    async fn on_data(&mut self, msg: OrderFilled) -> Result<(), SubscriberError> {
        send_order_filled(msg, &self.app_handle);
        Ok(())
    }
}

#[async_trait]
impl Subscribe<OrderList> for AppSubscriber {
    async fn on_data(&mut self, msg: OrderList) -> Result<(), SubscriberError> {
        send_order_list(msg, &self.app_handle);
        Ok(())
    }
}

#[async_trait]
impl Subscribe<PositionStats> for AppSubscriber {
    async fn on_data(&mut self, msg: PositionStats) -> Result<(), SubscriberError> {
        send_position_stats(msg, &self.app_handle);
        Ok(())
    }
}

#[async_trait]
impl Subscribe<OverallStats> for AppSubscriber {
    async fn on_data(&mut self, msg: OverallStats) -> Result<(), SubscriberError> {
        send_overall_stats(msg, &self.app_handle);
        Ok(())
    }
}

#[async_trait]
impl Subscribe<OverallDayStats> for AppSubscriber {
    async fn on_data(&mut self, msg: OverallDayStats) -> Result<(), SubscriberError> {
        send_overall_day_stats(msg, &self.app_handle);
        Ok(())
    }
}

#[async_trait]
impl Subscribe<PnlCalendar> for AppSubscriber {
    async fn on_data(&mut self, msg: PnlCalendar) -> Result<(), SubscriberError> {
        send_pnl_calendar(msg, &self.app_handle);
        Ok(())
    }
}

#[async_trait]
impl Subscribe<PnlHour> for AppSubscriber {
    async fn on_data(&mut self, msg: PnlHour) -> Result<(), SubscriberError> {
        send_pnl_hour(msg, &self.app_handle);
        Ok(())
    }
}

#[async_trait]
impl Subscribe<Rectangle> for AppSubscriber {
    async fn on_data(&mut self, msg: Rectangle) -> Result<(), SubscriberError> {
        send_rectangle(msg, &self.app_handle);
        Ok(())
    }
}

#[inline]
async fn create_node(ip: &str, port: u16) -> Result<Node, NodeError> {
    let mut node_builder = NodeBuilder::new();
    node_builder.set_network((ip.to_string(), port as u16));

    let node = node_builder.build().await?;

    Ok(node)
}
