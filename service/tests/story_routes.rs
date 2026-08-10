use std::collections::BTreeMap;
use std::fmt::Write as _;
use std::sync::Arc;

use axum::body::{Body, to_bytes};
use axum::http::{HeaderName, HeaderValue, Request, StatusCode};
use platform_core::{
    AppConfig, AppContext, AuthConfig, DatabaseConfig, HttpConfig, LoggingEventPublisher,
    ModuleConfig, ModuleSourcesConfig, RedisConfig, ServiceConfig, TelemetryConfig,
    apply_migrations,
};
use platform_testing::TestDatabase;
use serde::Serialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use tower::ServiceExt;

const WORKLOAD_OPERATOR_AUTHORIZATION: &str = "Bearer dev-user:admin:console.system.read,console.workload.read,console.workload.control,console.workload.operation.read";

#[tokio::test]
async fn story_routes_are_owned_by_the_console_composition() {
    let app = app_with_lazy_database();

    let unauthenticated = app
        .clone()
        .oneshot(admin_get("/api/console/v1/stories"))
        .await
        .expect("request should complete");
    assert_eq!(unauthenticated.status(), StatusCode::UNAUTHORIZED);

    let unscoped_user = app
        .clone()
        .oneshot(
            admin_get("/api/console/v1/stories")
                .with_header("authorization", "Bearer dev-user:user_123"),
        )
        .await
        .expect("request should complete");
    assert_eq!(unscoped_user.status(), StatusCode::FORBIDDEN);

    let openapi = app
        .oneshot(public_get("/openapi.json"))
        .await
        .expect("OpenAPI request should complete");
    assert_eq!(openapi.status(), StatusCode::OK);
    let document = json_body(openapi).await;
    assert_eq!(
        document["paths"]["/api/console/v1/stories"]["get"]["operationId"],
        "admin_runtime_list_stories"
    );
    assert_eq!(
        document["paths"]["/api/console/v1/stories/{correlation_id}"]["get"]["operationId"],
        "admin_runtime_get_story"
    );
    assert_eq!(
        document["paths"]["/api/console/v1/stories/{correlation_id}/heatmap"]["get"]["operationId"],
        "admin_runtime_get_story_heatmap"
    );
    assert_eq!(
        document["paths"]["/api/console/v1/stories/{correlation_id}/technical-operations"]["get"]["operationId"],
        "admin_runtime_get_story_technical_operations"
    );
}

#[tokio::test]
async fn console_access_routes_are_published_by_host_composition() {
    let app = app_with_lazy_database();
    let response = app
        .oneshot(public_get("/openapi.json"))
        .await
        .expect("OpenAPI request should complete");
    assert_eq!(response.status(), StatusCode::OK);
    let document = json_body(response).await;

    for path in [
        "/bootstrap/v1/status",
        "/bootstrap/v1/recovery",
        "/api/console/v1/access/users",
        "/api/console/v1/access/organizations",
        "/api/console/v1/access/grants",
        "/api/console/v1/access/effective/{serviceId}",
    ] {
        assert!(document["paths"].get(path).is_some(), "missing {path}");
    }
    assert_eq!(
        document["paths"]["/bootstrap/v1/recovery"]["post"]["operationId"],
        "console_create_bootstrap_superadmin"
    );
    assert_eq!(
        document["paths"]["/api/console/v1/access/grants"]["post"]["operationId"],
        "console_access_create_managed_service_grant"
    );
}

