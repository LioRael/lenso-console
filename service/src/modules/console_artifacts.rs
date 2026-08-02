use std::collections::{BTreeMap, BTreeSet};
use std::io::Read as _;
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

#[derive(Debug, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConsoleCompositionReceipt {
    candidate_lock_digest: String,
    artifacts: Vec<MaterializedArtifact>,
}

#[derive(Debug, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
struct MaterializedArtifact {
    module_id: String,
    module_release_digest: String,
    artifact_digest: String,
    stored_path: String,
    base_path: String,
    entries: Vec<ConsoleUiArtifactEntry>,
    granted_permissions: Vec<String>,
}

#[utoipa::path(
    get,
    path = "/api/console/v1/artifacts",
    operation_id = "console_get_artifacts",
    tag = "console-artifacts",
    responses(
        (status = 200, body = ConsoleCompositionReceipt, content_type = "application/json"),
        (status = 401, description = "Console operator session is required"),
        (status = 404, description = "No Console artifact composition has been applied")
    )
)]
pub async fn get_artifacts(
    _actor: UserActor,
) -> Result<Json<ConsoleCompositionReceipt>, (StatusCode, String)> {
    let path = super::console_shell::console_artifact_root().join("composition-receipt.json");
    let bytes = std::fs::read(path).map_err(|_| {
        (
            StatusCode::NOT_FOUND,
            "Console artifact composition not found".to_owned(),
        )
    })?;
    serde_json::from_slice(&bytes)
        .map(Json)
        .map_err(internal_error)
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
            || artifact
                .entries
                .iter()
                .any(|entry| entry.name.trim().is_empty() || !safe_entry_path(&entry.path))
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
        let base_path = materialize_web_artifact(root, artifact, bytes)?;
        let granted_permissions = artifact
            .requested_permissions
            .iter()
            .filter_map(|permission| permission.get("permission_id")?.as_str())
            .map(ToOwned::to_owned)
            .collect();
        materialized.push(MaterializedArtifact {
            module_id: artifact.module_id.clone(),
            module_release_digest: artifact.module_release_digest.clone(),
            artifact_digest: artifact.digest.clone(),
            stored_path: stored_path.to_string_lossy().into_owned(),
            base_path,
            entries: artifact.entries.clone(),
            granted_permissions,
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

fn safe_entry_path(value: &str) -> bool {
    let path = value.split_once('?').map_or(value, |(path, _)| path);
    !path.is_empty()
        && !path.starts_with('/')
        && !path.contains('\\')
        && path
            .split('/')
            .all(|segment| !segment.is_empty() && segment != "." && segment != "..")
}

fn materialize_web_artifact(
    root: &Path,
    artifact: &ConsoleCompositionArtifact,
    bytes: &[u8],
) -> Result<String, String> {
    const MAX_EXPANDED_BYTES: u64 = 128 * 1024 * 1024;
    const MAX_FILES: usize = 4_096;

    let digest = artifact.digest.trim_start_matches("sha256:");
    let relative = PathBuf::from("web").join(digest);
    let destination = root.join(&relative);
    if destination.is_dir() {
        validate_materialized_entries(&destination, &artifact.entries)?;
        return Ok(format!("/artifacts/{digest}/"));
    }
    let temporary = root.join(format!(".web-{digest}-{}", std::process::id()));
    if temporary.exists() {
        std::fs::remove_dir_all(&temporary).map_err(|error| error.to_string())?;
    }
    std::fs::create_dir_all(&temporary).map_err(|error| error.to_string())?;

    let result = (|| {
        let decoder = flate2::read::GzDecoder::new(bytes);
        let mut archive = tar::Archive::new(decoder);
        let mut expanded = 0_u64;
        let mut files = 0_usize;
        for item in archive.entries().map_err(|error| error.to_string())? {
            let mut item = item.map_err(|error| error.to_string())?;
            if !item.header().entry_type().is_file() {
                continue;
            }
            let archive_path = item.path().map_err(|error| error.to_string())?;
            let web_path = archive_web_path(&archive_path)?;
            let Some(web_path) = web_path else { continue };
            files += 1;
            expanded = expanded.saturating_add(item.size());
            if files > MAX_FILES || expanded > MAX_EXPANDED_BYTES {
                return Err("Console artifact expanded size limit exceeded".to_owned());
            }
            let target = temporary.join(&web_path);
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
            }
            let mut output = std::fs::File::create(target).map_err(|error| error.to_string())?;
            let size = item.size();
            std::io::copy(&mut item.by_ref().take(size), &mut output)
                .map_err(|error| error.to_string())?;
        }
        validate_materialized_entries(&temporary, &artifact.entries)
    })();
    if let Err(error) = result {
        let _ = std::fs::remove_dir_all(&temporary);
        return Err(error);
    }
    if let Some(parent) = destination.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    std::fs::rename(&temporary, &destination).map_err(|error| error.to_string())?;
    Ok(format!("/artifacts/{digest}/"))
}

fn archive_web_path(path: &Path) -> Result<Option<PathBuf>, String> {
    let components = path
        .components()
        .map(|component| match component {
            std::path::Component::Normal(value) => value.to_owned(),
            _ => std::ffi::OsString::new(),
        })
        .collect::<Vec<_>>();
    if components.iter().any(|part| part.is_empty()) {
        return Err("Console artifact contains an unsafe archive path".to_owned());
    }
    let start = if components.first().is_some_and(|part| part == "package")
        && components.get(1).is_some_and(|part| part == "dist")
    {
        2
    } else if components.first().is_some_and(|part| part == "dist") {
        1
    } else {
        return Ok(None);
    };
    let relative = components[start..].iter().collect::<PathBuf>();
    Ok((!relative.as_os_str().is_empty()).then_some(relative))
}

fn validate_materialized_entries(
    root: &Path,
    entries: &[ConsoleUiArtifactEntry],
) -> Result<(), String> {
    for entry in entries {
        let path = entry
            .path
            .split_once('?')
            .map_or(entry.path.as_str(), |(path, _)| path);
        if !root.join(path).is_file() {
            return Err(format!("Console artifact entry is missing: {}", entry.name));
        }
    }
    Ok(())
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
    use flate2::Compression;
    use flate2::write::GzEncoder;
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
                requested_permissions: vec![serde_json::json!({
                    "permission_id": "crm.contacts.read",
                    "operations": ["admin_data_list"]
                })],
            }],
        }
    }

    fn artifact() -> Vec<u8> {
        let encoder = GzEncoder::new(Vec::new(), Compression::default());
        let mut archive = tar::Builder::new(encoder);
        let content = b"<!doctype html><title>CRM</title>";
        let mut header = tar::Header::new_gnu();
        header.set_mode(0o644);
        header.set_size(content.len() as u64);
        header.set_cksum();
        archive
            .append_data(&mut header, "package/dist/index.html", &content[..])
            .unwrap();
        archive.into_inner().unwrap().finish().unwrap()
    }

    #[test]
    fn materializes_verified_artifact_and_receipt() {
        let root = root();
        let bytes = artifact();
        let request = request(&bytes);
        let downloads = BTreeMap::from([(request.artifacts[0].locator.clone(), bytes)]);

        let receipt = materialize_downloads(&root, &request, &downloads).unwrap();

        assert_eq!(receipt.artifacts.len(), 1);
        assert!(root.join(&receipt.artifacts[0].stored_path).is_file());
        assert!(
            root.join("web")
                .join(
                    receipt.artifacts[0]
                        .artifact_digest
                        .trim_start_matches("sha256:"),
                )
                .join("index.html")
                .is_file()
        );
        assert_eq!(
            receipt.artifacts[0].granted_permissions,
            ["crm.contacts.read"]
        );
        assert!(root.join("composition-receipt.json").is_file());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_integrity_mismatch_without_writing_receipt() {
        let root = root();
        let request = request(&artifact());
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
