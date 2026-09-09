use std::{
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
    thread::JoinHandle,
};

use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use lenso_capability_observability_query::{
    ListRequestsError, ListRequestsRequest, ListRequestsResponse, ListTraceLogsError,
    ListTraceLogsRequest, ListTraceLogsResponse, ListTraceLogsResponseLogsItem,
    ListTraceLogsResponseLogsItemAttributesItem, OptionalValue, ReadIngestionHealthError,
    ReadIngestionHealthRequest, ReadIngestionHealthResponse, ReadTraceError, ReadTraceRequest,
    ReadTraceResponse, ReadTraceResponseCompleteness, ReadTraceResponseSpansItem,
    ReadTraceResponseSpansItemAttributesItem, ReadTraceResponseSpansItemKind,
    ReadTraceResponseSpansItemStatus, Request, RequestCompleteness, WatchRequestsResponse,
    WatchRequestsResponseKind,
};
use lenso_kernel::RuntimeFailure;
use rusqlite::{Connection, OptionalExtension as _, params};
use tokio::sync::{broadcast, mpsc, oneshot};

const COMMAND_CAPACITY: usize = 64;
const FEED_CAPACITY: usize = 64;

const SCHEMA: &str = r"
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS spans (
  source_id TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  span_id TEXT NOT NULL,
  parent_span_id TEXT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER NOT NULL,
  status TEXT NOT NULL,
  service_name TEXT NOT NULL,
  attributes_json TEXT NOT NULL CHECK (json_valid(attributes_json)),
  completeness TEXT NOT NULL,
  is_server_root INTEGER NOT NULL,
  PRIMARY KEY (source_id, trace_id, span_id)
) STRICT;
CREATE INDEX IF NOT EXISTS spans_recent_requests
ON spans(source_id, started_at DESC, trace_id DESC) WHERE is_server_root = 1;
CREATE INDEX IF NOT EXISTS spans_trace
ON spans(source_id, trace_id, started_at, span_id);
CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  span_id TEXT,
  timestamp INTEGER NOT NULL,
  severity TEXT NOT NULL,
  body TEXT NOT NULL,
  attributes_json TEXT NOT NULL CHECK (json_valid(attributes_json))
) STRICT;
CREATE INDEX IF NOT EXISTS logs_trace
ON logs(source_id, trace_id, timestamp, id);
CREATE TABLE IF NOT EXISTS receiver_state (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  receiver_epoch TEXT NOT NULL,
  accepted_spans INTEGER NOT NULL,
  accepted_logs INTEGER NOT NULL,
  rejected_records INTEGER NOT NULL,
  decode_failures INTEGER NOT NULL,
  queue_saturation INTEGER NOT NULL,
  redacted_attributes INTEGER NOT NULL,
  retention_deletions INTEGER NOT NULL,
  feed_lag INTEGER NOT NULL
) STRICT;
";

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub(crate) struct Attribute {
    pub(crate) key: String,
    pub(crate) value: String,
}

#[derive(Clone, Debug)]
pub(crate) struct StoredSpan {
    pub(crate) trace_id: String,
    pub(crate) span_id: String,
    pub(crate) parent_span_id: Option<String>,
    pub(crate) name: String,
    pub(crate) kind: &'static str,
    pub(crate) started_at: u64,
    pub(crate) ended_at: u64,
    pub(crate) status: &'static str,
    pub(crate) service_name: String,
    pub(crate) attributes: Vec<Attribute>,
    pub(crate) completeness: &'static str,
    pub(crate) is_server_root: bool,
}

#[derive(Clone, Debug)]
pub(crate) struct StoredLog {
    pub(crate) trace_id: String,
    pub(crate) span_id: Option<String>,
    pub(crate) timestamp: u64,
    pub(crate) severity: String,
    pub(crate) body: String,
    pub(crate) attributes: Vec<Attribute>,
}

#[derive(Clone, Copy, Debug, Default)]
pub(crate) struct IngestLoss {
    pub(crate) rejected: u64,
    pub(crate) redacted: u64,
}

#[derive(Clone, Debug)]
pub(crate) struct ObserveStore {
    commands: mpsc::Sender<Command>,
    feed: broadcast::Sender<WatchRequestsResponse>,
    queue_saturation: Arc<AtomicU64>,
}

#[derive(Debug)]
pub(crate) struct ObserveWorker {
    commands: mpsc::Sender<Command>,
    thread: Option<JoinHandle<()>>,
}

