use std::collections::BTreeMap;
use std::fmt::Write as _;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use axum::body::{Body, to_bytes};
use axum::extract::Query;
use axum::http::{HeaderMap, HeaderName, HeaderValue, Request, StatusCode};
use axum::routing::get;
use axum::{Json, Router};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use lenso::system_plane::{
    Ed25519EnrollmentSigner, EnrollmentOffer, EnrollmentPolicyGrant, EnrollmentReceipt,
    EnrollmentSignature, EnrollmentSignatureAlgorithm, EnrollmentSigner, enrollment_offer_digest,
    sign_enrollment_offer, sign_enrollment_receipt,
};
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
const SUPPORT_TICKET_CONTRACT: &str =
    include_str!("../../packages/support-ticket-console/src/support-ticket-business-api.v1.json");
const SUPPORT_TICKET_CONTRACT_DIGEST: &str =
    "sha256:5c95d669efa62fa3b423bc46a5e9be3af17393b6c97cb57a9966e3bb79be1155";
const SUPPORT_TICKET_RELEASE_DIGEST: &str =
    "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const SUPPORT_TICKET_ARTIFACT_DIGEST: &str =
    "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";

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
    assert_eq!(
        unscoped_user.status(),
        StatusCode::INTERNAL_SERVER_ERROR,
        "without a reachable Console authority store, Story authorization must fail as an internal dependency error instead of impersonating a definitive denial"
    );

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
        "/api/console/v1/access/context",
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
    for status in ["409", "502"] {
        assert!(
            document["paths"]["/api/console/v1/system/connect"]["post"]["responses"]
                .get(status)
                .is_some(),
            "System connect OpenAPI must publish {status} discovery failures"
        );
    }
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
#[allow(clippy::too_many_lines)]
async fn service_scoped_grants_do_not_authorize_whole_system_access() {
    let Some(db) = TestDatabase::create().await else {
        return;
    };
    let app = app_with_database(&db).await;
    insert_scoped_registry_reader(&db).await;
    let authorization = "Bearer dev-user:user_123";
    let connect_request = empty_system_connect_request();

    let context = app
        .clone()
        .oneshot(
            admin_get("/api/console/v1/access/context").with_header("authorization", authorization),
        )
        .await
        .expect("Console Access context request should complete");
    assert_eq!(context.status(), StatusCode::OK);
    let context = json_body(context).await;
    assert_eq!(context["capabilities"], json!([]));
    assert_eq!(
        context["managed_service_capabilities"],
        json!({
            "billing-service": [
                "console.module.business.write",
                "console.system-registry.read"
            ],
            "support-service": [
                "console.module.business.read",
                "console.system-registry.read",
                "console.system.connect",
                "console.system.read"
            ]
        })
    );

    let administrative_projection = app
        .clone()
        .oneshot(
            admin_get("/api/console/v1/access/effective/support-service")
                .with_header("authorization", authorization),
        )
        .await
        .expect("administrative effective access request should complete");
    assert_eq!(administrative_projection.status(), StatusCode::FORBIDDEN);

    let registry = app
        .clone()
        .oneshot(admin_get("/api/console/v1/services").with_header("authorization", authorization))
        .await
        .expect("scoped Registry request should complete");
    assert_eq!(registry.status(), StatusCode::OK);
    let registry = json_body(registry).await;
    assert_eq!(registry.as_array().map(Vec::len), Some(2));
    assert_eq!(registry[0]["serviceId"], "billing-service");
    assert_eq!(registry[1]["serviceId"], "support-service");
    assert!(registry.as_array().is_some_and(|services| {
        services
            .iter()
            .all(|service| service.get("baseUrl").is_none())
    }));

    let service = app
        .clone()
        .oneshot(
            admin_get("/api/console/v1/services/support-service")
                .with_header("authorization", authorization),
        )
        .await
        .expect("scoped Service request should complete");
    assert_eq!(service.status(), StatusCode::OK);
    assert!(json_body(service).await.get("baseUrl").is_none());

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
async fn console_administrator_authority_is_projected_and_revocable_without_auth_scopes() {
    let Some(db) = TestDatabase::create().await else {
        return;
    };
    let app = app_with_database(&db).await;
    sqlx::query(
        "insert into console.console_administrators \
         (user_id, role, source, created_by, created_at) \
         values ($1, 'superadmin', 'local_recovery', $1, now())",
    )
    .bind("user_123")
    .execute(&db.pool)
    .await
    .expect("Console administrator should be inserted");
    let authorization = "Bearer dev-user:user_123";

    let context = app
        .clone()
        .oneshot(
            admin_get("/api/console/v1/access/context").with_header("authorization", authorization),
        )
        .await
        .expect("Console Access context request should complete");
    assert_eq!(context.status(), StatusCode::OK);
    let context = json_body(context).await;
    assert_eq!(
        context["actor"],
        json!({ "kind": "user", "user_id": "user_123" })
    );
    assert_eq!(context["scopes"], json!([]));
    assert_eq!(context["capabilities"], json!(["*"]));

    let stories = app
        .clone()
        .oneshot(
            admin_get("/api/console/v1/stories/missing/heatmap")
                .with_header("authorization", authorization),
        )
        .await
        .expect("Story request should complete");
    assert_eq!(stories.status(), StatusCode::NOT_FOUND);

    sqlx::query("delete from console.console_administrators where user_id = $1")
        .bind("user_123")
        .execute(&db.pool)
        .await
        .expect("Console administrator should be revoked");
    let revoked = app
        .oneshot(
            admin_get("/api/console/v1/stories/missing/heatmap")
                .with_header("authorization", authorization),
        )
        .await
        .expect("revoked Story request should complete");
    assert_eq!(revoked.status(), StatusCode::FORBIDDEN);

    db.cleanup().await;
}

#[tokio::test]
#[allow(clippy::too_many_lines)]
async fn signed_enrollment_is_required_before_an_exact_local_system_connects() {
    let Some(db) = TestDatabase::create().await else {
        return;
    };
    let token = "support-core-target-token";
    let (core_origin, core_server) = spawn_core_server(
        token,
        json!({
            "protocol": "lenso.system-plane.v1",
            "serviceId": "support-service",
            "servicePrincipal": "svc.support-service",
            "serviceRevision": "1",
            "capabilities": []
        }),
    )
    .await;
    let base_url = format!("{core_origin}/lenso/service/v1");
    let console_signer =
        Ed25519EnrollmentSigner::new("console-key", [7; 32]).expect("Console signer should build");
    let service_signer =
        Ed25519EnrollmentSigner::new("support-key", [8; 32]).expect("Service signer should build");
    let extra_service_signer = Ed25519EnrollmentSigner::new("extra-key", [9; 32])
        .expect("extra Service signer should build");
    let exchange = signed_exchange(
        "support-service",
        "svc.support-service",
        &console_signer,
        &service_signer,
    );
    let config = test_config_with_enrollment_trust(json!({
        "consoleAuthorityKeys": [{
            "keyId": "console-key",
            "publicKeyBase64url": URL_SAFE_NO_PAD.encode(console_signer.verifying_key_bytes()),
            "consoleServicePrincipal": "service:lenso-console"
        }],
        "managedServiceKeys": [
            {
                "keyId": "support-key",
                "publicKeyBase64url": URL_SAFE_NO_PAD.encode(service_signer.verifying_key_bytes()),
                "systemId": "support-desk",
                "managedServiceId": "support-service",
                "managedServicePrincipal": "svc.support-service",
                "baseUrl": base_url.clone(),
                "systemPlaneBearerToken": token
            },
            {
                "keyId": "extra-key",
                "publicKeyBase64url": URL_SAFE_NO_PAD.encode(extra_service_signer.verifying_key_bytes()),
                "systemId": "support-desk",
                "managedServiceId": "unexpected-service",
                "managedServicePrincipal": "svc.unexpected-service",
                "baseUrl": "http://127.0.0.1:9",
                "systemPlaneBearerToken": "unexpected-target-token"
            }
        ]
    }));
    let app = app_with_database_and_config(&db, config).await;
    let connect_request = enrolled_system_connect_request();
    let authorization = "Bearer dev-user:admin:console.system.connect,console.system.read,console.system-registry.read";

    let missing = app
        .clone()
        .oneshot(
            admin_post("/api/console/v1/system/connect", &connect_request)
                .with_header("authorization", authorization),
        )
        .await
        .expect("missing enrollment request should complete");
    assert_eq!(missing.status(), StatusCode::FORBIDDEN);

    let enrollment_request = json!({
        "offer": exchange.0,
        "receipt": exchange.1,
        "baseUrl": base_url.clone()
    });
    let unauthenticated = app
        .clone()
        .oneshot(admin_post(
            "/api/console/v1/enrollment-receipts",
            &enrollment_request,
        ))
        .await
        .expect("unauthenticated enrollment request should complete");
    assert_eq!(unauthenticated.status(), StatusCode::UNAUTHORIZED);

    let enrollment = app
        .clone()
        .oneshot(
            admin_post("/api/console/v1/enrollment-receipts", &enrollment_request)
                .with_header("authorization", authorization),
        )
        .await
        .expect("signed enrollment request should complete");
    assert_eq!(enrollment.status(), StatusCode::CREATED);
    let enrollment = json_body(enrollment).await;
    assert_eq!(enrollment["managedServiceId"], "support-service");
    assert_eq!(enrollment["enrollmentState"], "active");
    let enrollment_receipt_digest = enrollment["receiptDigest"]
        .as_str()
        .expect("Enrollment response should include its receipt digest")
        .to_owned();
    let enrollment_json = enrollment.to_string();
    assert!(!enrollment_json.contains(token));
    assert!(!enrollment_json.contains("publicKey"));

    let connected = app
        .clone()
        .oneshot(
            admin_post("/api/console/v1/system/connect", &connect_request)
                .with_header("authorization", authorization),
        )
        .await
        .expect("exact System connect should complete");
    assert_eq!(connected.status(), StatusCode::OK);
    let connected = json_body(connected).await;
    assert_eq!(connected["status"], "connected");
    assert_eq!(connected["services"][0]["serviceId"], "support-service");
    assert_eq!(connected["services"][0]["status"], "connected");
    assert_eq!(
        connected["services"][1]["serviceId"],
        "lenso-local-control-adapter"
    );
    assert_eq!(connected["services"][1]["status"], "connected");

    let extra_exchange = signed_exchange(
        "unexpected-service",
        "svc.unexpected-service",
        &console_signer,
        &extra_service_signer,
    );
    let extra = app
        .clone()
        .oneshot(
            admin_post(
                "/api/console/v1/enrollment-receipts",
                &json!({
                    "offer": extra_exchange.0,
                    "receipt": extra_exchange.1,
                    "baseUrl": "http://127.0.0.1:9"
                }),
            )
            .with_header("authorization", authorization),
        )
        .await
        .expect("extra signed enrollment should complete");
    assert_eq!(extra.status(), StatusCode::CREATED);
    let projected = app
        .clone()
        .oneshot(admin_get("/api/console/v1/system").with_header("authorization", authorization))
        .await
        .expect("System projection should complete");
    assert_eq!(projected.status(), StatusCode::OK);
    let projected = json_body(projected).await;
    assert_eq!(projected["status"], "unmanaged");
    assert!(projected["services"].as_array().is_some_and(|services| {
        services.iter().any(|service| {
            service["serviceId"] == "unexpected-service" && service["status"] == "unmanaged"
        })
    }));

    core_server.abort();
    let _ = core_server.await;
    let unavailable = app
        .clone()
        .oneshot(
            admin_post("/api/console/v1/system/connect", &connect_request)
                .with_header("authorization", authorization),
        )
        .await
        .expect("unavailable Core reconnect should complete");
    assert_eq!(unavailable.status(), StatusCode::BAD_GATEWAY);

    let service = app
        .clone()
        .oneshot(
            admin_get("/api/console/v1/services/support-service")
                .with_header("authorization", authorization),
        )
        .await
        .expect("unavailable Service projection should complete");
    assert_eq!(service.status(), StatusCode::OK);
    let service = json_body(service).await;
    assert_eq!(service["connectionState"], "unavailable");
    assert_eq!(
        service["lastErrorCode"],
        "Managed Service Core endpoint is unavailable"
    );
    assert!(service["coreDocument"].is_null());

    let gateway = app
        .oneshot(
            admin_post(
                "/api/console/v1/services/support-service/surface-gateway",
                &surface_list_request(&enrollment_receipt_digest),
            )
            .with_header(
                "authorization",
                "Bearer dev-user:admin:console.module.business.read",
            ),
        )
        .await
        .expect("unavailable Surface request should complete");
    assert_eq!(gateway.status(), StatusCode::BAD_GATEWAY);
    assert_eq!(
        json_body(gateway).await["detail"],
        "Managed Service is not ready for Surface operations"
    );

    db.cleanup().await;
}

#[tokio::test]
async fn signed_enrollment_fails_closed_without_server_trust() {
    let Some(db) = TestDatabase::create().await else {
        return;
    };
    let app = app_with_database(&db).await;
    let console_signer =
        Ed25519EnrollmentSigner::new("console-key", [7; 32]).expect("Console signer should build");
    let service_signer =
        Ed25519EnrollmentSigner::new("support-key", [8; 32]).expect("Service signer should build");
    let (offer, receipt) = signed_exchange(
        "support-service",
        "svc.support-service",
        &console_signer,
        &service_signer,
    );
    let response = app
        .oneshot(
            admin_post(
                "/api/console/v1/enrollment-receipts",
                &json!({
                    "offer": offer,
                    "receipt": receipt,
                    "baseUrl": "http://127.0.0.1:39090"
                }),
            )
            .with_header(
                "authorization",
                "Bearer dev-user:admin:console.system.connect",
            ),
        )
        .await
        .expect("unconfigured enrollment request should complete");
    assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
    assert_eq!(
        json_body(response).await["detail"],
        "Signed enrollment trust is unavailable"
    );

    db.cleanup().await;
}

#[tokio::test]
async fn signed_enrollment_rejects_cross_role_key_and_principal_aliases() {
    let Some(db) = TestDatabase::create().await else {
        return;
    };
    let authorization = "Bearer dev-user:admin:console.system.connect";

    let console_signer =
        Ed25519EnrollmentSigner::new("console-key", [21; 32]).expect("Console signer should build");
    let same_material_service_signer =
        Ed25519EnrollmentSigner::new("service-material-key", [21; 32])
            .expect("Service signer should build");
    let shared_id_service_signer =
        Ed25519EnrollmentSigner::new("shared-key", [22; 32]).expect("Service signer should build");
    let shared_id_console_signer =
        Ed25519EnrollmentSigner::new("shared-key", [23; 32]).expect("Console signer should build");
    let principal_service_signer = Ed25519EnrollmentSigner::new("principal-key", [24; 32])
        .expect("Service signer should build");

    let cases = [
        (
            "material-alias",
            "svc.material-alias",
            &console_signer,
            &same_material_service_signer,
        ),
        (
            "key-id-alias",
            "svc.key-id-alias",
            &shared_id_console_signer,
            &shared_id_service_signer,
        ),
        (
            "principal-alias",
            "service:lenso-console",
            &console_signer,
            &principal_service_signer,
        ),
    ];

    for (service_id, service_principal, console, service) in cases {
        let (offer, receipt) = signed_exchange_with_key_ids(
            service_id,
            service_principal,
            console,
            service,
            console.key_id(),
            service.key_id(),
        );
        let config = test_config_with_enrollment_trust(json!({
            "consoleAuthorityKeys": [{
                "keyId": console.key_id(),
                "publicKeyBase64url": URL_SAFE_NO_PAD.encode(console.verifying_key_bytes()),
                "consoleServicePrincipal": "service:lenso-console"
            }],
            "managedServiceKeys": [{
                "keyId": service.key_id(),
                "publicKeyBase64url": URL_SAFE_NO_PAD.encode(service.verifying_key_bytes()),
                "systemId": "support-desk",
                "managedServiceId": service_id,
                "managedServicePrincipal": service_principal,
                "baseUrl": "http://127.0.0.1:9",
                "systemPlaneBearerToken": "target-only-token"
            }]
        }));
        let app = app_with_database_and_config(&db, config).await;
        let response = app
            .oneshot(
                admin_post(
                    "/api/console/v1/enrollment-receipts",
                    &json!({
                        "offer": offer,
                        "receipt": receipt,
                        "baseUrl": "http://127.0.0.1:9"
                    }),
                )
                .with_header("authorization", authorization),
            )
            .await
            .expect("aliased trust request should complete");
        assert_eq!(
            response.status(),
            StatusCode::BAD_GATEWAY,
            "cross-role alias {service_id} must make trust unavailable"
        );
    }

    db.cleanup().await;
}

#[tokio::test]
#[allow(clippy::too_many_lines)]
async fn concurrent_enrollment_registration_is_idempotent_and_conflicts_are_typed() {
    let Some(db) = TestDatabase::create().await else {
        return;
    };
    let console_signer =
        Ed25519EnrollmentSigner::new("console-key", [31; 32]).expect("Console signer should build");
    let support_signer =
        Ed25519EnrollmentSigner::new("support-key", [32; 32]).expect("Service signer should build");
    let conflict_signer_a = Ed25519EnrollmentSigner::new("conflict-key-a", [33; 32])
        .expect("Service signer should build");
    let conflict_signer_b = Ed25519EnrollmentSigner::new("conflict-key-b", [34; 32])
        .expect("Service signer should build");
    let config = test_config_with_enrollment_trust(json!({
        "consoleAuthorityKeys": [{
            "keyId": "console-key",
            "publicKeyBase64url": URL_SAFE_NO_PAD.encode(console_signer.verifying_key_bytes()),
            "consoleServicePrincipal": "service:lenso-console"
        }],
        "managedServiceKeys": [
            {
                "keyId": "support-key",
                "publicKeyBase64url": URL_SAFE_NO_PAD.encode(support_signer.verifying_key_bytes()),
                "systemId": "support-desk",
                "managedServiceId": "support-service",
                "managedServicePrincipal": "svc.support-service",
                "baseUrl": "http://127.0.0.1:9",
                "systemPlaneBearerToken": "support-token"
            },
            {
                "keyId": "conflict-key-a",
                "publicKeyBase64url": URL_SAFE_NO_PAD.encode(conflict_signer_a.verifying_key_bytes()),
                "systemId": "support-desk",
                "managedServiceId": "conflict-service",
                "managedServicePrincipal": "svc.conflict-service",
                "baseUrl": "http://127.0.0.1:10",
                "systemPlaneBearerToken": "conflict-token"
            },
            {
                "keyId": "conflict-key-b",
                "publicKeyBase64url": URL_SAFE_NO_PAD.encode(conflict_signer_b.verifying_key_bytes()),
                "systemId": "support-desk",
                "managedServiceId": "conflict-service",
                "managedServicePrincipal": "svc.conflict-service",
                "baseUrl": "http://127.0.0.1:10",
                "systemPlaneBearerToken": "conflict-token"
            }
        ]
    }));
    let app = app_with_database_and_config(&db, config).await;
    let exchange = signed_exchange(
        "support-service",
        "svc.support-service",
        &console_signer,
        &support_signer,
    );
    let request = json!({
        "offer": exchange.0,
        "receipt": exchange.1,
        "baseUrl": "http://127.0.0.1:9"
    });
    let barrier = Arc::new(tokio::sync::Barrier::new(8));
    let mut registrations = tokio::task::JoinSet::new();
    for _ in 0..8 {
        let app = app.clone();
        let request = request.clone();
        let barrier = Arc::clone(&barrier);
        registrations.spawn(async move {
            barrier.wait().await;
            app.oneshot(
                admin_post("/api/console/v1/enrollment-receipts", &request).with_header(
                    "authorization",
                    "Bearer dev-user:admin:console.system.connect",
                ),
            )
            .await
            .expect("concurrent enrollment should complete")
            .status()
        });
    }
    while let Some(status) = registrations.join_next().await {
        assert_eq!(
            status.expect("enrollment task should join"),
            StatusCode::CREATED
        );
    }

    let conflict_a = signed_exchange_with_key_ids(
        "conflict-service",
        "svc.conflict-service",
        &console_signer,
        &conflict_signer_a,
        "console-key",
        "conflict-key-a",
    );
    let conflict_b = signed_exchange_with_key_ids(
        "conflict-service",
        "svc.conflict-service",
        &console_signer,
        &conflict_signer_b,
        "console-key",
        "conflict-key-b",
    );
    let first = app.clone().oneshot(
        admin_post(
            "/api/console/v1/enrollment-receipts",
            &json!({
                "offer": conflict_a.0,
                "receipt": conflict_a.1,
                "baseUrl": "http://127.0.0.1:10"
            }),
        )
        .with_header(
            "authorization",
            "Bearer dev-user:admin:console.system.connect",
        ),
    );
    let second = app.oneshot(
        admin_post(
            "/api/console/v1/enrollment-receipts",
            &json!({
                "offer": conflict_b.0,
                "receipt": conflict_b.1,
                "baseUrl": "http://127.0.0.1:10"
            }),
        )
        .with_header(
            "authorization",
            "Bearer dev-user:admin:console.system.connect",
        ),
    );
    let (first, second) = tokio::join!(first, second);
    let mut statuses = [
        first
            .expect("first conflicting enrollment should complete")
            .status(),
        second
            .expect("second conflicting enrollment should complete")
            .status(),
    ];
    statuses.sort();
    assert_eq!(statuses, [StatusCode::CREATED, StatusCode::CONFLICT]);

    let service_count: i64 = sqlx::query_scalar(
        "select count(*) from console.managed_services where service_id <> 'lenso-console'",
    )
    .fetch_one(&db.pool)
    .await
    .expect("Managed Service count should load");
    assert_eq!(service_count, 2);
    let exchange_count: i64 =
        sqlx::query_scalar("select count(*) from console.managed_service_enrollment_exchanges")
            .fetch_one(&db.pool)
            .await
            .expect("enrollment exchange count should load");
    assert_eq!(exchange_count, 2);

    db.cleanup().await;
}

#[tokio::test]
#[allow(clippy::too_many_lines)]
async fn rotated_enrollment_trust_invalidates_ready_state_before_surface_forwarding() {
    let Some(db) = TestDatabase::create().await else {
        return;
    };
    let token = "rotation-target-token";
    let (core_origin, core_server) = spawn_core_server(
        token,
        json!({
            "protocol": "lenso.system-plane.v1",
            "serviceId": "support-service",
            "servicePrincipal": "svc.support-service",
            "serviceRevision": "1",
            "capabilities": []
        }),
    )
    .await;
    let base_url = format!("{core_origin}/lenso/service/v1");
    let console_signer =
        Ed25519EnrollmentSigner::new("console-key", [41; 32]).expect("Console signer should build");
    let service_signer =
        Ed25519EnrollmentSigner::new("support-key", [42; 32]).expect("Service signer should build");
    let rotated_signer =
        Ed25519EnrollmentSigner::new("rotated-key", [43; 32]).expect("Service signer should build");
    let config = enrollment_trust_config(
        &console_signer,
        "console-key",
        &service_signer,
        "support-key",
        &base_url,
        token,
    );
    let app = app_with_database_and_config(&db, test_config_with_enrollment_trust(config)).await;
    let exchange = signed_exchange(
        "support-service",
        "svc.support-service",
        &console_signer,
        &service_signer,
    );
    let authorization = "Bearer dev-user:admin:console.system.connect,console.system-registry.read";
    let enrollment = app
        .clone()
        .oneshot(
            admin_post(
                "/api/console/v1/enrollment-receipts",
                &json!({
                    "offer": exchange.0,
                    "receipt": exchange.1,
                    "baseUrl": base_url
                }),
            )
            .with_header("authorization", authorization),
        )
        .await
        .expect("enrollment should complete");
    assert_eq!(enrollment.status(), StatusCode::CREATED);
    let receipt_digest = json_body(enrollment).await["receiptDigest"]
        .as_str()
        .expect("receipt digest")
        .to_owned();
    let connect_request = enrolled_system_connect_request();
    let connected = app
        .oneshot(
            admin_post("/api/console/v1/system/connect", &connect_request)
                .with_header("authorization", authorization),
        )
        .await
        .expect("initial connect should complete");
    assert_eq!(connected.status(), StatusCode::OK);

    let rotated_config = enrollment_trust_config(
        &console_signer,
        "console-key",
        &rotated_signer,
        "rotated-key",
        &base_url,
        token,
    );
    let rotated_app =
        app_with_database_and_config(&db, test_config_with_enrollment_trust(rotated_config)).await;
    let gateway = rotated_app
        .clone()
        .oneshot(
            admin_post(
                "/api/console/v1/services/support-service/surface-gateway",
                &surface_list_request(&receipt_digest),
            )
            .with_header(
                "authorization",
                "Bearer dev-user:admin:console.module.business.read",
            ),
        )
        .await
        .expect("rotated trust Surface request should complete");
    assert_eq!(gateway.status(), StatusCode::CONFLICT);
    assert_eq!(
        json_body(gateway).await["detail"],
        "Managed Service enrollment trust is incompatible"
    );

    let service = rotated_app
        .clone()
        .oneshot(
            admin_get("/api/console/v1/services/support-service")
                .with_header("authorization", authorization),
        )
        .await
        .expect("invalidated Service projection should complete");
    let service = json_body(service).await;
    assert_eq!(service["connectionState"], "incompatible");
    assert_eq!(
        service["lastErrorCode"],
        "Managed Service enrollment trust is incompatible"
    );
    assert!(service["coreDocument"].is_null());

    let reconnect = rotated_app
        .oneshot(
            admin_post("/api/console/v1/system/connect", &connect_request)
                .with_header("authorization", authorization),
        )
        .await
        .expect("rotated trust reconnect should complete");
    assert_eq!(reconnect.status(), StatusCode::CONFLICT);

    core_server.abort();
    let _ = core_server.await;
    db.cleanup().await;
}

#[tokio::test]
async fn incompatible_core_discovery_is_authoritative_and_sanitized() {
    let Some(db) = TestDatabase::create().await else {
        return;
    };
    let token = "incompatible-target-token";
    let (core_origin, core_server) = spawn_core_server(
        token,
        json!({
            "protocol": "lenso.system-plane.v1",
            "serviceId": "support-service",
            "servicePrincipal": "svc.attacker-controlled-detail",
            "serviceRevision": "1",
            "capabilities": []
        }),
    )
    .await;
    let base_url = format!("{core_origin}/lenso/service/v1");
    let console_signer =
        Ed25519EnrollmentSigner::new("console-key", [51; 32]).expect("Console signer should build");
    let service_signer =
        Ed25519EnrollmentSigner::new("support-key", [52; 32]).expect("Service signer should build");
    let config = enrollment_trust_config(
        &console_signer,
        "console-key",
        &service_signer,
        "support-key",
        &base_url,
        token,
    );
    let app = app_with_database_and_config(&db, test_config_with_enrollment_trust(config)).await;
    let exchange = signed_exchange(
        "support-service",
        "svc.support-service",
        &console_signer,
        &service_signer,
    );
    let authorization = "Bearer dev-user:admin:console.system.connect,console.system-registry.read";
    let enrollment = app
        .clone()
        .oneshot(
            admin_post(
                "/api/console/v1/enrollment-receipts",
                &json!({
                    "offer": exchange.0,
                    "receipt": exchange.1,
                    "baseUrl": base_url
                }),
            )
            .with_header("authorization", authorization),
        )
        .await
        .expect("enrollment should complete");
    assert_eq!(enrollment.status(), StatusCode::CREATED);

    let connect = app
        .clone()
        .oneshot(
            admin_post(
                "/api/console/v1/system/connect",
                &enrolled_system_connect_request(),
            )
            .with_header("authorization", authorization),
        )
        .await
        .expect("incompatible Core connect should complete");
    assert_eq!(connect.status(), StatusCode::CONFLICT);
    assert_eq!(
        json_body(connect).await["detail"],
        "Managed Service Core document is incompatible"
    );
    let service = app
        .oneshot(
            admin_get("/api/console/v1/services/support-service")
                .with_header("authorization", authorization),
        )
        .await
        .expect("incompatible Service projection should complete");
    let service = json_body(service).await;
    assert_eq!(service["connectionState"], "incompatible");
    assert_eq!(
        service["lastErrorCode"],
        "Managed Service Core document is incompatible"
    );
    let serialized = service.to_string();
    assert!(!serialized.contains("attacker-controlled-detail"));

    core_server.abort();
    let _ = core_server.await;
    db.cleanup().await;
}

#[tokio::test]
#[allow(clippy::too_many_lines)]
async fn core_http_failures_are_unavailable_while_malformed_contracts_are_incompatible() {
    let Some(db) = TestDatabase::create().await else {
        return;
    };
    let token = "classified-core-target-token";
    let http_failures = [
        StatusCode::UNAUTHORIZED,
        StatusCode::FORBIDDEN,
        StatusCode::NOT_FOUND,
        StatusCode::REQUEST_TIMEOUT,
        StatusCode::TOO_MANY_REQUESTS,
    ];
    let mut responses = http_failures
        .iter()
        .copied()
        .map(|status| {
            (
                status,
                json!({ "detail": format!("untrusted Core detail for {status}") }),
            )
        })
        .collect::<Vec<_>>();
    responses.push((
        StatusCode::OK,
        json!({
            "protocol": "lenso.system-plane.v1",
            "serviceId": "support-service",
            "servicePrincipal": "svc.malformed-core",
            "serviceRevision": "1",
            "capabilities": []
        }),
    ));
    let (core_origin, core_server) = spawn_scripted_core_server(token, responses).await;
    let base_url = format!("{core_origin}/lenso/service/v1");
    let console_signer =
        Ed25519EnrollmentSigner::new("console-key", [55; 32]).expect("Console signer should build");
    let service_signer =
        Ed25519EnrollmentSigner::new("support-key", [56; 32]).expect("Service signer should build");
    let config = enrollment_trust_config(
        &console_signer,
        "console-key",
        &service_signer,
        "support-key",
        &base_url,
        token,
    );
    let app = app_with_database_and_config(&db, test_config_with_enrollment_trust(config)).await;
    let exchange = signed_exchange(
        "support-service",
        "svc.support-service",
        &console_signer,
        &service_signer,
    );
    let authorization = "Bearer dev-user:admin:console.system.connect,console.system-registry.read";
    let enrollment = app
        .clone()
        .oneshot(
            admin_post(
                "/api/console/v1/enrollment-receipts",
                &json!({
                    "offer": exchange.0,
                    "receipt": exchange.1,
                    "baseUrl": base_url
                }),
            )
            .with_header("authorization", authorization),
        )
        .await
        .expect("enrollment should complete");
    assert_eq!(enrollment.status(), StatusCode::CREATED);

    let connect_request = enrolled_system_connect_request();
    for status in http_failures {
        let connect = app
            .clone()
            .oneshot(
                admin_post("/api/console/v1/system/connect", &connect_request)
                    .with_header("authorization", authorization),
            )
            .await
            .expect("Core HTTP failure connect should complete");
        assert_eq!(
            connect.status(),
            StatusCode::BAD_GATEWAY,
            "Core HTTP {status} must be unavailable"
        );
        assert_eq!(
            json_body(connect).await["detail"],
            "Managed Service Core endpoint is unavailable"
        );

        let service = app
            .clone()
            .oneshot(
                admin_get("/api/console/v1/services/support-service")
                    .with_header("authorization", authorization),
            )
            .await
            .expect("unavailable Service projection should complete");
        let service = json_body(service).await;
        assert_eq!(
            service["connectionState"], "unavailable",
            "Core HTTP {status} must persist unavailable"
        );
        assert_eq!(
            service["lastErrorCode"],
            "Managed Service Core endpoint is unavailable"
        );
        assert!(service["coreDocument"].is_null());
        assert!(!service.to_string().contains("untrusted Core detail"));
    }

    let malformed = app
        .clone()
        .oneshot(
            admin_post("/api/console/v1/system/connect", &connect_request)
                .with_header("authorization", authorization),
        )
        .await
        .expect("malformed Core connect should complete");
    assert_eq!(malformed.status(), StatusCode::CONFLICT);
    assert_eq!(
        json_body(malformed).await["detail"],
        "Managed Service Core document is incompatible"
    );
    let service = app
        .oneshot(
            admin_get("/api/console/v1/services/support-service")
                .with_header("authorization", authorization),
        )
        .await
        .expect("incompatible Service projection should complete");
    let service = json_body(service).await;
    assert_eq!(service["connectionState"], "incompatible");
    assert_eq!(
        service["lastErrorCode"],
        "Managed Service Core document is incompatible"
    );
    assert!(service["coreDocument"].is_null());
    assert!(!service.to_string().contains("malformed-core"));

    core_server.abort();
    let _ = core_server.await;
    db.cleanup().await;
}

#[tokio::test]
#[allow(clippy::too_many_lines)]
async fn core_discovery_success_and_failure_use_row_version_compare_and_swap() {
    for first_is_valid in [true, false] {
        let Some(db) = TestDatabase::create().await else {
            return;
        };
        let token = if first_is_valid {
            "slow-success-token"
        } else {
            "slow-failure-token"
        };
        let valid_core = json!({
            "protocol": "lenso.system-plane.v1",
            "serviceId": "support-service",
            "servicePrincipal": "svc.support-service",
            "serviceRevision": "1",
            "capabilities": []
        });
        let incompatible_core = json!({
            "protocol": "lenso.system-plane.v1",
            "serviceId": "support-service",
            "servicePrincipal": "svc.stale-response-detail",
            "serviceRevision": "1",
            "capabilities": []
        });
        let first_core = if first_is_valid {
            valid_core.clone()
        } else {
            incompatible_core.clone()
        };
        let second_core = if first_is_valid {
            incompatible_core
        } else {
            valid_core
        };
        let (core_origin, first_started, release_first, core_server) =
            spawn_sequenced_core_server(token, first_core, second_core).await;
        let base_url = format!("{core_origin}/lenso/service/v1");
        let console_seed = if first_is_valid { [61; 32] } else { [63; 32] };
        let service_seed = if first_is_valid { [62; 32] } else { [64; 32] };
        let console_signer = Ed25519EnrollmentSigner::new("console-key", console_seed)
            .expect("Console signer should build");
        let service_signer = Ed25519EnrollmentSigner::new("support-key", service_seed)
            .expect("Service signer should build");
        let config = enrollment_trust_config(
            &console_signer,
            "console-key",
            &service_signer,
            "support-key",
            &base_url,
            token,
        );
        let app =
            app_with_database_and_config(&db, test_config_with_enrollment_trust(config)).await;
        let exchange = signed_exchange(
            "support-service",
            "svc.support-service",
            &console_signer,
            &service_signer,
        );
        let authorization =
            "Bearer dev-user:admin:console.system.connect,console.system-registry.read";
        let enrollment = app
            .clone()
            .oneshot(
                admin_post(
                    "/api/console/v1/enrollment-receipts",
                    &json!({
                        "offer": exchange.0,
                        "receipt": exchange.1,
                        "baseUrl": base_url
                    }),
                )
                .with_header("authorization", authorization),
            )
            .await
            .expect("enrollment should complete");
        assert_eq!(enrollment.status(), StatusCode::CREATED);

        let connect_request = enrolled_system_connect_request();
        let slow_app = app.clone();
        let slow_request = connect_request.clone();
        let slow = tokio::spawn(async move {
            slow_app
                .oneshot(
                    admin_post("/api/console/v1/system/connect", &slow_request)
                        .with_header("authorization", authorization),
                )
                .await
                .expect("slow connect should complete")
        });
        first_started.notified().await;
        let newer = app
            .clone()
            .oneshot(
                admin_post("/api/console/v1/system/connect", &connect_request)
                    .with_header("authorization", authorization),
            )
            .await
            .expect("newer connect should complete");
        assert_eq!(
            newer.status(),
            if first_is_valid {
                StatusCode::CONFLICT
            } else {
                StatusCode::OK
            }
        );
        release_first.notify_one();
        let slow = slow.await.expect("slow connect task should join");
        assert_eq!(slow.status(), StatusCode::CONFLICT);

        let service = app
            .oneshot(
                admin_get("/api/console/v1/services/support-service")
                    .with_header("authorization", authorization),
            )
            .await
            .expect("CAS Service projection should complete");
        let service = json_body(service).await;
        assert_eq!(service["version"], 2);
        if first_is_valid {
            assert_eq!(service["connectionState"], "incompatible");
            assert_eq!(
                service["lastErrorCode"],
                "Managed Service Core document is incompatible"
            );
        } else {
            assert_eq!(service["connectionState"], "ready");
            assert!(service["lastErrorCode"].is_null());
            assert_eq!(
                service["coreDocument"]["servicePrincipal"],
                "svc.support-service"
            );
        }
        assert!(!service.to_string().contains("stale-response-detail"));

        core_server.abort();
        let _ = core_server.await;
        db.cleanup().await;
    }
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
    assert_provider_story_detail(&detail);

    let operations = app
        .clone()
        .oneshot(
            admin_get("/api/console/v1/stories/corr_story/technical-operations")
                .with_header("authorization", "Bearer dev-service:admin"),
        )
        .await
        .expect("technical operations request should complete");
    assert_eq!(operations.status(), StatusCode::OK);
    let operations = json_body(operations).await;
    assert_provider_story_operation(&operations);

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
    assert_provider_story_heatmap(&heatmap);

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

#[tokio::test]
async fn surface_story_context_rejects_blank_optional_identifiers() {
    let Some(db) = TestDatabase::create().await else {
        return;
    };
    let app = app_with_database(&db).await;

    for (field, detail) in [
        (
            "correlationId",
            "Surface operation Story correlation id must be non-empty",
        ),
        (
            "segmentId",
            "Surface operation Story segment id must be non-empty",
        ),
    ] {
        let mut request = surface_list_request(&format!("sha256:{}", "d".repeat(64)));
        let mut story = json!({ "storyId": "support-desk.acceptance" });
        story[field] = json!(" \t ");
        request["requestContext"]["story"] = story;
        let response = app
            .clone()
            .oneshot(
                admin_post(
                    "/api/console/v1/services/support-service/surface-gateway",
                    &request,
                )
                .with_header(
                    "authorization",
                    "Bearer dev-user:admin:console.module.business.read",
                ),
            )
            .await
            .expect("blank Surface Story request should complete");
        assert_eq!(response.status(), StatusCode::BAD_REQUEST, "{field}");
        assert_eq!(json_body(response).await["detail"], detail, "{field}");
    }

    db.cleanup().await;
}

#[tokio::test]
#[allow(clippy::too_many_lines)]
async fn successful_surface_call_is_projected_into_its_exact_runtime_story() {
    let Some(db) = TestDatabase::create().await else {
        return;
    };
    let token = "surface-story-target-token";
    let (origin, target_server) = spawn_surface_story_target_server(
        token,
        json!({
            "protocol": "lenso.system-plane.v1",
            "serviceId": "support-service",
            "servicePrincipal": "svc.support-service",
            "serviceRevision": "1",
            "capabilities": []
        }),
    )
    .await;
    let base_url = format!("{origin}/lenso/service/v1");
    let console_signer =
        Ed25519EnrollmentSigner::new("console-key", [61; 32]).expect("Console signer should build");
    let service_signer =
        Ed25519EnrollmentSigner::new("support-key", [62; 32]).expect("Service signer should build");
    let config = enrollment_trust_config(
        &console_signer,
        "console-key",
        &service_signer,
        "support-key",
        &base_url,
        token,
    );
    let app = app_with_database_and_config(&db, test_config_with_enrollment_trust(config)).await;
    let exchange = signed_exchange(
        "support-service",
        "svc.support-service",
        &console_signer,
        &service_signer,
    );
    let enrollment = app
        .clone()
        .oneshot(
            admin_post(
                "/api/console/v1/enrollment-receipts",
                &json!({
                    "offer": exchange.0,
                    "receipt": exchange.1,
                    "baseUrl": base_url
                }),
            )
            .with_header(
                "authorization",
                "Bearer dev-user:admin:console.system.connect",
            ),
        )
        .await
        .expect("enrollment should complete");
    assert_eq!(enrollment.status(), StatusCode::CREATED);
    let receipt_digest = json_body(enrollment).await["receiptDigest"]
        .as_str()
        .expect("receipt digest")
        .to_owned();
    let connected = app
        .clone()
        .oneshot(
            admin_post(
                "/api/console/v1/system/connect",
                &enrolled_system_connect_request(),
            )
            .with_header(
                "authorization",
                "Bearer dev-user:admin:console.system.connect",
            ),
        )
        .await
        .expect("System connect should complete");
    assert_eq!(connected.status(), StatusCode::OK);

    let mut request = surface_list_request(&receipt_digest);
    request["requestContext"]["story"] = json!({
        "storyId": "support-desk.acceptance",
        "segmentId": "segment-support-ticket-crud",
        "correlationId": "corr-support-desk-acceptance"
    });
    let gateway = app
        .clone()
        .oneshot(
            admin_post(
                "/api/console/v1/services/support-service/surface-gateway",
                &request,
            )
            .with_header(
                "authorization",
                "Bearer dev-user:admin:console.module.business.read",
            ),
        )
        .await
        .expect("Surface Gateway request should complete");
    assert_eq!(gateway.status(), StatusCode::OK);

    let provider_call = sqlx::query(
        "select provider_calls.correlation_id, \
                story_events.correlation_id as story_correlation_id, \
                story_events.metadata ->> 'story_title' as story_title \
         from platform.provider_http_calls provider_calls \
         join platform.story_events story_events \
           on story_events.source_type = 'provider_call' \
          and story_events.source_id = provider_calls.id \
         where provider_calls.module_name = 'support/tickets' \
         order by provider_calls.occurred_at desc limit 1",
    )
    .fetch_optional(&db.pool)
    .await
    .expect("provider call should query")
    .expect("successful Surface call should persist provider evidence");
    assert_eq!(
        sqlx::Row::try_get::<String, _>(&provider_call, "correlation_id")
            .expect("provider correlation"),
        "corr-support-desk-acceptance"
    );
    assert_eq!(
        sqlx::Row::try_get::<String, _>(&provider_call, "story_correlation_id")
            .expect("canonical Story correlation"),
        "corr-support-desk-acceptance"
    );
    assert_eq!(
        sqlx::Row::try_get::<String, _>(&provider_call, "story_title")
            .expect("canonical Story title"),
        "support-desk.acceptance"
    );

    let story = app
        .clone()
        .oneshot(
            admin_get("/api/console/v1/stories/corr-support-desk-acceptance")
                .with_header("authorization", "Bearer dev-service:admin"),
        )
        .await
        .expect("Story detail request should complete");
    assert_eq!(story.status(), StatusCode::OK);
    let story = json_body(story).await;
    assert_eq!(
        story["data"]["summary"]["correlation_id"],
        "corr-support-desk-acceptance"
    );
    assert_eq!(story["data"]["summary"]["title"], "support-desk.acceptance");

    let mut rejected_request = request.clone();
    rejected_request["input"]["limit"] = json!(13);
    let rejected = app
        .clone()
        .oneshot(
            admin_post(
                "/api/console/v1/services/support-service/surface-gateway",
                &rejected_request,
            )
            .with_header(
                "authorization",
                "Bearer dev-user:admin:console.module.business.read",
            ),
        )
        .await
        .expect("rejected Surface request should complete");
    assert_eq!(rejected.status(), StatusCode::BAD_GATEWAY);
    let rejected_call = sqlx::query(
        "select provider_status, success from platform.provider_http_calls
         where module_name = 'support/tickets' order by occurred_at desc limit 1",
    )
    .fetch_one(&db.pool)
    .await
    .expect("rejected provider call should query");
    assert_eq!(
        sqlx::Row::try_get::<Option<i32>, _>(&rejected_call, "provider_status")
            .expect("observed provider status"),
        Some(503)
    );
    assert!(!sqlx::Row::try_get::<bool, _>(&rejected_call, "success").expect("provider success"));

    sqlx::query("drop table platform.provider_http_calls")
        .execute(&db.pool)
        .await
        .expect("provider recorder table should drop");
    let response_without_recorder = app
        .oneshot(
            admin_post(
                "/api/console/v1/services/support-service/surface-gateway",
                &request,
            )
            .with_header(
                "authorization",
                "Bearer dev-user:admin:console.module.business.read",
            ),
        )
        .await
        .expect("Surface request should survive recorder failure");
    assert_eq!(response_without_recorder.status(), StatusCode::OK);

    target_server.abort();
    let _ = target_server.await;
    db.cleanup().await;
}

fn assert_provider_story_detail(detail: &Value) {
    assert_eq!(detail["data"]["summary"]["title"], "Support Ticket Lookup");
    let provider_nodes = detail["data"]["nodes"]
        .as_array()
        .expect("Story nodes should be an array")
        .iter()
        .filter(|node| node["type"] == "provider_call")
        .collect::<Vec<_>>();
    assert_eq!(provider_nodes.len(), 1);
    let provider_node = provider_nodes[0];
    assert_eq!(provider_node["id"], "provider_rproxy_story");
    assert_eq!(
        provider_node["error"],
        "provider call failed with provider_unavailable"
    );
    assert_eq!(
        provider_node["metadata"]["source_metadata"]["provider_call_id"],
        "rproxy_story"
    );
    assert!(
        provider_node["metadata"]["source_metadata"]
            .get("remote_proxy_call_id")
            .is_none()
    );
    let provider_timeline_item = detail["data"]["timeline_items"]
        .as_array()
        .and_then(|items| {
            items
                .iter()
                .find(|item| item["id"] == "provider_rproxy_story")
        })
        .expect("Story should project the provider timeline item");
    assert_eq!(provider_timeline_item["type"], "provider_call");
    assert_eq!(provider_timeline_item["status"], "failed");
    assert_eq!(
        provider_timeline_item["last_error"],
        "provider call failed with provider_unavailable"
    );
}

fn assert_provider_story_operation(operations: &Value) {
    let provider_operation = operations["data"]
        .as_array()
        .and_then(|operations| {
            operations
                .iter()
                .find(|operation| operation["source"] == "provider")
        })
        .expect("Story should project the provider technical operation");
    assert_eq!(provider_operation["id"], "provider:rproxy_story");
    assert_eq!(
        provider_operation["related_node_id"],
        "provider_rproxy_story"
    );
    assert_eq!(
        provider_operation["attributes"]["provider_call_id"],
        "rproxy_story"
    );
    assert_eq!(provider_operation["attributes"]["provider_status"], 503);
}

fn assert_provider_story_heatmap(heatmap: &Value) {
    assert_eq!(heatmap["bucket_seconds"], 60);
    assert_eq!(heatmap["data"].as_array().map(Vec::len), Some(4));
    assert_eq!(heatmap["data"][0]["service"], "api");
    assert_eq!(heatmap["data"][0]["node_type"], "http_request");
    assert_eq!(heatmap["data"][0]["error_count"], 0);
    assert_eq!(heatmap["data"][1]["service"], "identity");
    assert_eq!(heatmap["data"][1]["node_type"], "event");
    assert_eq!(heatmap["data"][2]["service"], "notifications");
    assert_eq!(heatmap["data"][2]["node_type"], "function");
    assert_eq!(heatmap["data"][2]["dead_count"], 1);
    assert_eq!(heatmap["data"][3]["service"], "support/tickets");
    assert_eq!(heatmap["data"][3]["node_type"], "provider_call");
    assert_eq!(heatmap["data"][3]["error_count"], 1);
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
    app_with_database_and_config(db, config).await
}

async fn app_with_database_and_config(db: &TestDatabase, mut config: AppConfig) -> axum::Router {
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

fn test_config_with_enrollment_trust(enrollment_trust: Value) -> AppConfig {
    let mut config = test_config();
    config.modules.insert(
        "lenso-system-registry".to_owned(),
        ModuleConfig {
            enabled: None,
            values: BTreeMap::from([("enrollment_trust".to_owned(), enrollment_trust)]),
        },
    );
    config
}

fn enrollment_trust_config(
    console_signer: &Ed25519EnrollmentSigner,
    console_key_id: &str,
    service_signer: &Ed25519EnrollmentSigner,
    service_key_id: &str,
    base_url: &str,
    token: &str,
) -> Value {
    json!({
        "consoleAuthorityKeys": [{
            "keyId": console_key_id,
            "publicKeyBase64url": URL_SAFE_NO_PAD.encode(console_signer.verifying_key_bytes()),
            "consoleServicePrincipal": "service:lenso-console"
        }],
        "managedServiceKeys": [{
            "keyId": service_key_id,
            "publicKeyBase64url": URL_SAFE_NO_PAD.encode(service_signer.verifying_key_bytes()),
            "systemId": "support-desk",
            "managedServiceId": "support-service",
            "managedServicePrincipal": "svc.support-service",
            "baseUrl": base_url,
            "systemPlaneBearerToken": token
        }]
    })
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
        insert into platform.provider_http_calls (
            id, module_name, method, declared_path, provider_path, capability,
            provider_status, duration_ms, success, error_code, retryable,
            request_id, correlation_id, trace_id, span_id, path_params,
            error_details, occurred_at, created_at
        ) values (
            'rproxy_story', 'support/tickets', 'GET', '/tickets', '/tickets',
            'support_ticket.tickets.read', 503, 50, false,
            'provider_unavailable', true, 'req_story_provider', 'corr_story',
            'trace_story_provider', 'span_story_provider', '{}'::jsonb,
            '[]'::jsonb, '2026-05-31T00:10:20Z', '2026-05-31T00:10:20Z'
        )
        ",
    )
    .execute(&db.pool)
    .await
    .expect("Story provider call should insert");

    sqlx::query(
        r#"
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
            ),
            (
                'remoteproxy_rproxy_story', 'remote_proxy_call', 'rproxy_story',
                'remote_proxy_call', 'support/tickets GET /tickets', 'failed',
                'support/tickets', 'corr_story', 'story_heatmap_http',
                '2026-05-31T00:10:20Z', '2026-05-31T00:10:20.050Z', 50,
                'remote proxy call failed with provider_unavailable',
                '{
                    "remote_proxy_call_id": "rproxy_story",
                    "module_name": "support/tickets",
                    "method": "GET",
                    "declared_path": "/tickets",
                    "remote_path": "/tickets",
                    "remote_status": 503,
                    "story_title": "Support Ticket Lookup",
                    "retryable": true
                }'::jsonb,
                'trace_story_provider', 'span_story_provider',
                '2026-05-31T00:10:20Z', '2026-05-31T00:10:20.050Z'
            )
        "#,
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
         ) values
            ($1, $2, $3, $4, 1, 0, 4102444800000, 'active', 'ready'),
            ($5, $6, $7, $8, 1, 0, 4102444800000, 'active', 'ready')",
    )
    .bind("support-service")
    .bind("svc.support-service")
    .bind("http://127.0.0.1:39090")
    .bind(format!("sha256:{}", "d".repeat(64)))
    .bind("billing-service")
    .bind("svc.billing-service")
    .bind("http://127.0.0.1:39091")
    .bind(format!("sha256:{}", "e".repeat(64)))
    .execute(&db.pool)
    .await
    .expect("Managed Services should insert");

    sqlx::query("insert into auth.users (id, created_at) values ($1, now())")
        .bind("user_123")
        .execute(&db.pool)
        .await
        .expect("grant-only user should insert");
    sqlx::query(
        "insert into organization.organizations (id, name, slug, created_at, updated_at)
         values ('org_billing', 'Billing operators', 'billing-operators', now(), now())",
    )
    .execute(&db.pool)
    .await
    .expect("organization should insert");
    sqlx::query(
        "insert into organization.roles
            (id, organization_id, name, permissions, system_key, created_at, updated_at)
         values ('role_billing', 'org_billing', 'member', '[]'::jsonb, 'member', now(), now())",
    )
    .execute(&db.pool)
    .await
    .expect("organization role should insert");
    sqlx::query(
        "insert into organization.memberships
            (id, organization_id, auth_user_id, role_id, created_at, updated_at)
         values ('member_billing', 'org_billing', $1, 'role_billing', now(), now())",
    )
    .bind("user_123")
    .execute(&db.pool)
    .await
    .expect("organization membership should insert");

    sqlx::query(
        "insert into console.managed_service_access_grants (
            id, subject_type, subject_id, service_id, capabilities, created_by, created_at
         ) values ($1, 'user', $2, $3, $4, 'admin', now())",
    )
    .bind("grant_scoped_registry_reader")
    .bind("user_123")
    .bind("support-service")
    .bind(json!([
        "console.module.business.read",
        "console.system-registry.read",
        "console.system.read",
        "console.system.connect"
    ]))
    .execute(&db.pool)
    .await
    .expect("scoped Managed Service grant should insert");

    sqlx::query(
        "insert into console.managed_service_access_grants (
            id, subject_type, subject_id, service_id, capabilities, created_by, created_at
         ) values ($1, 'organization', $2, $3, $4, 'admin', now())",
    )
    .bind("grant_billing_organization")
    .bind("org_billing")
    .bind("billing-service")
    .bind(json!([
        "console.module.business.write",
        "console.system-registry.read"
    ]))
    .execute(&db.pool)
    .await
    .expect("organization Managed Service grant should insert");
}