#[tokio::test]
async fn workload_control_routes_are_same_origin_and_authenticated() {
    let app = app_with_lazy_database();

    for request in [
        admin_get("/api/console/v1/systems/support-desk/workload-access/support-service"),
        admin_get("/api/console/v1/systems/support-desk/workloads/support-service/support-api"),
        admin_post(
            "/api/console/v1/systems/support-desk/workloads/support-service/support-api/operations",
            &json!({
                "action": { "kind": "suspend" },
                "observedRevision": "revision-4",
                "idempotencyKey": "control-123"
            }),
        ),
        admin_get(
            "/api/console/v1/systems/support-desk/workloads/support-service/support-api/operations/operation-7",
        ),
    ] {
        let response = app
            .clone()
            .oneshot(request)
            .await
            .expect("request should complete");
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    let openapi = app
        .oneshot(public_get("/openapi.json"))
        .await
        .expect("OpenAPI request should complete");
    let document = json_body(openapi).await;
    assert_eq!(
        document["paths"]["/api/console/v1/systems/{systemId}/workload-access/{serviceId}"]["get"]
            ["operationId"],
        "console_get_effective_workload_access"
    );
    assert_eq!(
        document["paths"]["/api/console/v1/systems/{systemId}/workloads/{serviceId}/{workloadId}"]
            ["get"]["operationId"],
        "console_observe_workload_control"
    );
    assert_eq!(
        document["paths"]["/api/console/v1/systems/{systemId}/workloads/{serviceId}/{workloadId}/operations"]
            ["post"]["operationId"],
        "console_request_workload_control_operation"
    );
    assert!(
        document["paths"]
            ["/api/console/v1/systems/{systemId}/workloads/{serviceId}/{workloadId}/operations"]["post"]
            ["responses"]
            .get("202")
            .is_some()
    );
    assert_eq!(
        document["paths"]["/api/console/v1/systems/{systemId}/workloads/{serviceId}/{workloadId}/operations/{operationId}"]
            ["get"]["operationId"],
        "console_get_workload_control_operation"
    );
    for (path, method, statuses) in [
        (
            "/api/console/v1/systems/{systemId}/workloads/{serviceId}/{workloadId}",
            "get",
            &["200", "500", "502"][..],
        ),
        (
            "/api/console/v1/systems/{systemId}/workloads/{serviceId}/{workloadId}/operations",
            "post",
            &["202", "500", "502"][..],
        ),
        (
            "/api/console/v1/systems/{systemId}/workloads/{serviceId}/{workloadId}/operations/{operationId}",
            "get",
            &["200", "400", "500", "502"][..],
        ),
    ] {
        for status in statuses {
            assert!(
                document["paths"][path][method]["responses"]
                    .get(status)
                    .is_some(),
                "missing {status} for {method} {path}"
            );
        }
    }
    for adapter_path in [
        "/workload-control/v1/observe",
        "/workload-control/v1/operations",
        "/workload-control/v1/operations/{operationId}",
    ] {
        assert!(
            document["paths"].get(adapter_path).is_none(),
            "Adapter route must not be browser-facing: {adapter_path}"
        );
    }
}

#[tokio::test]
async fn unavailable_workload_authority_is_unknown_and_never_queues_mutations() {
    let Some(db) = TestDatabase::create().await else {
        return;
    };
    let app = app_with_database(&db).await;
    insert_unavailable_workload_control_connection(&db).await;

    let access = app
        .clone()
        .oneshot(
            admin_get("/api/console/v1/systems/support-desk/workload-access/support-service")
                .with_header("authorization", WORKLOAD_OPERATOR_AUTHORIZATION),
        )
        .await
        .expect("Workload access request should complete");
    assert_eq!(access.status(), StatusCode::OK);
    assert_eq!(
        json_body(access).await["capabilities"],
        json!([
            "console.workload.read",
            "console.workload.control",
            "console.workload.operation.read"
        ])
    );

    let observation = app
        .clone()
        .oneshot(
            admin_get("/api/console/v1/systems/support-desk/workloads/support-service/support-api")
                .with_header("authorization", WORKLOAD_OPERATOR_AUTHORIZATION),
        )
        .await
        .expect("observation request should complete");
    assert_eq!(observation.status(), StatusCode::OK);
    let observation = json_body(observation).await;
    assert_eq!(observation["protocol"], "lenso.workload-control.v1");
    assert_eq!(observation["state"], "unknown");
    assert!(observation.get("observedRevision").is_none());
    assert!(observation.get("activeOperation").is_none());
    assert!(observation.get("adapterId").is_none());

    let mutation = app
        .clone()
        .oneshot(
            admin_post(
                "/api/console/v1/systems/support-desk/workloads/support-service/support-api/operations",
                &json!({
                    "action": { "kind": "suspend" },
                    "observedRevision": "revision-4",
                    "idempotencyKey": "control-123"
                }),
            )
            .with_header("authorization", WORKLOAD_OPERATOR_AUTHORIZATION),
        )
        .await
        .expect("mutation request should complete");
    assert_eq!(mutation.status(), StatusCode::BAD_GATEWAY);
    assert!(
        json_body(mutation).await["detail"]
            .as_str()
            .is_some_and(|message| message.contains("not queued"))
    );

    let operation = app
        .oneshot(
            admin_get(
                "/api/console/v1/systems/support-desk/workloads/support-service/support-api/operations/operation-7",
            )
                .with_header("authorization", WORKLOAD_OPERATOR_AUTHORIZATION),
        )
        .await
        .expect("operation request should complete");
    assert_eq!(operation.status(), StatusCode::NOT_FOUND);

    db.cleanup().await;
}

#[tokio::test]
async fn terminal_workload_failure_response_uses_console_owned_text() {
    let Some(db) = TestDatabase::create().await else {
        return;
    };
    let app = app_with_database(&db).await;
    insert_unavailable_workload_control_connection(&db).await;
    insert_terminal_workload_failure(&db).await;

    let response = app
        .oneshot(
            admin_get(
                "/api/console/v1/systems/support-desk/workloads/support-service/support-api/operations/operation-7",
            )
            .with_header("authorization", WORKLOAD_OPERATOR_AUTHORIZATION),
        )
        .await
        .expect("terminal operation request should complete");
    assert_eq!(response.status(), StatusCode::OK);
    let operation = json_body(response).await;
    assert_eq!(
        operation["failure"]["message"],
        "Workload Control authority became unavailable"
    );
    let operation = operation.to_string();
    assert!(!operation.contains("adapter-secret"));
    assert!(!operation.contains("provider detail"));

    db.cleanup().await;
}

#[tokio::test]
async fn service_scoped_grants_do_not_authorize_whole_system_access() {
    let Some(db) = TestDatabase::create().await else {
        return;
    };
    let app = app_with_database(&db).await;
    insert_scoped_registry_reader(&db).await;
    let authorization = "Bearer dev-user:user_123";
    let connect_request = empty_system_connect_request();

    let registry = app
        .clone()
        .oneshot(admin_get("/api/console/v1/services").with_header("authorization", authorization))
        .await
        .expect("scoped Registry request should complete");
    assert_eq!(registry.status(), StatusCode::OK);
    let registry = json_body(registry).await;
    assert_eq!(registry.as_array().map(Vec::len), Some(1));
    assert_eq!(registry[0]["serviceId"], "support-service");

    let system = app
        .clone()
        .oneshot(admin_get("/api/console/v1/system").with_header("authorization", authorization))
        .await
        .expect("whole-System read should complete");
    assert_eq!(system.status(), StatusCode::FORBIDDEN);

    let connect = app
        .clone()
        .oneshot(
            admin_post("/api/console/v1/system/connect", &connect_request)
                .with_header("authorization", authorization),
        )
        .await
        .expect("whole-System connect should complete");
    assert_eq!(connect.status(), StatusCode::FORBIDDEN);

    let directly_authorized_connect = app
        .clone()
        .oneshot(
            admin_post("/api/console/v1/system/connect", &connect_request).with_header(
                "authorization",
                "Bearer dev-user:user_456:console.system.connect",
            ),
        )
        .await
        .expect("directly authorized whole-System connect should complete");
    assert_eq!(directly_authorized_connect.status(), StatusCode::OK);

    let directly_authorized_system = app
        .oneshot(admin_get("/api/console/v1/system").with_header(
            "authorization",
            "Bearer dev-user:user_456:console.system.read",
        ))
        .await
        .expect("directly authorized whole-System read should complete");
    assert_eq!(directly_authorized_system.status(), StatusCode::OK);

    db.cleanup().await;
}

#[tokio::test]
async fn story_list_detail_cursor_heatmap_and_not_found_behaviors_remain() {
    let Some(db) = TestDatabase::create().await else {
        return;
    };
    let app = app_with_database(&db).await;
    insert_story_evidence(&db).await;

    let list = app
        .clone()
        .oneshot(
            admin_get("/api/console/v1/stories?limit=1")
                .with_header("authorization", "Bearer dev-service:admin"),
        )
        .await
        .expect("story list request should complete");
    assert_eq!(list.status(), StatusCode::OK);
    let list = json_body(list).await;
    assert_eq!(list["data"][0]["correlation_id"], "corr_story");
    assert_eq!(list["page"]["limit"], 1);
    let cursor = list["page"]["next_created_before"]
        .as_str()
        .expect("first page should provide a cursor");

    let second_page = app
        .clone()
        .oneshot(
            admin_get(&format!(
                "/api/console/v1/stories?limit=1&created_before={cursor}"
            ))
            .with_header("authorization", "Bearer dev-service:admin"),
        )
        .await
        .expect("second story page request should complete");
    assert_eq!(second_page.status(), StatusCode::OK);
    let second_page = json_body(second_page).await;
    assert_eq!(second_page["data"][0]["correlation_id"], "corr_old");
    assert_eq!(second_page["data"][0]["node_count"], 2);

    let detail = app
        .clone()
        .oneshot(
            admin_get("/api/console/v1/stories/corr_story")
                .with_header("authorization", "Bearer dev-service:admin"),
        )
        .await
        .expect("story detail request should complete");
    assert_eq!(detail.status(), StatusCode::OK);
    let detail = json_body(detail).await;
    assert_eq!(detail["data"]["summary"]["correlation_id"], "corr_story");
    assert!(
        detail["data"]["nodes"]
            .as_array()
            .is_some_and(|nodes| nodes.iter().any(|node| node["type"] == "event"))
    );

    let operations = app
        .clone()
        .oneshot(
            admin_get("/api/console/v1/stories/corr_story/technical-operations")
                .with_header("authorization", "Bearer dev-service:admin"),
        )
        .await
        .expect("technical operations request should complete");
    assert_eq!(operations.status(), StatusCode::OK);
    assert!(json_body(operations).await["data"].is_array());

    let heatmap = app
        .clone()
        .oneshot(
            admin_get("/api/console/v1/stories/corr_story/heatmap?bucket_seconds=60&limit=20")
                .with_header("authorization", "Bearer dev-service:admin"),
        )
        .await
        .expect("story heatmap request should complete");
    assert_eq!(heatmap.status(), StatusCode::OK);
    let heatmap = json_body(heatmap).await;
    assert_eq!(heatmap["bucket_seconds"], 60);
    assert_eq!(heatmap["data"].as_array().map(Vec::len), Some(3));
    assert_eq!(heatmap["data"][0]["service"], "api");
    assert_eq!(heatmap["data"][0]["node_type"], "http_request");
    assert_eq!(heatmap["data"][0]["error_count"], 0);
    assert_eq!(heatmap["data"][1]["service"], "identity");
    assert_eq!(heatmap["data"][1]["node_type"], "event");
    assert_eq!(heatmap["data"][2]["service"], "notifications");
    assert_eq!(heatmap["data"][2]["node_type"], "function");
    assert_eq!(heatmap["data"][2]["dead_count"], 1);

    let missing = app
        .clone()
        .oneshot(
            admin_get("/api/console/v1/stories/missing")
                .with_header("authorization", "Bearer dev-service:admin"),
        )
        .await
        .expect("missing story request should complete");
    assert_eq!(missing.status(), StatusCode::NOT_FOUND);

    let missing_heatmap = app
        .oneshot(
            admin_get("/api/console/v1/stories/missing/heatmap")
                .with_header("authorization", "Bearer dev-service:admin"),
        )
        .await
        .expect("missing story heatmap request should complete");
    assert_eq!(missing_heatmap.status(), StatusCode::NOT_FOUND);
    assert_eq!(json_body(missing_heatmap).await["code"], "not_found");

    db.cleanup().await;
}

fn app_with_lazy_database() -> axum::Router {
    let config = test_config();
    let ctx = AppContext::new(
        config,
        platform_core::DbPool::connect_lazy("postgres://localhost/lenso_console_test")
            .expect("lazy pool should build"),
        Arc::new(LoggingEventPublisher),
    );
    let composition = lenso_console_service::host_composition();
    lenso_api::try_build_router_with_composition(ctx, &composition)
        .expect("Console router should build")
}

async fn app_with_database(db: &TestDatabase) -> axum::Router {
    let mut config = test_config();
    config.database = DatabaseConfig {
        url: db.url.clone(),
        max_connections: 5,
    };
    let composition = lenso_console_service::host_composition();
    let migrations = lenso_bootstrap::migrations_for_config_with_composition(&config, &composition)
        .expect("Console migrations should compose");
    apply_migrations(&db.pool, &migrations)
        .await
        .expect("Console migrations should apply");

    let ctx = AppContext::new(config, db.pool.clone(), Arc::new(LoggingEventPublisher));
    lenso_api::try_build_router_with_composition(ctx, &composition)
        .expect("Console router should build")
}

fn test_config() -> AppConfig {
    let http = HttpConfig {
        host: "127.0.0.1".to_owned(),
        ..HttpConfig::default()
    };
    let module_sources = ModuleSourcesConfig {
        linked_profile: "core".to_owned(),
    };

    AppConfig {
        service: ServiceConfig {
            name: "lenso-console".to_owned(),
            environment: "local".to_owned(),
        },
        database: DatabaseConfig {
            url: "postgres://localhost/lenso_console_test".to_owned(),
            max_connections: 5,
        },
        redis: RedisConfig::default(),
        http,
        telemetry: TelemetryConfig::default(),
        auth: AuthConfig::default(),
        module_sources,
        modules: BTreeMap::from([(
            "platform-story".to_owned(),
            ModuleConfig {
                enabled: Some(false),
                values: BTreeMap::new(),
            },
        )]),
    }
}

async fn insert_story_evidence(db: &TestDatabase) {
    sqlx::query(
        r"
        insert into platform.outbox (
            id, event_name, event_version, source_module, aggregate_type,
            aggregate_id, correlation_id, causation_id, occurred_at, payload,
            headers, status, attempts, max_attempts, locked_at, published_at, created_at
        ) values
            (
                'evt_story', 'identity.user_registered.v1', 1, 'identity', 'user',
                'usr_1', 'corr_story', 'req_story', '2026-05-31T00:10:00Z', $1,
                '{}'::jsonb, 'published', 1, 3, '2026-05-31T00:10:05Z',
                '2026-05-31T00:10:20Z', '2026-05-31T00:10:00Z'
            ),
            (
                'evt_old_a', 'identity.user_registered.v1', 1, 'identity', 'user',
                'usr_old_a', 'corr_old', 'req_old_a', '2026-05-31T00:00:00Z', $1,
                '{}'::jsonb, 'published', 1, 3, '2026-05-31T00:00:01Z',
                '2026-05-31T00:00:02Z', '2026-05-31T00:00:00Z'
            ),
            (
                'evt_old_b', 'identity.user_registered.v1', 1, 'identity', 'user',
                'usr_old_b', 'corr_old', 'req_old_b', '2026-05-31T00:05:00Z', $1,
                '{}'::jsonb, 'published', 1, 3, '2026-05-31T00:05:01Z',
                '2026-05-31T00:05:02Z', '2026-05-31T00:05:00Z'
            )
        ",
    )
    .bind(json!({ "user_id": "usr_1" }))
    .execute(&db.pool)
    .await
    .expect("story outbox event should insert");

    sqlx::query(
        r"
        insert into platform.story_events (
            id, source_type, source_id, node_type, name, status, service,
            correlation_id, causation_id, started_at, completed_at, duration_ms,
            error, metadata, trace_id, span_id, created_at, updated_at
        ) values
            (
                'story_heatmap_http', 'http_request', 'req_story', 'http_request',
                'POST /identity/users', 'completed', 'api', 'corr_story', null,
                '2026-05-31T00:10:10Z', '2026-05-31T00:10:10.120Z', 120,
                null, '{}'::jsonb, 'trace_story', 'span_story_1',
                '2026-05-31T00:10:10Z', '2026-05-31T00:10:10.120Z'
            ),
            (
                'story_heatmap_fn_dead', 'function_run', 'fnrun_story_dead', 'function',
                'notifications.send_welcome_email.v1', 'dead', 'notifications',
                'corr_story', 'story_heatmap_http', '2026-05-31T00:10:40Z',
                '2026-05-31T00:12:00Z', 80000, 'smtp timeout', '{}'::jsonb,
                'trace_story', 'span_story_2', '2026-05-31T00:10:40Z',
                '2026-05-31T00:12:00Z'
            )
        ",
    )
    .execute(&db.pool)
    .await
    .expect("story heatmap events should insert");
}

async fn insert_unavailable_workload_control_connection(db: &TestDatabase) {
    sqlx::query(
        "insert into console.system_connections \
            (system_id, topology_digest, topology, management_binding, version) \
         values ($1, $2, $3, $4, 1)",
    )
    .bind("support-desk")
    .bind(format!("sha256:{}", "a".repeat(64)))
    .bind(json!({
        "protocol": "lenso.system.v2",
        "systemId": "support-desk",
        "services": [{
            "serviceId": "support-service",
            "servicePrincipal": "svc.support-service",
            "revision": 1,
            "workloads": [
                { "workloadId": "support-api", "role": "api" },
                { "workloadId": "support-control-runtime", "role": "control_adapter" }
            ]
        }],
        "modules": [],
        "adapters": [{
            "adapterId": "support-control",
            "capabilities": [],
            "workload": {
                "systemId": "support-desk",
                "serviceId": "support-service",
                "workloadId": "support-control-runtime"
            },
            "workloadControl": {
                "protocol": "lenso.workload-control.v1",
                "schemaDigest": "sha256:d3666bb1fd85576f9af4205dbcc70029acd81462678c47d2b315c40ef1a9161d",
                "status": "unavailable",
                "capabilities": ["suspend", "resume"]
            }
        }]
    }))
    .bind(json!({
        "systemId": "support-desk",
        "topologyDigest": format!("sha256:{}", "a".repeat(64)),
        "serviceIds": ["support-service"],
        "adapterIds": ["support-control"],
        "permissions": [
            "console.workload.read",
            "console.workload.control",
            "console.workload.operation.read"
        ],
        "policy": {
            "policyId": "support-console",
            "revision": 1,
            "digest": format!("sha256:{}", "b".repeat(64))
        }
    }))
    .execute(&db.pool)
    .await
    .expect("Workload Control System Connection should insert");
}

async fn insert_terminal_workload_failure(db: &TestDatabase) {
    sqlx::query(
        "insert into console.workload_control_operations (
            system_id, service_id, workload_id, operation_id, adapter_id,
            topology_digest, adapter_target_fingerprint, operation_record
         ) values ($1, $2, $3, $4, $5, $6, $7, $8)",
    )
    .bind("support-desk")
    .bind("support-service")
    .bind("support-api")
    .bind("operation-7")
    .bind("support-control")
    .bind(format!("sha256:{}", "a".repeat(64)))
    .bind(format!("sha256:{}", "c".repeat(64)))
    .bind(json!({
        "protocol": "lenso.workload-control.v1",
        "operationId": "operation-7",
        "request": {
            "protocol": "lenso.workload-control.v1",
            "workload": {
                "systemId": "support-desk",
                "serviceId": "support-service",
                "workloadId": "support-api"
            },
            "action": { "kind": "suspend" },
            "observedRevision": "revision-4",
            "idempotencyKey": "control-123",
            "actor": { "kind": "operator", "subject": "operator-1" }
        },
        "authority": {
            "adapterId": "support-control",
            "decision": "accepted"
        },
        "phase": "failed",
        "requestedAtUnixMs": 10,
        "decidedAtUnixMs": 11,
        "updatedAtUnixMs": 13,
        "finishedAtUnixMs": 13,
        "failure": {
            "code": "authority_unavailable",
            "message": "adapter-secret provider detail"
        }
    }))
    .execute(&db.pool)
    .await
    .expect("terminal Workload failure should insert");
}