#[derive(Debug)]
enum Command {
    IngestSpans {
        spans: Vec<StoredSpan>,
        loss: IngestLoss,
        reply: oneshot::Sender<Result<Vec<Request>, RuntimeFailure>>,
    },
    IngestLogs {
        records: Vec<StoredLog>,
        ingest_loss: IngestLoss,
        reply: oneshot::Sender<Result<(), RuntimeFailure>>,
    },
    RecordDecodeFailure,
    RecordFeedLag,
    ListRequests {
        request: ListRequestsRequest,
        reply: oneshot::Sender<
            Result<Result<ListRequestsResponse, ListRequestsError>, RuntimeFailure>,
        >,
    },
    ReadTrace {
        request: ReadTraceRequest,
        reply: oneshot::Sender<Result<Result<ReadTraceResponse, ReadTraceError>, RuntimeFailure>>,
    },
    ListLogs {
        request: ListTraceLogsRequest,
        reply: oneshot::Sender<
            Result<Result<ListTraceLogsResponse, ListTraceLogsError>, RuntimeFailure>,
        >,
    },
    Health {
        request: ReadIngestionHealthRequest,
        queue_depth: usize,
        queue_saturation: u64,
        reply: oneshot::Sender<
            Result<Result<ReadIngestionHealthResponse, ReadIngestionHealthError>, RuntimeFailure>,
        >,
    },
    Shutdown {
        reply: oneshot::Sender<()>,
    },
}

#[derive(Clone, Debug)]
pub(crate) struct StoreConfig {
    pub(crate) database: PathBuf,
    pub(crate) source_id: String,
    pub(crate) retention_days: u32,
    pub(crate) retention_bytes: u64,
}

impl ObserveWorker {
    pub(crate) async fn start(config: StoreConfig) -> Result<(ObserveStore, Self), RuntimeFailure> {
        let (commands, mut receiver) = mpsc::channel(COMMAND_CAPACITY);
        let (feed, _) = broadcast::channel(FEED_CAPACITY);
        let queue_saturation = Arc::new(AtomicU64::new(0));
        let (ready, readiness) = oneshot::channel();
        let thread = std::thread::Builder::new()
            .name("lenso-observe-sqlite".to_owned())
            .spawn(move || {
                let connection = prepare_connection(&config);
                let running = connection.is_ok();
                let _ = ready.send(connection.as_ref().map(|_| ()).map_err(Clone::clone));
                if !running {
                    return;
                }
                let connection = connection.expect("checked above");
                while let Some(command) = receiver.blocking_recv() {
                    match command {
                        Command::IngestSpans { spans, loss, reply } => {
                            let _ = reply.send(ingest_spans(&connection, &config, &spans, loss));
                        }
                        Command::IngestLogs {
                            records,
                            ingest_loss,
                            reply,
                        } => {
                            let _ = reply.send(ingest_logs(
                                &connection,
                                &config,
                                &records,
                                ingest_loss,
                            ));
                        }
                        Command::RecordDecodeFailure => {
                            increment(&connection, "decode_failures", 1);
                        }
                        Command::RecordFeedLag => increment(&connection, "feed_lag", 1),
                        Command::ListRequests { request, reply } => {
                            let _ = reply.send(list_requests(&connection, &config, request));
                        }
                        Command::ReadTrace { request, reply } => {
                            let _ = reply.send(read_trace(&connection, &config, request));
                        }
                        Command::ListLogs { request, reply } => {
                            let _ = reply.send(list_logs(&connection, &config, request));
                        }
                        Command::Health {
                            request,
                            queue_depth,
                            queue_saturation,
                            reply,
                        } => {
                            let _ = reply.send(health(
                                &connection,
                                &config,
                                &request,
                                queue_depth,
                                queue_saturation,
                            ));
                        }
                        Command::Shutdown { reply } => {
                            let _ = reply.send(());
                            break;
                        }
                    }
                }
            })
            .map_err(|error| {
                store_failure(format!("Observe database worker failed to start: {error}"))
            })?;
        readiness
            .await
            .map_err(|_| store_failure("Observe database worker stopped during startup"))??;
        let store = ObserveStore {
            commands: commands.clone(),
            feed,
            queue_saturation,
        };
        Ok((
            store,
            Self {
                commands,
                thread: Some(thread),
            },
        ))
    }