fn signed_exchange(
    service_id: &str,
    service_principal: &str,
    console_signer: &Ed25519EnrollmentSigner,
    service_signer: &Ed25519EnrollmentSigner,
) -> (EnrollmentOffer, EnrollmentReceipt) {
    signed_exchange_with_key_ids(
        service_id,
        service_principal,
        console_signer,
        service_signer,
        "console-key",
        "support-key",
    )
}

fn signed_exchange_with_key_ids(
    service_id: &str,
    service_principal: &str,
    console_signer: &Ed25519EnrollmentSigner,
    service_signer: &Ed25519EnrollmentSigner,
    console_key_id: &str,
    service_key_id: &str,
) -> (EnrollmentOffer, EnrollmentReceipt) {
    let now_unix_ms = u64::try_from(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should follow epoch")
            .as_millis(),
    )
    .expect("clock should fit u64");
    let policy = EnrollmentPolicyGrant {
        policy_id: "support-console".to_owned(),
        policy_revision: "1".to_owned(),
        policy_digest: format!("sha256:{}", "b".repeat(64)),
    };
    let offer = sign_enrollment_offer(
        EnrollmentOffer {
            protocol: String::new(),
            system_id: "support-desk".to_owned(),
            console_service_principal: "service:lenso-console".to_owned(),
            nonce: format!("support-enrollment-{service_id}"),
            issued_at_unix_ms: now_unix_ms.saturating_sub(1_000),
            expires_at_unix_ms: now_unix_ms + 300_000,
            requested_capabilities: Vec::new(),
            requested_policy: policy.clone(),
            signature: unsigned_signature(console_key_id),
        },
        console_signer,
    )
    .expect("Enrollment Offer should sign");
    let receipt = sign_enrollment_receipt(
        EnrollmentReceipt {
            protocol: String::new(),
            offer_digest: enrollment_offer_digest(&offer),
            system_id: "support-desk".to_owned(),
            managed_service_id: service_id.to_owned(),
            managed_service_principal: service_principal.to_owned(),
            managed_service_revision: "1".to_owned(),
            console_service_principal: "service:lenso-console".to_owned(),
            nonce: offer.nonce.clone(),
            issued_at_unix_ms: now_unix_ms,
            expires_at_unix_ms: offer.expires_at_unix_ms,
            grant_revision: 1,
            authorization_epoch: 1,
            granted_capabilities: Vec::new(),
            granted_policy: policy,
            signature: unsigned_signature(service_key_id),
        },
        service_signer,
    )
    .expect("Enrollment Receipt should sign");
    (offer, receipt)
}

