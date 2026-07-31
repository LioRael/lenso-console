use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

use axum::http::StatusCode;
use lenso::host::http::{Json, UserActor};
use serde::{Deserialize, Serialize};
use sha2::{Digest as _, Sha256};
use utoipa::ToSchema;

pub const ARTIFACTS_MANAGE: &str = "console.artifacts.manage";
const MAX_ARTIFACT_BYTES: usize = 64 * 1024 * 1024;
static RECONCILE_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ConsoleCompositionRequest {
    kind: String,
    effect_id: String,
    console_service_id: String,
    candidate_lock_digest: String,
    artifacts: Vec<ConsoleCompositionArtifact>,
}

#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
#[serde(deny_unknown_fields)]
struct ConsoleCompositionArtifact {
    module_id: String,
    module_release_digest: String,
    locator: String,
    digest: String,
    format: String,
    entries: Vec<ConsoleUiArtifactEntry>,
    bridge_protocol: String,
    requested_permissions: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
#[serde(deny_unknown_fields)]
struct ConsoleUiArtifactEntry {
    name: String,
    path: String,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConsoleCompositionReceipt {
    candidate_lock_digest: String,
    artifacts: Vec<MaterializedArtifact>,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
struct MaterializedArtifact {
    module_id: String,
    module_release_digest: String,
    artifact_digest: String,
    stored_path: String,
}

#[utoipa::path(
    post,
    path = "/api/console/v1/artifacts/reconcile",
    operation_id = "console_reconcile_artifacts",
    tag = "console-artifacts",
    request_body = ConsoleCompositionRequest,
    responses(
        (status = 200, body = ConsoleCompositionReceipt, content_type = "application/json"),
        (status = 400, description = "The composition or artifact contract is invalid"),
        (status = 401, description = "Console operator session is required"),
        (status = 403, description = "The operator lacks artifact management authority"),
        (status = 502, description = "A declared artifact could not be downloaded")
    )
)]
pub async fn reconcile_artifacts(
    actor: UserActor,
    Json(request): Json<ConsoleCompositionRequest>,
) -> Result<Json<ConsoleCompositionReceipt>, (StatusCode, String)> {
    if !actor.scopes.iter().any(|scope| scope == ARTIFACTS_MANAGE) {
        return Err((
            StatusCode::FORBIDDEN,
            format!("missing required capability {ARTIFACTS_MANAGE}"),
        ));
    }
    let _guard = RECONCILE_LOCK.lock().await;
    validate_request(&request).map_err(bad_request)?;
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(internal_error)?;
    let mut downloads = BTreeMap::new();
    for artifact in &request.artifacts {
        let url = reqwest::Url::parse(&artifact.locator).map_err(bad_request)?;
        if url.scheme() != "https"
            && !(url.scheme() == "http"
                && url.host_str().is_some_and(|host| {
                    host == "localhost"
                        || host
                            .parse::<std::net::IpAddr>()
                            .is_ok_and(|ip| ip.is_loopback())
                }))
        {
            return Err(bad_request(
                "artifact locator must use HTTPS or loopback HTTP",
            ));
        }
        let mut response = client
            .get(url)
            .send()
            .await
            .map_err(upstream_error)?
            .error_for_status()
            .map_err(upstream_error)?;
        if response
            .content_length()
            .is_some_and(|length| length > MAX_ARTIFACT_BYTES as u64)
        {
            return Err(bad_request("Console artifact exceeds the 64 MiB limit"));
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(upstream_error)? {
            if bytes.len().saturating_add(chunk.len()) > MAX_ARTIFACT_BYTES {
                return Err(bad_request("Console artifact exceeds the 64 MiB limit"));
            }
            bytes.extend_from_slice(&chunk);
        }
        downloads.insert(artifact.locator.clone(), bytes);
    }
    let root = super::console_shell::console_artifact_root();
    tokio::task::spawn_blocking(move || materialize_downloads(&root, &request, &downloads))
        .await
        .map_err(internal_error)?
        .map(Json)
        .map_err(bad_request)
}

fn validate_request(request: &ConsoleCompositionRequest) -> Result<(), String> {
    if request.kind != "console_composition" || request.console_service_id != "lenso-console" {
        return Err("request must be a lenso-console composition effect".to_owned());
    }
    validate_digest(&request.candidate_lock_digest)?;
    if request.effect_id.trim().is_empty() {
        return Err("effect_id must be non-empty".to_owned());
    }
    let mut modules = BTreeSet::new();
    for artifact in &request.artifacts {
        if !modules.insert(&artifact.module_id) {
            return Err(format!(
                "duplicate Console artifact for {}",
                artifact.module_id
            ));
        }
        validate_digest(&artifact.module_release_digest)?;
        validate_digest(&artifact.digest)?;
        if artifact.format != "isolated_web" {
            return Err("only isolated_web Console artifacts are supported".to_owned());
        }
        if artifact.bridge_protocol != "lenso.console-bridge.v1" {
            return Err("unsupported Console Bridge protocol".to_owned());
        }
        if artifact.entries.is_empty()
            || artifact.entries.iter().any(|entry| {
                entry.name.trim().is_empty()
                    || entry.path.trim().is_empty()
                    || entry.path.starts_with('/')
                    || entry.path.split('/').any(|segment| segment == "..")
            })
        {
            return Err("Console artifact entries must be safe relative paths".to_owned());
        }
    }
    Ok(())
}

fn materialize_downloads(
    root: &Path,
    request: &ConsoleCompositionRequest,
    downloads: &BTreeMap<String, Vec<u8>>,
) -> Result<ConsoleCompositionReceipt, String> {
    validate_request(request)?;
    let mut materialized = Vec::new();
    for artifact in &request.artifacts {
        let bytes = downloads
            .get(&artifact.locator)
            .ok_or_else(|| format!("missing downloaded artifact for {}", artifact.module_id))?;
        if sha256(bytes) != artifact.digest {
            return Err(format!(
                "Console artifact integrity mismatch for {}",
                artifact.module_id
            ));
        }
        let stored_path = PathBuf::from("objects")
            .join(artifact.digest.trim_start_matches("sha256:"))
            .with_extension("artifact");
        atomic_write(&root.join(&stored_path), bytes)?;
        materialized.push(MaterializedArtifact {
            module_id: artifact.module_id.clone(),
            module_release_digest: artifact.module_release_digest.clone(),
            artifact_digest: artifact.digest.clone(),
            stored_path: stored_path.to_string_lossy().into_owned(),
        });
    }
    let receipt = ConsoleCompositionReceipt {
        candidate_lock_digest: request.candidate_lock_digest.clone(),
        artifacts: materialized,
    };
    let receipt_bytes = serde_json::to_vec_pretty(&receipt).map_err(|error| error.to_string())?;
    atomic_write(&root.join("composition-receipt.json"), &receipt_bytes)?;
    Ok(receipt)
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "path has no parent".to_owned())?;
    std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let temporary = parent.join(format!(
        ".{}.tmp-{}",
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("artifact"),
        std::process::id()
    ));
    std::fs::write(&temporary, bytes).map_err(|error| error.to_string())?;
    std::fs::rename(&temporary, path).map_err(|error| error.to_string())
}

fn sha256(bytes: &[u8]) -> String {
    format!("sha256:{:x}", Sha256::digest(bytes))
}

fn validate_digest(value: &str) -> Result<(), String> {
    let hex = value
        .strip_prefix("sha256:")
        .ok_or_else(|| "digest must use sha256".to_owned())?;
    if hex.len() != 64 || !hex.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("digest must contain 64 hexadecimal characters".to_owned());
    }
    Ok(())
}