    pub(crate) async fn shutdown(mut self) -> Result<(), RuntimeFailure> {
        let (reply, receive) = oneshot::channel();
        self.commands
            .send(Command::Shutdown { reply })
            .await
            .map_err(|_| store_failure("Observe database worker is unavailable"))?;
        receive
            .await
            .map_err(|_| store_failure("Observe database worker stopped before shutdown"))?;
        let thread = self.thread.take().expect("worker thread exists");
        thread
            .join()
            .map_err(|_| store_failure("Observe database worker panicked"))?;
        Ok(())
    }
}

impl ObserveStore {
    pub(crate) fn subscribe(&self) -> broadcast::Receiver<WatchRequestsResponse> {
        self.feed.subscribe()
    }

    pub(crate) async fn ingest_spans(
        &self,
        spans: Vec<StoredSpan>,
        loss: IngestLoss,
    ) -> Result<usize, RuntimeFailure> {
        let (reply, receive) = oneshot::channel();
        self.commands
            .try_send(Command::IngestSpans { spans, loss, reply })
            .map_err(|error| {
                self.queue_saturation.fetch_add(1, Ordering::Relaxed);
                store_failure(format!(
                    "Observe ingestion queue is full or closed: {error}"
                ))
            })?;
        let requests = receive
            .await
            .map_err(|_| store_failure("Observe database worker stopped"))??;
        for request in &requests {
            let item = watch_item(request);
            if self.feed.send(item).is_err() {
                // No active subscriber is not loss. Lag is counted by subscribers that observe it.
            }
        }
        Ok(requests.len())
    }

    pub(crate) async fn ingest_logs(
        &self,
        records: Vec<StoredLog>,
        ingest_loss: IngestLoss,
    ) -> Result<(), RuntimeFailure> {
        let (reply, receive) = oneshot::channel();
        self.commands
            .try_send(Command::IngestLogs {
                records,
                ingest_loss,
                reply,
            })
            .map_err(|error| {
                self.queue_saturation.fetch_add(1, Ordering::Relaxed);
                store_failure(format!(
                    "Observe ingestion queue is full or closed: {error}"
                ))
            })?;
        receive
            .await
            .map_err(|_| store_failure("Observe database worker stopped"))?
    }

    pub(crate) fn record_decode_failure(&self) {
        if self
            .commands
            .try_send(Command::RecordDecodeFailure)
            .is_err()
        {
            self.queue_saturation.fetch_add(1, Ordering::Relaxed);
        }
    }
    pub(crate) fn record_feed_lag(&self) {
        let _ = self.commands.try_send(Command::RecordFeedLag);
    }

    pub(crate) async fn list_requests(
        &self,
        request: ListRequestsRequest,
    ) -> Result<Result<ListRequestsResponse, ListRequestsError>, RuntimeFailure> {
        self.call(|reply| Command::ListRequests { request, reply })
            .await?
    }

    pub(crate) async fn read_trace(
        &self,
        request: ReadTraceRequest,
    ) -> Result<Result<ReadTraceResponse, ReadTraceError>, RuntimeFailure> {
        self.call(|reply| Command::ReadTrace { request, reply })
            .await?
    }

    pub(crate) async fn list_logs(
        &self,
        request: ListTraceLogsRequest,
    ) -> Result<Result<ListTraceLogsResponse, ListTraceLogsError>, RuntimeFailure> {
        self.call(|reply| Command::ListLogs { request, reply })
            .await?
    }

    pub(crate) async fn health(
        &self,
        request: ReadIngestionHealthRequest,
    ) -> Result<Result<ReadIngestionHealthResponse, ReadIngestionHealthError>, RuntimeFailure> {
        let queue_depth = self.commands.max_capacity() - self.commands.capacity();
        let queue_saturation = self.queue_saturation.load(Ordering::Relaxed);
        self.call(|reply| Command::Health {
            request,
            queue_depth,
            queue_saturation,
            reply,
        })
        .await?
    }

    async fn call<T>(
        &self,
        command: impl FnOnce(oneshot::Sender<T>) -> Command,
    ) -> Result<T, RuntimeFailure> {
        let (reply, receive) = oneshot::channel();
        self.commands
            .send(command(reply))
            .await
            .map_err(|_| store_failure("Observe database worker is unavailable"))?;
        receive
            .await
            .map_err(|_| store_failure("Observe database worker stopped"))
    }
}