fn unsigned_signature(key_id: &str) -> EnrollmentSignature {
    EnrollmentSignature {
        algorithm: EnrollmentSignatureAlgorithm::Ed25519,
        key_id: key_id.to_owned(),
        subject_digest: String::new(),
        value: String::new(),
    }
}

async fn spawn_core_server(
    expected_token: &str,
    core_document: Value,
) -> (String, tokio::task::JoinHandle<()>) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("Core listener should bind");
    let address = listener
        .local_addr()
        .expect("Core listener should have an address");
    let expected_authorization = format!("Bearer {expected_token}");
    let app = Router::new().route(
        "/system-plane/v1",
        get(move |headers: HeaderMap| {
            let expected_authorization = expected_authorization.clone();
            let core_document = core_document.clone();
            async move {
                assert_eq!(
                    headers
                        .get("authorization")
                        .and_then(|value| value.to_str().ok()),
                    Some(expected_authorization.as_str())
                );
                Json(core_document)
            }
        }),
    );
    let server = tokio::spawn(async move {
        axum::serve(listener, app)
            .await
            .expect("Core server should run");
    });
    (format!("http://{address}"), server)
}

async fn spawn_surface_story_target_server(
    expected_token: &str,
    core_document: Value,
) -> (String, tokio::task::JoinHandle<()>) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("Surface Story target listener should bind");
    let address = listener
        .local_addr()
        .expect("Surface Story target listener should have an address");
    let expected_authorization = format!("Bearer {expected_token}");
    let app = Router::new()
        .route(
            "/system-plane/v1",
            get(move |headers: HeaderMap| {
                let expected_authorization = expected_authorization.clone();
                let core_document = core_document.clone();
                async move {
                    assert_eq!(
                        headers
                            .get("authorization")
                            .and_then(|value| value.to_str().ok()),
                        Some(expected_authorization.as_str())
                    );
                    Json(core_document)
                }
            }),
        )
        .route(
            "/lenso/service/v1/modules/support-ticket/tickets",
            get(
                |headers: HeaderMap, Query(query): Query<BTreeMap<String, String>>| async move {
                    let story = headers
                        .get("x-lenso-console-story-context")
                        .and_then(|value| value.to_str().ok())
                        .and_then(|value| serde_json::from_str::<Value>(value).ok())
                        .expect("Surface target should receive Story context");
                    assert_eq!(
                        story,
                        json!({
                            "storyId": "support-desk.acceptance",
                            "segmentId": "segment-support-ticket-crud",
                            "correlationId": "corr-support-desk-acceptance"
                        })
                    );
                    if query.get("limit").map(String::as_str) == Some("13") {
                        return (
                            StatusCode::SERVICE_UNAVAILABLE,
                            Json(json!({ "error": "provider unavailable" })),
                        );
                    }
                    (
                        StatusCode::OK,
                        Json(json!({ "records": [], "next_cursor": null })),
                    )
                },
            ),
        );
    let server = tokio::spawn(async move {
        axum::serve(listener, app)
            .await
            .expect("Surface Story target server should run");
    });
    (format!("http://{address}"), server)
}

