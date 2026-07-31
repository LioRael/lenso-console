use std::path::{Path, PathBuf};

use axum::extract::State;
use axum::http::{HeaderName, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{any, get};
use lenso::host::http::{
    ApiOpenApiRouter, AppContext, Json, ModuleHttpMethod, ModuleHttpRoute, OpenApiRouter,
    UserActor, routes,
};
use lenso::host::prelude::*;
use serde::Serialize;
use serde_json::Value;
use sqlx::Executor;
use tower_http::services::{ServeDir, ServeFile};
use tower_http::set_header::SetResponseHeaderLayer;
use utoipa::ToSchema;

use super::console_artifacts::{__path_reconcile_artifacts, ARTIFACTS_MANAGE, reconcile_artifacts};
use crate::composition::{CONSOLE_SERVICE_ID, ConsoleServiceComposition, official_composition};

pub const MODULE_NAME: &str = "lenso/console-shell";

const NO_MIGRATIONS: &[Migration] = &[];

pub fn linked_module() -> HostLinkedModule {
    HostLinkedModule::manifest_only(MODULE_NAME, manifest, NO_MIGRATIONS)
        .with_http_binding(http_binding)
}

fn manifest() -> ModuleManifest {
    ModuleManifest::builder(MODULE_NAME)
        .http_routes(vec![
            ModuleHttpRoute {
                method: ModuleHttpMethod::Get,
                path: "/api/console/v1/composition".to_owned(),
                capability: None,
                operation: None,
                display_name: Some("Inspect Console Service Composition".to_owned()),
                story_title: None,
            },
            ModuleHttpRoute {
                method: ModuleHttpMethod::Get,
                path: "/bootstrap/v1/status".to_owned(),
                capability: None,
                operation: None,
                display_name: Some("Inspect Console Bootstrap Status".to_owned()),
                story_title: None,
            },
            ModuleHttpRoute {
                method: ModuleHttpMethod::Post,
                path: "/api/console/v1/artifacts/reconcile".to_owned(),
                capability: Some(ARTIFACTS_MANAGE.to_owned()),
                operation: None,
                display_name: Some("Reconcile Console UI Artifacts".to_owned()),
                story_title: None,
            },
        ])
        .capabilities(vec![ARTIFACTS_MANAGE.to_owned()])
        .build()
}

fn http_binding() -> LinkedBinding {
    LinkedBinding::builder()
        .http(LinkedHttpContribution {
            public_prefixes: &[
                "/health/",
                "/api/console/v1/composition",
                "/api/console/v1/artifacts/reconcile",
                "/bootstrap/v1/status",
            ],
            merge: merge_http,
        })
        .build()
}

fn merge_http(base: ApiOpenApiRouter) -> ApiOpenApiRouter {
    let root = console_web_root();
    let index = root.join("index.html");
    assert!(
        index.is_file(),
        "Console Shell build is missing at {}; run `pnpm service:web-build` or set CONSOLE_WEB_ROOT",
        index.display()
    );

    let bootstrap = OpenApiRouter::new()
        .routes(routes!(get_console_bootstrap_status))
        .fallback(not_found);
    let shell = OpenApiRouter::new()
        .routes(routes!(get_console_composition))
        .routes(routes!(reconcile_artifacts))
        .nest("/bootstrap", bootstrap)
        .route("/health/live", get(live))
        .route("/health/ready", get(ready))
        .route("/health/startup", get(startup))
        .route("/health/authority", get(authority))
        .route("/api", any(not_found))
        .route("/api/{*path}", any(not_found))
        .route("/admin", any(not_found))
        .route("/admin/{*path}", any(not_found))
        .route("/health", any(not_found))
        .route("/health/{*path}", any(not_found))
        .route("/oauth/{*path}", any(not_found))
        .route("/v1", any(not_found))
        .route("/v1/{*path}", any(not_found))
        .route("/.well-known/{*path}", any(not_found))
        .fallback_service(ServeDir::new(root).fallback(ServeFile::new(index)))
        .layer(SetResponseHeaderLayer::if_not_present(
            HeaderName::from_static("content-security-policy"),
            HeaderValue::from_static(
                "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' https:; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
            ),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            HeaderName::from_static("referrer-policy"),
            HeaderValue::from_static("no-referrer"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            HeaderName::from_static("x-content-type-options"),
            HeaderValue::from_static("nosniff"),
        ));

    base.merge(shell)
}

fn console_web_root() -> PathBuf {
    std::env::var_os("CONSOLE_WEB_ROOT").map_or_else(
        || {
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .expect("Console Service crate must live below the Console workspace")
                .join("dist")
        },
        PathBuf::from,
    )
}

pub(super) fn console_artifact_root() -> PathBuf {
    std::env::var_os("CONSOLE_ARTIFACT_ROOT").map_or_else(
        || Path::new(env!("CARGO_MANIFEST_DIR")).join("artifacts"),
        PathBuf::from,
    )
}

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConsoleAuthorityResponse {
    schema: &'static str,
    service_id: &'static str,
    workload_mode: crate::ConsoleRecoveryMode,
}

const BOOTSTRAP_STATUS_SCHEMA: &str = "lenso.console-bootstrap-status.v1";
const CONSOLE_ADMIN_USER_SCOPES_KEY: &str = "auth.console_admin_user_scopes";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
enum ConsoleBootstrapState {
    OperatorRequired,
    Ready,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
struct ConsoleBootstrapStatus {
    schema: &'static str,
    status: ConsoleBootstrapState,
    next_action: &'static str,
}

async fn live() -> impl IntoResponse {
    (
        StatusCode::OK,
        axum::Json(HealthResponse { status: "healthy" }),
    )
}

async fn startup() -> impl IntoResponse {
    (
        StatusCode::OK,
        axum::Json(HealthResponse { status: "started" }),
    )
}

async fn authority() -> impl IntoResponse {
    axum::Json(authority_response())
}

fn authority_response() -> ConsoleAuthorityResponse {
    ConsoleAuthorityResponse {
        schema: "lenso.console-authority.v1",
        service_id: CONSOLE_SERVICE_ID,
        workload_mode: crate::recovery_mode().unwrap_or(crate::ConsoleRecoveryMode::Restore),
    }
}

async fn ready(State(ctx): State<AppContext>) -> Response {
    match ctx.db.execute("select 1").await {
        Ok(_) => (
            StatusCode::OK,
            axum::Json(HealthResponse { status: "ready" }),
        )
            .into_response(),
        Err(_) => (
            StatusCode::SERVICE_UNAVAILABLE,
            axum::Json(HealthResponse {
                status: "unavailable",
            }),
        )
            .into_response(),
    }
}

async fn not_found() -> StatusCode {
    StatusCode::NOT_FOUND
}

#[utoipa::path(
    get,
    path = "/v1/status",
    operation_id = "console_get_bootstrap_status",
    tag = "console-bootstrap",
    responses(
        (status = 200, body = ConsoleBootstrapStatus, content_type = "application/json"),
        (status = 503, description = "Console bootstrap state is unavailable")
    )
)]
async fn get_console_bootstrap_status(State(ctx): State<AppContext>) -> Response {
    let value = sqlx::query_scalar::<_, Value>(
        "select value from config.setting_values where service = '*' and key = $1",
    )
    .bind(CONSOLE_ADMIN_USER_SCOPES_KEY)
    .fetch_optional(&ctx.db)
    .await;
    match value.and_then(|value| operator_bootstrap_state(value.as_ref())) {
        Ok(status) => (StatusCode::OK, axum::Json(status)).into_response(),
        Err(_) => (
            StatusCode::SERVICE_UNAVAILABLE,
            axum::Json(HealthResponse {
                status: "unavailable",
            }),
        )
            .into_response(),
    }
}

fn operator_bootstrap_state(value: Option<&Value>) -> Result<ConsoleBootstrapStatus, sqlx::Error> {
    let grants = value
        .as_ref()
        .map_or(Some(0), |value| value.as_object().map(serde_json::Map::len))
        .ok_or_else(|| sqlx::Error::Protocol("Console operator grants must be an object".into()))?;
    Ok(if grants == 0 {
        ConsoleBootstrapStatus {
            schema: BOOTSTRAP_STATUS_SCHEMA,
            status: ConsoleBootstrapState::OperatorRequired,
            next_action: "Run `lenso console operator bootstrap --console-url <url> --identifier <email>` from the Console installation authority.",
        }
    } else {
        ConsoleBootstrapStatus {
            schema: BOOTSTRAP_STATUS_SCHEMA,
            status: ConsoleBootstrapState::Ready,
            next_action: "Sign in with a configured Console operator identity.",
        }
    })
}

#[utoipa::path(
    get,
    path = "/api/console/v1/composition",
    operation_id = "console_get_service_composition",
    tag = "console-composition",
    responses(
        (status = 200, body = ConsoleServiceComposition, content_type = "application/json"),
        (status = 401, description = "Console operator session is required")
    )
)]
async fn get_console_composition(_actor: UserActor) -> Json<ConsoleServiceComposition> {
    let workload_mode = crate::recovery_mode().unwrap_or(crate::ConsoleRecoveryMode::Restore);
    Json(official_composition(workload_mode))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn shell_module_declares_artifact_management_capability() {
        let manifest = manifest();

        assert_eq!(manifest.name, MODULE_NAME);
        assert_eq!(manifest.capabilities, [ARTIFACTS_MANAGE]);
        assert!(manifest.console.is_empty());
        assert_eq!(manifest.http_routes.len(), 3);
        assert_eq!(manifest.http_routes[0].path, "/api/console/v1/composition");
        assert!(manifest.http_routes[0].capability.is_none());
        assert_eq!(manifest.http_routes[1].path, "/bootstrap/v1/status");
        assert!(manifest.http_routes[1].capability.is_none());
        assert_eq!(
            manifest.http_routes[2].path,
            "/api/console/v1/artifacts/reconcile"
        );
        assert_eq!(
            manifest.http_routes[2].capability.as_deref(),
            Some(ARTIFACTS_MANAGE)
        );
    }

    #[test]
    fn authority_probe_is_bound_to_the_console_composition_contract() {
        let response = ConsoleAuthorityResponse {
            schema: "lenso.console-authority.v1",
            service_id: CONSOLE_SERVICE_ID,
            workload_mode: crate::ConsoleRecoveryMode::Restore,
        };
        let value = serde_json::to_value(response).expect("encode authority probe");

        assert_eq!(value["schema"], "lenso.console-authority.v1");
        assert_eq!(value["serviceId"], CONSOLE_SERVICE_ID);
        assert_eq!(value["workloadMode"], "restore");
        assert_eq!(
            crate::composition::COMPOSITION_SCHEMA,
            "lenso.console-service-composition.v2"
        );
    }

    #[test]
    fn default_web_root_is_the_workspace_dist_directory() {
        if std::env::var_os("CONSOLE_WEB_ROOT").is_none() {
            assert_eq!(
                console_web_root(),
                Path::new(env!("CARGO_MANIFEST_DIR"))
                    .parent()
                    .expect("service directory has a parent")
                    .join("dist")
            );
        }
    }

    #[test]
    fn bootstrap_status_requires_an_operator_before_grants_exist() {
        assert_eq!(
            operator_bootstrap_state(None).unwrap().status,
            ConsoleBootstrapState::OperatorRequired
        );
        assert_eq!(
            operator_bootstrap_state(Some(&serde_json::json!({})))
                .unwrap()
                .status,
            ConsoleBootstrapState::OperatorRequired
        );
        assert_eq!(
            operator_bootstrap_state(Some(&serde_json::json!({
                "usr_operator": ["console.admin"]
            })))
            .unwrap()
            .status,
            ConsoleBootstrapState::Ready
        );
        assert!(operator_bootstrap_state(Some(&serde_json::json!([]))).is_err());
    }
}