fn bad_request(error: impl std::fmt::Display) -> (StatusCode, String) {
    (StatusCode::BAD_REQUEST, error.to_string())
}

fn upstream_error(error: impl std::fmt::Display) -> (StatusCode, String) {
    (StatusCode::BAD_GATEWAY, error.to_string())
}

fn internal_error(error: impl std::fmt::Display) -> (StatusCode, String) {
    (StatusCode::INTERNAL_SERVER_ERROR, error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT_ROOT: AtomicU64 = AtomicU64::new(1);

    fn root() -> PathBuf {
        std::env::temp_dir().join(format!(
            "lenso-console-artifacts-{}-{}",
            std::process::id(),
            NEXT_ROOT.fetch_add(1, Ordering::Relaxed)
        ))
    }

    fn request(bytes: &[u8]) -> ConsoleCompositionRequest {
        ConsoleCompositionRequest {
            kind: "console_composition".to_owned(),
            effect_id: "25-console-composition:lenso-console".to_owned(),
            console_service_id: "lenso-console".to_owned(),
            candidate_lock_digest: format!("sha256:{}", "a".repeat(64)),
            artifacts: vec![ConsoleCompositionArtifact {
                module_id: "acme/crm".to_owned(),
                module_release_digest: format!("sha256:{}", "b".repeat(64)),
                locator: "https://modules.example/crm.artifact".to_owned(),
                digest: sha256(bytes),
                format: "isolated_web".to_owned(),
                entries: vec![ConsoleUiArtifactEntry {
                    name: "main".to_owned(),
                    path: "index.html".to_owned(),
                }],
                bridge_protocol: "lenso.console-bridge.v1".to_owned(),
                requested_permissions: Vec::new(),
            }],
        }
    }

    #[test]
    fn materializes_verified_artifact_and_receipt() {
        let root = root();
        let bytes = b"immutable isolated web artifact";
        let request = request(bytes);
        let downloads = BTreeMap::from([(request.artifacts[0].locator.clone(), bytes.to_vec())]);

        let receipt = materialize_downloads(&root, &request, &downloads).unwrap();

        assert_eq!(receipt.artifacts.len(), 1);
        assert!(root.join(&receipt.artifacts[0].stored_path).is_file());
        assert!(root.join("composition-receipt.json").is_file());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_integrity_mismatch_without_writing_receipt() {
        let root = root();
        let request = request(b"expected");
        let downloads =
            BTreeMap::from([(request.artifacts[0].locator.clone(), b"tampered".to_vec())]);

        assert!(materialize_downloads(&root, &request, &downloads).is_err());
        assert!(!root.join("composition-receipt.json").exists());
    }

    #[test]
    fn empty_composition_commits_an_empty_receipt() {
        let root = root();
        let mut request = request(b"unused");
        request.artifacts.clear();

        let receipt = materialize_downloads(&root, &request, &BTreeMap::new()).unwrap();

        assert!(receipt.artifacts.is_empty());
        std::fs::remove_dir_all(root).unwrap();
    }
}