async fn spawn_sequenced_core_server(
    expected_token: &str,
    first_core_document: Value,
    second_core_document: Value,
) -> (
    String,
    Arc<tokio::sync::Notify>,
    Arc<tokio::sync::Notify>,
    tokio::task::JoinHandle<()>,
) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("Core listener should bind");
    let address = listener
        .local_addr()
        .expect("Core listener should have an address");
    let expected_authorization = format!("Bearer {expected_token}");
    let request_count = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let first_started = Arc::new(tokio::sync::Notify::new());
    let release_first = Arc::new(tokio::sync::Notify::new());
    let route_count = Arc::clone(&request_count);
    let route_started = Arc::clone(&first_started);
    let route_release = Arc::clone(&release_first);
    let app = Router::new().route(
        "/system-plane/v1",
        get(move |headers: HeaderMap| {
            let expected_authorization = expected_authorization.clone();
            let first_core_document = first_core_document.clone();
            let second_core_document = second_core_document.clone();
            let request_count = Arc::clone(&route_count);
            let first_started = Arc::clone(&route_started);
            let release_first = Arc::clone(&route_release);
            async move {
                assert_eq!(
                    headers
                        .get("authorization")
                        .and_then(|value| value.to_str().ok()),
                    Some(expected_authorization.as_str())
                );
                let sequence = request_count.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                if sequence == 0 {
                    first_started.notify_one();
                    release_first.notified().await;
                    Json(first_core_document)
                } else {
                    Json(second_core_document)
                }
            }
        }),
    );
    let server = tokio::spawn(async move {
        axum::serve(listener, app)
            .await
            .expect("Core server should run");
    });
    (
        format!("http://{address}"),
        first_started,
        release_first,
        server,
    )
}