fn prepare_connection(config: &StoreConfig) -> Result<Connection, RuntimeFailure> {
    if let Some(parent) = config.database.parent() {
        std::fs::create_dir_all(parent).map_err(store_failure)?;
    }
    let connection = Connection::open(&config.database).map_err(store_failure)?;
    connection.execute_batch(SCHEMA).map_err(store_failure)?;
    connection.execute("INSERT INTO receiver_state(singleton, receiver_epoch, accepted_spans, accepted_logs, rejected_records, decode_failures, queue_saturation, redacted_attributes, retention_deletions, feed_lag) VALUES (1, ?1, 0, 0, 0, 0, 0, 0, 0, 0) ON CONFLICT(singleton) DO UPDATE SET receiver_epoch = excluded.receiver_epoch, accepted_spans = 0, accepted_logs = 0, rejected_records = 0, decode_failures = 0, queue_saturation = 0, redacted_attributes = 0, retention_deletions = 0, feed_lag = 0", [uuid::Uuid::new_v4().to_string()]).map_err(store_failure)?;
    Ok(connection)
}

fn ingest_spans(
    connection: &Connection,
    config: &StoreConfig,
    spans: &[StoredSpan],
    loss: IngestLoss,
) -> Result<Vec<Request>, RuntimeFailure> {
    let transaction = connection.unchecked_transaction().map_err(store_failure)?;
    let mut requests = Vec::new();
    for span in spans {
        transaction.execute("INSERT INTO spans(source_id, trace_id, span_id, parent_span_id, name, kind, started_at, ended_at, status, service_name, attributes_json, completeness, is_server_root) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13) ON CONFLICT(source_id, trace_id, span_id) DO UPDATE SET parent_span_id=excluded.parent_span_id, name=excluded.name, kind=excluded.kind, started_at=excluded.started_at, ended_at=excluded.ended_at, status=excluded.status, service_name=excluded.service_name, attributes_json=excluded.attributes_json, completeness=excluded.completeness, is_server_root=excluded.is_server_root", params![config.source_id, span.trace_id, span.span_id, span.parent_span_id, span.name, span.kind, to_i64(span.started_at)?, to_i64(span.ended_at)?, span.status, span.service_name, serde_json::to_string(&span.attributes).map_err(store_failure)?, span.completeness, i64::from(span.is_server_root)]).map_err(store_failure)?;
        if span.is_server_root {
            requests.push(request_from_span(span));
        }
    }
    transaction.execute("UPDATE receiver_state SET accepted_spans = accepted_spans + ?1, rejected_records = rejected_records + ?2, redacted_attributes = redacted_attributes + ?3 WHERE singleton = 1", params![to_i64(spans.len() as u64)?, to_i64(loss.rejected)?, to_i64(loss.redacted)?]).map_err(store_failure)?;
    transaction.commit().map_err(store_failure)?;
    enforce_retention(connection, config)?;
    Ok(requests)
}

fn ingest_logs(
    connection: &Connection,
    config: &StoreConfig,
    records: &[StoredLog],
    ingest_loss: IngestLoss,
) -> Result<(), RuntimeFailure> {
    let transaction = connection.unchecked_transaction().map_err(store_failure)?;
    for log in records {
        transaction.execute("INSERT INTO logs(source_id, trace_id, span_id, timestamp, severity, body, attributes_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)", params![config.source_id, log.trace_id, log.span_id, to_i64(log.timestamp)?, log.severity, log.body, serde_json::to_string(&log.attributes).map_err(store_failure)?]).map_err(store_failure)?;
    }
    transaction.execute("UPDATE receiver_state SET accepted_logs = accepted_logs + ?1, rejected_records = rejected_records + ?2, redacted_attributes = redacted_attributes + ?3 WHERE singleton = 1", params![to_i64(records.len() as u64)?, to_i64(ingest_loss.rejected)?, to_i64(ingest_loss.redacted)?]).map_err(store_failure)?;
    transaction.commit().map_err(store_failure)?;
    enforce_retention(connection, config)
}