async fn insert_scoped_registry_reader(db: &TestDatabase) {
    sqlx::query(
        "insert into console.managed_services (
            service_id, service_principal, base_url, enrollment_receipt_digest,
            enrollment_grant_revision, authorization_epoch, enrollment_expires_at_unix_ms,
            enrollment_state, connection_state
         ) values ($1, $2, $3, $4, 1, 0, 4102444800000, 'active', 'ready')",
    )
    .bind("support-service")
    .bind("svc.support-service")
    .bind("http://127.0.0.1:39090")
    .bind(format!("sha256:{}", "d".repeat(64)))
    .execute(&db.pool)
    .await
    .expect("Managed Service should insert");

    sqlx::query(
        "insert into console.managed_service_access_grants (
            id, subject_type, subject_id, service_id, capabilities, created_by, created_at
         ) values ($1, 'user', $2, $3, $4, 'admin', now())",
    )
    .bind("grant_scoped_registry_reader")
    .bind("user_123")
    .bind("support-service")
    .bind(json!([
        "console.system-registry.read",
        "console.system.read",
        "console.system.connect"
    ]))
    .execute(&db.pool)
    .await
    .expect("scoped Managed Service grant should insert");
}

fn empty_system_connect_request() -> Value {
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct EmptySystemTopology<'a> {
        protocol: &'a str,
        system_id: &'a str,
        services: Vec<Value>,
        modules: Vec<Value>,
        adapters: Vec<Value>,
    }

    let topology = EmptySystemTopology {
        protocol: "lenso.system.v2",
        system_id: "support-desk",
        services: Vec::new(),
        modules: Vec::new(),
        adapters: Vec::new(),
    };
    let mut hex = String::with_capacity(64);
    for byte in Sha256::digest(serde_json::to_vec(&topology).expect("topology should serialize")) {
        write!(hex, "{byte:02x}").expect("writing a digest to String should succeed");
    }
    let topology_digest = format!("sha256:{hex}");
    json!({
        "systemId": "support-desk",
        "topologyDigest": topology_digest,
        "topology": serde_json::to_value(topology).expect("topology should serialize"),
        "managementBinding": {
            "systemId": "support-desk",
            "topologyDigest": topology_digest,
            "serviceIds": [],
            "adapterIds": [],
            "permissions": ["console.system.connect"],
            "policy": {
                "policyId": "support-console",
                "revision": 1,
                "digest": format!("sha256:{}", "b".repeat(64))
            }
        }
    })
}

fn public_get(uri: &str) -> Request<Body> {
    Request::builder()
        .uri(uri)
        .body(Body::empty())
        .expect("request should build")
}

fn admin_get(uri: &str) -> Request<Body> {
    Request::builder()
        .uri(uri)
        .header("x-admin-api-version", "1")
        .body(Body::empty())
        .expect("request should build")
}

fn admin_post(uri: &str, body: &Value) -> Request<Body> {
    Request::builder()
        .method("POST")
        .uri(uri)
        .header("x-admin-api-version", "1")
        .header("content-type", "application/json")
        .body(Body::from(body.to_string()))
        .expect("request should build")
}

trait RequestHeaderExt {
    fn with_header(self, name: &str, value: &str) -> Self;
}

impl RequestHeaderExt for Request<Body> {
    fn with_header(mut self, name: &str, value: &str) -> Self {
        self.headers_mut().insert(
            name.parse::<HeaderName>()
                .expect("header name should parse"),
            value
                .parse::<HeaderValue>()
                .expect("header value should parse"),
        );
        self
    }
}

async fn json_body(response: axum::response::Response) -> Value {
    let bytes = to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("response body should be readable");
    serde_json::from_slice(&bytes).expect("response body should be JSON")
}