async fn spawn_scripted_core_server(
    expected_token: &str,
    responses: Vec<(StatusCode, Value)>,
) -> (String, tokio::task::JoinHandle<()>) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("Core listener should bind");
    let address = listener
        .local_addr()
        .expect("Core listener should have an address");
    let expected_authorization = format!("Bearer {expected_token}");
    let responses = Arc::new(responses);
    let request_count = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let route_responses = Arc::clone(&responses);
    let route_count = Arc::clone(&request_count);
    let app = Router::new().route(
        "/system-plane/v1",
        get(move |headers: HeaderMap| {
            let expected_authorization = expected_authorization.clone();
            let responses = Arc::clone(&route_responses);
            let request_count = Arc::clone(&route_count);
            async move {
                assert_eq!(
                    headers
                        .get("authorization")
                        .and_then(|value| value.to_str().ok()),
                    Some(expected_authorization.as_str())
                );
                let sequence = request_count.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                let (status, body) = responses
                    .get(sequence)
                    .cloned()
                    .expect("Core request should have a scripted response");
                (status, Json(body))
            }
        }),
    );
    let server = tokio::spawn(async move {
        axum::serve(listener, app)
            .await
            .expect("Core server should run");
    });
    (format!("http://{address}"), server)
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct EnrolledTopology<'a> {
    protocol: &'a str,
    system_id: &'a str,
    services: Vec<EnrolledTopologyService<'a>>,
    modules: Vec<EnrolledTopologyModule<'a>>,
    adapters: Vec<EnrolledTopologyAdapter<'a>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct EnrolledTopologyService<'a> {
    service_id: &'a str,
    service_principal: &'a str,
    revision: u64,
    workloads: Vec<EnrolledTopologyWorkload<'a>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct EnrolledTopologyWorkload<'a> {
    workload_id: &'a str,
    role: &'a str,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct EnrolledTopologyModule<'a> {
    module_id: &'a str,
    delivery: &'a str,
    service_id: Option<&'a str>,
    module_release_digest: &'a str,
    console_ui_artifact_digest: Option<&'a str>,
    surface_api_grant: Option<EnrolledSurfaceApiGrant<'a>>,
    runtime_status: Option<&'a str>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct EnrolledSurfaceApiGrant<'a> {
    artifact_digest: &'a str,
    module_release_digest: &'a str,
    contract_digest: &'a str,
    operation_ids: Vec<&'a str>,
    contract_artifact: EnrolledSurfaceApiContractArtifact<'a>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct EnrolledSurfaceApiContractArtifact<'a> {
    format: &'a str,
    document: &'a str,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct EnrolledTopologyAdapter<'a> {
    adapter_id: &'a str,
    capabilities: Vec<&'a str>,
    workload: EnrolledWorkloadReference<'a>,
    workload_control: EnrolledWorkloadControl<'a>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct EnrolledWorkloadReference<'a> {
    #[serde(rename = "systemId")]
    system: &'a str,
    #[serde(rename = "serviceId")]
    service: &'a str,
    #[serde(rename = "workloadId")]
    workload: &'a str,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct EnrolledWorkloadControl<'a> {
    protocol: &'a str,
    schema_digest: &'a str,
    status: &'a str,
    capabilities: Vec<&'a str>,
}

fn enrolled_system_connect_request() -> Value {
    let topology = EnrolledTopology {
        protocol: "lenso.system.v2",
        system_id: "support-desk",
        services: vec![
            EnrolledTopologyService {
                service_id: "support-service",
                service_principal: "svc.support-service",
                revision: 1,
                workloads: vec![EnrolledTopologyWorkload {
                    workload_id: "support-api",
                    role: "api",
                }],
            },
            EnrolledTopologyService {
                service_id: "lenso-local-control-adapter",
                service_principal: "svc.lenso-local-control-adapter",
                revision: 1,
                workloads: vec![EnrolledTopologyWorkload {
                    workload_id: "workload-control:support-desk",
                    role: "control_adapter",
                }],
            },
        ],
        modules: vec![EnrolledTopologyModule {
            module_id: "support/tickets",
            delivery: "service",
            service_id: Some("support-service"),
            module_release_digest: SUPPORT_TICKET_RELEASE_DIGEST,
            console_ui_artifact_digest: Some(SUPPORT_TICKET_ARTIFACT_DIGEST),
            surface_api_grant: Some(EnrolledSurfaceApiGrant {
                artifact_digest: SUPPORT_TICKET_ARTIFACT_DIGEST,
                module_release_digest: SUPPORT_TICKET_RELEASE_DIGEST,
                contract_digest: SUPPORT_TICKET_CONTRACT_DIGEST,
                operation_ids: vec![
                    "support-ticket/http/GET:/tickets",
                    "support-ticket/http/GET:/tickets/{id}/restricted",
                    "support-ticket/http/PATCH:/tickets/{id}",
                    "support-ticket/http/POST:/tickets",
                    "support-ticket/http/POST:/tickets/{id}/close",
                ],
                contract_artifact: EnrolledSurfaceApiContractArtifact {
                    format: "openapi_3_1_json",
                    document: SUPPORT_TICKET_CONTRACT,
                },
            }),
            runtime_status: Some("active"),
        }],
        adapters: vec![EnrolledTopologyAdapter {
            adapter_id: "local-control",
            capabilities: Vec::new(),
            workload: EnrolledWorkloadReference {
                system: "support-desk",
                service: "lenso-local-control-adapter",
                workload: "workload-control:support-desk",
            },
            workload_control: EnrolledWorkloadControl {
                protocol: "lenso.workload-control.v1",
                schema_digest: "sha256:d3666bb1fd85576f9af4205dbcc70029acd81462678c47d2b315c40ef1a9161d",
                status: "connected",
                capabilities: vec!["suspend", "resume"],
            },
        }],
    };
    let mut canonical = topology.clone();
    canonical
        .services
        .sort_by(|left, right| left.service_id.cmp(right.service_id));
    let mut hex = String::with_capacity(64);
    for byte in Sha256::digest(serde_json::to_vec(&canonical).expect("topology should serialize")) {
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
            "serviceIds": ["support-service", "lenso-local-control-adapter"],
            "adapterIds": ["local-control"],
            "permissions": ["console.module.business.read", "console.system.connect"],
            "policy": {
                "policyId": "support-console",
                "revision": 1,
                "digest": format!("sha256:{}", "b".repeat(64))
            }
        }
    })
}

fn surface_list_request(enrollment_receipt_digest: &str) -> Value {
    let deadline_unix_ms = u64::try_from(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should follow epoch")
            .as_millis(),
    )
    .expect("clock should fit u64")
        + 30_000;
    json!({
        "protocol": "lenso.console-surface-gateway.v1",
        "moduleId": "support/tickets",
        "moduleReleaseDigest": SUPPORT_TICKET_RELEASE_DIGEST,
        "uiArtifactDigest": SUPPORT_TICKET_ARTIFACT_DIGEST,
        "contractDigest": SUPPORT_TICKET_CONTRACT_DIGEST,
        "operationId": "support-ticket/http/GET:/tickets",
        "input": { "limit": 25 },
        "context": {
            "systemId": "support-desk",
            "serviceId": "support-service",
            "environmentId": "local",
            "targetServicePrincipal": "svc.support-service",
            "callerModuleId": "support/tickets",
            "delegatedActorSubject": "admin",
            "delegatedAuthorityDigest": enrollment_receipt_digest,
            "capabilities": ["support_ticket.tickets.read"]
        },
        "requestContext": {
            "deadlineUnixMs": deadline_unix_ms
        }
    })
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