fn list_requests(
    connection: &Connection,
    config: &StoreConfig,
    request: ListRequestsRequest,
) -> Result<Result<ListRequestsResponse, ListRequestsError>, RuntimeFailure> {
    if request.source_id != config.source_id || !(1..=100).contains(&request.limit) {
        return Ok(Err(ListRequestsError::InvalidQuery));
    }
    let cursor = optional_string(request.cursor)
        .map(parse_request_cursor)
        .transpose()
        .map_err(|()| ListRequestsError::ExpiredCursor);
    let cursor = match cursor {
        Ok(cursor) => cursor,
        Err(error) => return Ok(Err(error)),
    };
    let mut statement = connection.prepare("SELECT trace_id, name, started_at, ended_at, status, service_name, attributes_json, completeness FROM spans WHERE source_id=?1 AND is_server_root=1 AND (?2 IS NULL OR started_at < ?2 OR (started_at = ?2 AND trace_id < ?3)) ORDER BY started_at DESC, trace_id DESC LIMIT ?4").map_err(store_failure)?;
    let (cursor_time, cursor_id) = cursor.map_or((None, None), |(time, id)| (Some(time), Some(id)));
    let rows = statement
        .query_map(
            params![config.source_id, cursor_time, cursor_id, request.limit],
            |row| {
                let attrs: String = row.get(6)?;
                Ok(request_from_row(RequestRow {
                    trace_id: row.get(0)?,
                    name: row.get(1)?,
                    started: row.get(2)?,
                    ended: row.get(3)?,
                    status: row.get(4)?,
                    service_name: row.get(5)?,
                    attributes_json: attrs,
                    completeness: row.get(7)?,
                }))
            },
        )
        .map_err(store_failure)?;
    let requests = rows.collect::<Result<Vec<_>, _>>().map_err(store_failure)?;
    let limit = usize::try_from(request.limit).expect("validated positive request limit");
    let next_cursor = (requests.len() == limit)
        .then(|| {
            requests
                .last()
                .map(|item| encode_request_cursor(&item.started_at_unix_nano, &item.trace_id))
        })
        .flatten();
    let epoch = connection
        .query_row(
            "SELECT receiver_epoch FROM receiver_state WHERE singleton=1",
            [],
            |row| row.get(0),
        )
        .map_err(store_failure)?;
    Ok(Ok(ListRequestsResponse {
        next_cursor,
        receiver_epoch: epoch,
        requests,
    }))
}

fn read_trace(
    connection: &Connection,
    config: &StoreConfig,
    request: ReadTraceRequest,
) -> Result<Result<ReadTraceResponse, ReadTraceError>, RuntimeFailure> {
    if request.source_id != config.source_id || !valid_hex(&request.trace_id, 32) {
        return Ok(Err(ReadTraceError::InvalidQuery));
    }
    let mut statement = connection.prepare("SELECT span_id, parent_span_id, name, kind, started_at, ended_at, status, attributes_json, completeness FROM spans WHERE source_id=?1 AND trace_id=?2 ORDER BY started_at, span_id LIMIT 2001").map_err(store_failure)?;
    let rows = statement
        .query_map(params![config.source_id, request.trace_id], |row| {
            let attrs: String = row.get(7)?;
            Ok((
                ReadTraceResponseSpansItem {
                    attributes: trace_attributes(&attrs),
                    ended_at_unix_nano: from_i64(row.get(5)?),
                    kind: parse_span_kind(&row.get::<_, String>(3)?),
                    name: row.get(2)?,
                    parent_span_id: row.get(1)?,
                    span_id: row.get(0)?,
                    started_at_unix_nano: from_i64(row.get(4)?),
                    status: parse_status(&row.get::<_, String>(6)?),
                },
                row.get::<_, String>(8)?,
            ))
        })
        .map_err(store_failure)?;
    let mut completeness = ReadTraceResponseCompleteness::Complete;
    let mut spans = Vec::new();
    for row in rows {
        let (span, state) = row.map_err(store_failure)?;
        completeness = merge_completeness(completeness, &state);
        spans.push(span);
    }
    if spans.is_empty() {
        return Ok(Err(ReadTraceError::NotFound));
    }
    if spans.len() > 2000 {
        return Ok(Err(ReadTraceError::ResourceExhausted));
    }
    Ok(Ok(ReadTraceResponse {
        completeness,
        spans,
        trace_id: request.trace_id,
    }))
}

