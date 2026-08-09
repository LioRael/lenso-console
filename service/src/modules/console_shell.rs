use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

use axum::extract::State;
use axum::http::{HeaderName, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{any, get};
use base64::Engine;
use lenso::host::http::{
    ApiOpenApiRouter, AppContext, Json, ModuleHttpMethod, ModuleHttpRoute, OpenApiRouter,
    UserActor, routes,
};
use lenso::host::prelude::*;
use serde::Serialize;
use sha2::{Digest, Sha256};
use sqlx::Executor;
use tower_http::services::{ServeDir, ServeFile};
use tower_http::set_header::SetResponseHeaderLayer;

use super::console_artifacts::{
    __path_get_artifacts, __path_reconcile_artifacts, ARTIFACTS_MANAGE, get_artifacts,
    reconcile_artifacts,
};
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
                path: "/api/console/v1/artifacts".to_owned(),
                capability: None,
                operation: None,
                display_name: Some("Inspect Console UI Artifacts".to_owned()),
                story_title: None,
            },
            ModuleHttpRoute {
                method: ModuleHttpMethod::Get,
                path: "/artifacts/{digest}/{*path}".to_owned(),
                capability: None,
                operation: None,
                display_name: Some("Load Console UI ESM Artifact".to_owned()),
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
                "/api/console/v1/artifacts",
                "/api/console/v1/artifacts/reconcile",
                "/artifacts/",
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
    let content_security_policy = content_security_policy_for_index(&index);

    let artifacts = ServeDir::new(console_artifact_root().join("web"));
    let shell = OpenApiRouter::new()
        .routes(routes!(get_console_composition))
        .routes(routes!(get_artifacts))
        .routes(routes!(reconcile_artifacts))
        .nest_service("/artifacts", artifacts)
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
            content_security_policy,
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

fn content_security_policy_for_index(index: &Path) -> HeaderValue {
    let html = std::fs::read(index).unwrap_or_else(|error| {
        panic!(
            "Console Shell build cannot be read at {}: {error}",
            index.display()
        )
    });
    let policy = content_security_policy_for_html(&html);
    HeaderValue::from_str(&policy).expect("Console Content-Security-Policy must be valid")
}

fn content_security_policy_for_html(html: &[u8]) -> String {
    let mut policy = String::from(
        "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'",
    );
    for hash in inline_script_hashes(html) {
        policy.push(' ');
        policy.push_str(&hash);
    }
    policy.push_str("; connect-src 'self' https:; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
    policy
}

fn inline_script_hashes(html: &[u8]) -> BTreeSet<String> {
    const SCRIPT_OPEN: &[u8] = b"<script";
    const SCRIPT_CLOSE: &[u8] = b"</script>";

    let mut hashes = BTreeSet::new();
    let mut cursor = 0;
    while let Some(open_offset) = find_subslice(&html[cursor..], SCRIPT_OPEN) {
        let open_start = cursor + open_offset;
        let Some(tag_end_offset) = find_subslice(&html[open_start..], b">") else {
            break;
        };
        let content_start = open_start + tag_end_offset + 1;
        let Some(close_offset) = find_subslice(&html[content_start..], SCRIPT_CLOSE) else {
            break;
        };
        let content_end = content_start + close_offset;
        if content_start < content_end {
            let source = normalize_script_source(&html[content_start..content_end]);
            let digest = Sha256::digest(source);
            let encoded = base64::engine::general_purpose::STANDARD.encode(digest);
            hashes.insert(format!("'sha256-{encoded}'"));
        }
        cursor = content_end + SCRIPT_CLOSE.len();
    }
    hashes
}

fn normalize_script_source(source: &[u8]) -> Vec<u8> {
    let mut normalized = Vec::with_capacity(source.len());
    let mut index = 0;
    while index < source.len() {
        match source[index] {
            0 => normalized.extend_from_slice("\u{fffd}".as_bytes()),
            b'\r' => {
                normalized.push(b'\n');
                if source.get(index + 1) == Some(&b'\n') {
                    index += 1;
                }
            }
            byte => normalized.push(byte),
        }
        index += 1;
    }
    normalized
}

fn find_subslice(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

fn console_web_root() -> PathBuf {
    std::env::var_os("CONSOLE_WEB_ROOT").map_or_else(
        || {
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .expect("Console Service crate must live below the Console workspace")
                .join("dist")
                .join("client")
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

        assert_eq!(manifest.module_id, MODULE_NAME);
        assert_eq!(manifest.capabilities, [ARTIFACTS_MANAGE]);
        assert!(manifest.console.is_empty());
        assert_eq!(manifest.http_routes.len(), 4);
        assert_eq!(manifest.http_routes[0].path, "/api/console/v1/composition");
        assert!(manifest.http_routes[0].capability.is_none());
        assert_eq!(manifest.http_routes[1].path, "/api/console/v1/artifacts");
        assert!(manifest.http_routes[1].capability.is_none());
        assert_eq!(manifest.http_routes[2].path, "/artifacts/{digest}/{*path}");
        assert!(manifest.http_routes[2].capability.is_none());
        assert_eq!(
            manifest.http_routes[3].path,
            "/api/console/v1/artifacts/reconcile"
        );
        assert_eq!(
            manifest.http_routes[3].capability.as_deref(),
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
    fn default_web_root_is_the_workspace_client_directory() {
        if std::env::var_os("CONSOLE_WEB_ROOT").is_none() {
            assert_eq!(
                console_web_root(),
                Path::new(env!("CARGO_MANIFEST_DIR"))
                    .parent()
                    .expect("service directory has a parent")
                    .join("dist")
                    .join("client")
            );
        }
    }

    #[test]
    fn content_security_policy_hashes_inline_start_bootstrap() {
        let html = b"<script>window.$R = \0;</script><script type=\"module\" src=\"/assets/app.js\"></script>";
        let policy = content_security_policy_for_html(html);
        let digest = Sha256::digest("window.$R = \u{fffd};".as_bytes());
        let hash = base64::engine::general_purpose::STANDARD.encode(digest);

        assert!(policy.contains(&format!("'sha256-{hash}'")));
        assert!(!policy.contains("script-src 'self' 'unsafe-inline'"));
    }
}
