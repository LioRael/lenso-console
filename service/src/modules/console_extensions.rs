use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

use axum::http::StatusCode;
use lenso::host::http::{Json, UserActor};
use semver::{Version, VersionReq};
use serde::{Deserialize, Serialize};
use sha2::{Digest as _, Sha256};
use utoipa::ToSchema;

pub const EXTENSIONS_MANAGE: &str = "console.extensions.manage";
const MAX_ARTIFACT_BYTES: usize = 16 * 1024 * 1024;
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

#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
struct ConsoleCompositionArtifact {
    module_id: String,
    package: String,
    version: String,
    artifact_locator: String,
    integrity: String,
    exports: Vec<String>,
    host_api_requirement: String,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConsoleCompositionReceipt {
    candidate_lock_digest: String,
    artifact_digests: Vec<String>,
    registry_digest: String,
}

#[derive(Debug, Serialize)]
struct BundleRegistry {
    version: u8,
    bundles: Vec<BundleManifest>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BundleManifest {
    package_name: String,
    export_name: String,
    entry: String,
    host_api: String,
    version: String,
}

#[utoipa::path(
    post,
    path = "/api/console/v1/extensions/reconcile",
    operation_id = "console_reconcile_extensions",
    tag = "console-extensions",
    request_body = ConsoleCompositionRequest,
    responses(
        (status = 200, body = ConsoleCompositionReceipt, content_type = "application/json"),
        (status = 400, description = "The composition or artifact contract is invalid"),
        (status = 401, description = "Console operator session is required"),
        (status = 403, description = "The operator lacks extension management authority"),
        (status = 502, description = "A declared artifact could not be downloaded")
    )
)]
pub async fn reconcile_extensions(
    actor: UserActor,
    Json(request): Json<ConsoleCompositionRequest>,
) -> Result<Json<ConsoleCompositionReceipt>, (StatusCode, String)> {
    if !actor.scopes.iter().any(|scope| scope == EXTENSIONS_MANAGE) {
        return Err((
            StatusCode::FORBIDDEN,
            format!("missing required capability {EXTENSIONS_MANAGE}"),
        ));
    }
    let _guard = RECONCILE_LOCK.lock().await;
    validate_request(&request).map_err(bad_request)?;
    let mut downloads = BTreeMap::new();
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(internal_error)?;
    for artifact in &request.artifacts {
        let url = reqwest::Url::parse(&artifact.artifact_locator).map_err(bad_request)?;
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
            return Err(bad_request("Console artifact exceeds the 16 MiB limit"));
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(upstream_error)? {
            if bytes.len().saturating_add(chunk.len()) > MAX_ARTIFACT_BYTES {
                return Err(bad_request("Console artifact exceeds the 16 MiB limit"));
            }
            bytes.extend_from_slice(&chunk);
        }
        downloads.insert(artifact.artifact_locator.clone(), bytes);
    }
    let root = super::console_shell::console_extensions_root();
    tokio::task::spawn_blocking(move || reconcile_downloads(&root, &request, &downloads))
        .await
        .map_err(internal_error)?
        .map(Json)
        .map_err(bad_request)
}

fn validate_request(request: &ConsoleCompositionRequest) -> Result<(), String> {
    if request.kind != "console_composition" {
        return Err("kind must be console_composition".to_owned());
    }
    if request.console_service_id != "lenso-console" {
        return Err("console_service_id must be lenso-console".to_owned());
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
        if artifact.package.trim().is_empty() || artifact.exports.is_empty() {
            return Err("Console package and exports must be non-empty".to_owned());
        }
        Version::parse(&artifact.version).map_err(|error| error.to_string())?;
        let requirement =
            VersionReq::parse(&artifact.host_api_requirement).map_err(|error| error.to_string())?;
        if !requirement.matches(&Version::new(1, 0, 0)) {
            return Err(format!(
                "{} requires unsupported Console host API {}",
                artifact.package, artifact.host_api_requirement
            ));
        }
        validate_digest(&artifact.integrity)?;
        let mut exports = artifact.exports.clone();
        exports.sort();
        exports.dedup();
        if exports != artifact.exports || exports.iter().any(|export| export.trim().is_empty()) {
            return Err("Console exports must be sorted, unique, and non-empty".to_owned());
        }
    }
    Ok(())
}