fn list_logs(
    connection: &Connection,
    config: &StoreConfig,
    request: ListTraceLogsRequest,
) -> Result<Result<ListTraceLogsResponse, ListTraceLogsError>, RuntimeFailure> {
    if request.source_id != config.source_id
        || !valid_hex(&request.trace_id, 32)
        || !(1..=200).contains(&request.limit)
    {
        return Ok(Err(ListTraceLogsError::InvalidQuery));
    }
    let span = optional_string(request.span_id);
    if span.as_ref().is_some_and(|value| !valid_hex(value, 16)) {
        return Ok(Err(ListTraceLogsError::InvalidQuery));
    }
    let cursor = optional_string(request.cursor)
        .map(parse_log_cursor)
        .transpose();
    let Ok(cursor) = cursor else {
        return Ok(Err(ListTraceLogsError::ExpiredCursor));
    };
    let (cursor_time, cursor_id) = cursor.map_or((None, None), |(time, id)| (Some(time), Some(id)));
    let mut statement = connection.prepare("SELECT id, timestamp, span_id, severity, body, attributes_json FROM logs WHERE source_id=?1 AND trace_id=?2 AND (?3 IS NULL OR span_id=?3) AND (?4 IS NULL OR timestamp > ?4 OR (timestamp=?4 AND id>?5)) ORDER BY timestamp, id LIMIT ?6").map_err(store_failure)?;
    let rows = statement
        .query_map(
            params![
                config.source_id,
                request.trace_id,
                span,
                cursor_time,
                cursor_id,
                request.limit
            ],
            |row| {
                let attrs: String = row.get(5)?;
                Ok((
                    row.get::<_, i64>(0)?,
                    ListTraceLogsResponseLogsItem {
                        attributes: log_attributes(&attrs),
                        body: row.get(4)?,
                        severity: row.get(3)?,
                        span_id: row.get(2)?,
                        timestamp_unix_nano: from_i64(row.get(1)?),
                    },
                ))
            },
        )
        .map_err(store_failure)?;
    let rows = rows.collect::<Result<Vec<_>, _>>().map_err(store_failure)?;
    let limit = usize::try_from(request.limit).expect("validated positive log limit");
    let next_cursor = (rows.len() == limit)
        .then(|| {
            rows.last()
                .map(|(id, item)| encode_log_cursor(&item.timestamp_unix_nano, *id))
        })
        .flatten();
    Ok(Ok(ListTraceLogsResponse {
        logs: rows.into_iter().map(|(_, item)| item).collect(),
        next_cursor,
    }))
}

fn health(
    connection: &Connection,
    config: &StoreConfig,
    request: &ReadIngestionHealthRequest,
    queue_depth: usize,
    queue_saturation: u64,
) -> Result<Result<ReadIngestionHealthResponse, ReadIngestionHealthError>, RuntimeFailure> {
    if request.source_id != config.source_id {
        return Ok(Err(ReadIngestionHealthError::InvalidQuery));
    }
    let queue_depth = i64::try_from(queue_depth).unwrap_or(i64::MAX);
    let queue_saturation = i64::try_from(queue_saturation).unwrap_or(i64::MAX);
    let response = connection.query_row("SELECT receiver_epoch, accepted_spans, accepted_logs, rejected_records, decode_failures, queue_saturation, redacted_attributes, retention_deletions, feed_lag FROM receiver_state WHERE singleton=1", [], |row| Ok(ReadIngestionHealthResponse { receiver_epoch: row.get(0)?, accepted_spans: from_i64(row.get(1)?), accepted_logs: from_i64(row.get(2)?), rejected_records: from_i64(row.get(3)?), decode_failures: from_i64(row.get(4)?), queue_saturation: from_i64(row.get::<_, i64>(5)?.saturating_add(queue_saturation)), redacted_attributes: from_i64(row.get(6)?), retention_deletions: from_i64(row.get(7)?), feed_lag: from_i64(row.get(8)?), queue_depth, retention_days: i64::from(config.retention_days), retention_bytes: config.retention_bytes.to_string() })).map_err(store_failure)?;
    Ok(Ok(response))
}