fn reconcile_downloads(
    root: &Path,
    request: &ConsoleCompositionRequest,
    downloads: &BTreeMap<String, Vec<u8>>,
) -> Result<ConsoleCompositionReceipt, String> {
    validate_request(request)?;
    std::fs::create_dir_all(root.join("runtime")).map_err(|error| error.to_string())?;
    let mut bundles = Vec::new();
    let mut artifact_digests = Vec::new();
    for artifact in &request.artifacts {
        let bytes = downloads
            .get(&artifact.artifact_locator)
            .ok_or_else(|| format!("missing downloaded artifact for {}", artifact.module_id))?;
        let actual_digest = sha256(bytes);
        if actual_digest != artifact.integrity {
            return Err(format!(
                "Console artifact integrity mismatch for {}",
                artifact.module_id
            ));
        }
        artifact_digests.push(actual_digest.clone());
        let module_directory = module_directory(&artifact.module_id);
        let file_name = format!("{}.js", actual_digest.trim_start_matches("sha256:"));
        let relative_entry = PathBuf::from("runtime")
            .join(&module_directory)
            .join(&file_name);
        atomic_write(&root.join(&relative_entry), bytes)?;
        let entry = format!("/extensions/{}", relative_entry.to_string_lossy());
        for export_name in &artifact.exports {
            bundles.push(BundleManifest {
                package_name: artifact.package.clone(),
                export_name: export_name.clone(),
                entry: entry.clone(),
                host_api: "1".to_owned(),
                version: artifact.version.clone(),
            });
        }
    }
    bundles.sort_by(|left, right| {
        (&left.package_name, &left.export_name).cmp(&(&right.package_name, &right.export_name))
    });
    artifact_digests.sort();
    let registry = serde_json::to_vec_pretty(&BundleRegistry {
        version: 1,
        bundles,
    })
    .map_err(|error| error.to_string())?;
    let registry_digest = sha256(&registry);
    atomic_write(&root.join("registry.json"), &registry)?;
    let receipt = ConsoleCompositionReceipt {
        candidate_lock_digest: request.candidate_lock_digest.clone(),
        artifact_digests,
        registry_digest,
    };
    let receipt_bytes = serde_json::to_vec_pretty(&receipt).map_err(|error| error.to_string())?;
    atomic_write(&root.join("composition-receipt.json"), &receipt_bytes)?;
    Ok(receipt)
}

fn module_directory(module_id: &str) -> String {
    let digest = Sha256::digest(module_id.as_bytes());
    format!("module-{}", &format!("{digest:x}")[..16])
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
            "lenso-console-composition-{}-{}",
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
                package: "@acme/crm-console".to_owned(),
                version: "1.0.0".to_owned(),
                artifact_locator: "https://modules.example/crm.js".to_owned(),
                integrity: sha256(bytes),
                exports: vec!["crmConsoleModule".to_owned()],
                host_api_requirement: "^1".to_owned(),
            }],
        }
    }

    #[test]
    fn materializes_verified_bundle_and_commits_registry_last() {
        let root = root();
        let bytes = b"export const crmConsoleModule = { id: 'crm', surfaces: [] };";
        let request = request(bytes);
        let downloads = BTreeMap::from([(
            request.artifacts[0].artifact_locator.clone(),
            bytes.to_vec(),
        )]);

        let receipt = reconcile_downloads(&root, &request, &downloads).unwrap();
        let registry: serde_json::Value =
            serde_json::from_slice(&std::fs::read(root.join("registry.json")).unwrap()).unwrap();
        let entry = registry["bundles"][0]["entry"].as_str().unwrap();

        assert_eq!(registry["bundles"][0]["hostApi"], "1");
        assert!(
            root.join(entry.trim_start_matches("/extensions/"))
                .is_file()
        );
        assert_eq!(receipt.artifact_digests, [sha256(bytes)]);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_integrity_mismatch_without_replacing_registry() {
        let root = root();
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("registry.json"), b"old-registry").unwrap();
        let request = request(b"expected");
        let downloads = BTreeMap::from([(
            request.artifacts[0].artifact_locator.clone(),
            b"tampered".to_vec(),
        )]);

        assert!(reconcile_downloads(&root, &request, &downloads).is_err());
        assert_eq!(
            std::fs::read(root.join("registry.json")).unwrap(),
            b"old-registry"
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn empty_composition_removes_all_registry_entries() {
        let root = root();
        let mut request = request(b"unused");
        request.artifacts.clear();

        reconcile_downloads(&root, &request, &BTreeMap::new()).unwrap();
        let registry: serde_json::Value =
            serde_json::from_slice(&std::fs::read(root.join("registry.json")).unwrap()).unwrap();
        assert_eq!(registry["bundles"], serde_json::json!([]));
        std::fs::remove_dir_all(root).unwrap();
    }
}