fn enforce_retention(connection: &Connection, config: &StoreConfig) -> Result<(), RuntimeFailure> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(store_failure)?
        .as_nanos();
    let cutoff = now.saturating_sub(u128::from(config.retention_days) * 86_400_000_000_000);
    let cutoff = i64::try_from(cutoff.min(i64::MAX as u128)).map_err(store_failure)?;
    let deleted_spans = connection
        .execute(
            "DELETE FROM spans WHERE source_id=?1 AND ended_at < ?2",
            params![config.source_id, cutoff],
        )
        .map_err(store_failure)?;
    let deleted_logs = connection
        .execute(
            "DELETE FROM logs WHERE source_id=?1 AND timestamp < ?2",
            params![config.source_id, cutoff],
        )
        .map_err(store_failure)?;
    let mut logical_bytes: i64 = connection.query_row("SELECT COALESCE((SELECT SUM(length(name)+length(attributes_json)+256) FROM spans WHERE source_id=?1),0)+COALESCE((SELECT SUM(length(body)+length(attributes_json)+128) FROM logs WHERE source_id=?1),0)", [&config.source_id], |row| row.get(0)).map_err(store_failure)?;
    let mut size_deleted = 0usize;
    while u64::try_from(logical_bytes).unwrap_or(u64::MAX) > config.retention_bytes {
        let trace: Option<String> = connection
            .query_row(
                "SELECT trace_id FROM spans WHERE source_id=?1 ORDER BY started_at LIMIT 1",
                [&config.source_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(store_failure)?;
        let Some(trace) = trace else {
            break;
        };
        size_deleted += connection
            .execute(
                "DELETE FROM logs WHERE source_id=?1 AND trace_id=?2",
                params![config.source_id, trace],
            )
            .map_err(store_failure)?;
        size_deleted += connection
            .execute(
                "DELETE FROM spans WHERE source_id=?1 AND trace_id=?2",
                params![config.source_id, trace],
            )
            .map_err(store_failure)?;
        logical_bytes = connection.query_row("SELECT COALESCE((SELECT SUM(length(name)+length(attributes_json)+256) FROM spans WHERE source_id=?1),0)+COALESCE((SELECT SUM(length(body)+length(attributes_json)+128) FROM logs WHERE source_id=?1),0)", [&config.source_id], |row| row.get(0)).map_err(store_failure)?;
    }
    let deleted = deleted_spans
        .saturating_add(deleted_logs)
        .saturating_add(size_deleted);
    if deleted > 0 {
        increment(connection, "retention_deletions", deleted as u64);
    }
    Ok(())
}

fn increment(connection: &Connection, column: &str, amount: u64) {
    debug_assert!(matches!(
        column,
        "decode_failures" | "feed_lag" | "retention_deletions"
    ));
    let statement = format!("UPDATE receiver_state SET {column}={column}+?1 WHERE singleton=1");
    let _ = connection.execute(&statement, [i64::try_from(amount).unwrap_or(i64::MAX)]);
}

fn request_from_span(span: &StoredSpan) -> Request {
    let method =
        attribute(&span.attributes, &["http.request.method", "http.method"]).unwrap_or("HTTP");
    let route = attribute(&span.attributes, &["http.route", "url.path"]).unwrap_or(&span.name);
    let status_code = attribute(
        &span.attributes,
        &["http.response.status_code", "http.status_code"],
    )
    .and_then(|value| value.parse().ok())
    .unwrap_or(0);
    Request {
        completeness: parse_request_completeness(span.completeness),
        duration_nano: span.ended_at.saturating_sub(span.started_at).to_string(),
        has_error: span.status == "error" || status_code >= 500,
        method: method.to_owned(),
        route: route.to_owned(),
        service_name: span.service_name.clone(),
        started_at_unix_nano: span.started_at.to_string(),
        status_code,
        trace_id: span.trace_id.clone(),
    }
}

struct RequestRow {
    trace_id: String,
    name: String,
    started: i64,
    ended: i64,
    status: String,
    service_name: String,
    attributes_json: String,
    completeness: String,
}

fn request_from_row(row: RequestRow) -> Request {
    let attributes: Vec<Attribute> = serde_json::from_str(&row.attributes_json).unwrap_or_default();
    let span = StoredSpan {
        trace_id: row.trace_id,
        span_id: String::new(),
        parent_span_id: None,
        name: row.name,
        kind: "server",
        started_at: u64::try_from(row.started).unwrap_or_default(),
        ended_at: u64::try_from(row.ended).unwrap_or_default(),
        status: if row.status == "error" { "error" } else { "ok" },
        service_name: row.service_name,
        attributes,
        completeness: if row.completeness == "partial" {
            "partial"
        } else if row.completeness == "late" {
            "late"
        } else {
            "complete"
        },
        is_server_root: true,
    };
    request_from_span(&span)
}

fn watch_item(request: &Request) -> WatchRequestsResponse {
    WatchRequestsResponse {
        completeness: Some(
            match request.completeness {
                RequestCompleteness::Complete => "complete",
                RequestCompleteness::Partial => "partial",
                RequestCompleteness::Late => "late",
            }
            .to_owned(),
        ),
        dropped_count: "0".to_owned(),
        duration_nano: Some(request.duration_nano.clone()),
        has_error: Some(request.has_error),
        kind: WatchRequestsResponseKind::Request,
        method: Some(request.method.clone()),
        route: Some(request.route.clone()),
        service_name: Some(request.service_name.clone()),
        started_at_unix_nano: Some(request.started_at_unix_nano.clone()),
        status_code: Some(request.status_code),
        trace_id: Some(request.trace_id.clone()),
    }
}

pub(crate) fn lag_item(dropped: u64) -> WatchRequestsResponse {
    WatchRequestsResponse {
        completeness: None,
        dropped_count: dropped.to_string(),
        duration_nano: None,
        has_error: None,
        kind: WatchRequestsResponseKind::Lag,
        method: None,
        route: None,
        service_name: None,
        started_at_unix_nano: None,
        status_code: None,
        trace_id: None,
    }
}

fn parse_request_completeness(value: &str) -> RequestCompleteness {
    match value {
        "partial" => RequestCompleteness::Partial,
        "late" => RequestCompleteness::Late,
        _ => RequestCompleteness::Complete,
    }
}
fn merge_completeness(
    current: ReadTraceResponseCompleteness,
    value: &str,
) -> ReadTraceResponseCompleteness {
    match (current, value) {
        (_, "partial") => ReadTraceResponseCompleteness::Partial,
        (ReadTraceResponseCompleteness::Complete, "late") => ReadTraceResponseCompleteness::Late,
        (state, _) => state,
    }
}
fn parse_span_kind(value: &str) -> ReadTraceResponseSpansItemKind {
    match value {
        "internal" => ReadTraceResponseSpansItemKind::Internal,
        "server" => ReadTraceResponseSpansItemKind::Server,
        "client" => ReadTraceResponseSpansItemKind::Client,
        "producer" => ReadTraceResponseSpansItemKind::Producer,
        "consumer" => ReadTraceResponseSpansItemKind::Consumer,
        _ => ReadTraceResponseSpansItemKind::Unspecified,
    }
}
fn parse_status(value: &str) -> ReadTraceResponseSpansItemStatus {
    match value {
        "ok" => ReadTraceResponseSpansItemStatus::Ok,
        "error" => ReadTraceResponseSpansItemStatus::Error,
        _ => ReadTraceResponseSpansItemStatus::Unset,
    }
}
fn trace_attributes(value: &str) -> Vec<ReadTraceResponseSpansItemAttributesItem> {
    serde_json::from_str::<Vec<Attribute>>(value)
        .unwrap_or_default()
        .into_iter()
        .map(|item| ReadTraceResponseSpansItemAttributesItem {
            key: item.key,
            value: item.value,
        })
        .collect()
}
fn log_attributes(value: &str) -> Vec<ListTraceLogsResponseLogsItemAttributesItem> {
    serde_json::from_str::<Vec<Attribute>>(value)
        .unwrap_or_default()
        .into_iter()
        .map(|item| ListTraceLogsResponseLogsItemAttributesItem {
            key: item.key,
            value: item.value,
        })
        .collect()
}
fn attribute<'a>(attributes: &'a [Attribute], names: &[&str]) -> Option<&'a str> {
    names.iter().find_map(|name| {
        attributes
            .iter()
            .find(|item| item.key == *name)
            .map(|item| item.value.as_str())
    })
}
fn optional_string(value: OptionalValue<String>) -> Option<String> {
    value.flatten()
}
fn encode_request_cursor(time: &str, id: &str) -> String {
    URL_SAFE_NO_PAD.encode(format!("{time}:{id}"))
}
fn parse_request_cursor(value: String) -> Result<(i64, String), ()> {
    let decoded = URL_SAFE_NO_PAD.decode(value).map_err(|_| ())?;
    let decoded = String::from_utf8(decoded).map_err(|_| ())?;
    let (time, id) = decoded.split_once(':').ok_or(())?;
    let time = time.parse().map_err(|_| ())?;
    valid_hex(id, 32).then(|| (time, id.to_owned())).ok_or(())
}
fn encode_log_cursor(time: &str, id: i64) -> String {
    URL_SAFE_NO_PAD.encode(format!("{time}:{id}"))
}
fn parse_log_cursor(value: String) -> Result<(i64, i64), ()> {
    let decoded = URL_SAFE_NO_PAD.decode(value).map_err(|_| ())?;
    let decoded = String::from_utf8(decoded).map_err(|_| ())?;
    let (time, id) = decoded.split_once(':').ok_or(())?;
    Ok((time.parse().map_err(|_| ())?, id.parse().map_err(|_| ())?))
}
fn valid_hex(value: &str, length: usize) -> bool {
    value.len() == length
        && value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}
fn to_i64(value: u64) -> Result<i64, RuntimeFailure> {
    i64::try_from(value).map_err(store_failure)
}
fn from_i64(value: i64) -> String {
    u64::try_from(value).unwrap_or_default().to_string()
}
fn store_failure(error: impl std::fmt::Display) -> RuntimeFailure {
    RuntimeFailure::PluginFailure {
        detail: format!("Observe storage failed: {error}"),
    }
}
