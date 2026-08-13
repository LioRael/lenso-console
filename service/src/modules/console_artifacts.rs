use std::collections::{BTreeMap, BTreeSet};
use std::io::Read as _;
use std::path::{Path, PathBuf};

use lenso::ArtifactReference;
use lenso::console::{
    CONSOLE_MODULE_PROTOCOL, CONSOLE_MODULE_PROTOCOL_MAJOR, CONSOLE_UI_ESM_FORMAT,
    ConsoleUiArtifact, ConsoleUiArtifactEntry, ConsoleUiArtifactFormat,
    ConsoleUiArtifactStyleAsset,
};
use lenso::host::http::{
    ApiErrorResponse, AppContext, AppError, ErrorCode, ErrorResponse, HttpRequestContext, Json,
    RequestContext, State, UserActor,
};
use lenso_module_management::ConsoleCompositionArtifact;
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
    /// This is the exact framework Module Management artifact contract. The
    /// Console Service adds no competing artifact input type.
    #[schema(value_type = Vec<serde_json::Value>)]
    artifacts: Vec<ConsoleCompositionArtifact>,
    #[serde(default)]
    theme_bundles: Vec<ConsoleThemeBundleArtifact>,
}

#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ConsoleThemeBundleArtifact {
    bundle_id: String,
    version: String,
    locator: String,
    digest: String,
    format: String,
    #[schema(value_type = Vec<serde_json::Value>)]
    entries: Vec<ConsoleUiArtifactEntry>,
    manifest: serde_json::Value,
    #[serde(default)]
    requested_permissions: Vec<serde_json::Value>,
}

#[derive(Debug, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConsoleCompositionReceipt {
    candidate_lock_digest: String,
    artifacts: Vec<MaterializedArtifact>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    theme_bundles: Vec<MaterializedThemeBundle>,
}

#[derive(Debug, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
struct MaterializedArtifact {
    module_id: String,
    module_release_digest: String,
    artifact_digest: String,
    protocol_major: u32,
    format: String,
    stored_path: String,
    base_path: String,
    entry: String,
    #[schema(value_type = Vec<serde_json::Value>)]
    entries: Vec<ConsoleUiArtifactEntry>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[schema(value_type = Vec<serde_json::Value>)]
    style_assets: Vec<ConsoleUiArtifactStyleAsset>,
    #[schema(value_type = serde_json::Value)]
    manifest: lenso::console::ConsoleModuleManifest,
    /// The exact framework artifact contract retained beside the local
    /// materialization receipt. The flattened fields above are only local
    /// serving metadata and must never become a competing input schema.
    #[schema(value_type = serde_json::Value)]
    contract: ConsoleUiArtifact,
    granted_permissions: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
struct MaterializedThemeBundle {
    bundle_id: String,
    version: String,
    artifact_digest: String,
    format: String,
    stored_path: String,
    base_path: String,
    #[schema(value_type = Vec<serde_json::Value>)]
    entries: Vec<ConsoleUiArtifactEntry>,
    manifest: serde_json::Value,
    granted_permissions: Vec<String>,
}

#[utoipa::path(
    get,
    path = "/api/console/v1/artifacts",
    operation_id = "console_get_artifacts",
    tag = "console-artifacts",
    responses(
        (status = 200, body = ConsoleCompositionReceipt, content_type = "application/json"),
        (status = 401, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 404, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 500, body = ErrorResponse, content_type = "application/problem+json")
    )
)]
pub async fn get_artifacts(
    _actor: UserActor,
    HttpRequestContext(request_ctx): HttpRequestContext,
) -> Result<Json<ConsoleCompositionReceipt>, ApiErrorResponse> {
    let path = super::console_shell::console_artifact_root().join("composition-receipt.json");
    let bytes = std::fs::read(path).map_err(|_| {
        api_error(
            ErrorCode::NotFound,
            "Console artifact composition not found",
            &request_ctx,
        )
    })?;
    serde_json::from_slice(&bytes)
        .map(Json)
        .map_err(|error| internal_error(error, &request_ctx))
}

#[utoipa::path(
    post,
    path = "/api/console/v1/artifacts/reconcile",
    operation_id = "console_reconcile_artifacts",
    tag = "console-artifacts",
    request_body = ConsoleCompositionRequest,
    responses(
        (status = 200, body = ConsoleCompositionReceipt, content_type = "application/json"),
        (status = 400, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 401, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 403, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 502, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 500, body = ErrorResponse, content_type = "application/problem+json")
    )
)]
pub async fn reconcile_artifacts(
    State(ctx): State<AppContext>,
    actor: UserActor,
    HttpRequestContext(request_ctx): HttpRequestContext,
    Json(request): Json<ConsoleCompositionRequest>,
) -> Result<Json<ConsoleCompositionReceipt>, ApiErrorResponse> {
    crate::modules::console_access::require_console_capability(
        &ctx,
        &actor,
        ARTIFACTS_MANAGE,
        &request_ctx,
    )
    .await?;
    let _guard = RECONCILE_LOCK.lock().await;
    validate_request(&request).map_err(|error| bad_request(error, &request_ctx))?;
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|error| internal_error(error, &request_ctx))?;
    let mut downloads = BTreeMap::new();
    for locator in artifact_locators(&request) {
        let url =
            reqwest::Url::parse(&locator).map_err(|error| bad_request(error, &request_ctx))?;
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
                &request_ctx,
            ));
        }
        let mut response = client
            .get(url)
            .send()
            .await
            .map_err(|error| upstream_error(error, &request_ctx))?
            .error_for_status()
            .map_err(|error| upstream_error(error, &request_ctx))?;
        if response
            .content_length()
            .is_some_and(|length| length > MAX_ARTIFACT_BYTES as u64)
        {
            return Err(bad_request(
                "Console artifact exceeds the 64 MiB limit",
                &request_ctx,
            ));
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|error| upstream_error(error, &request_ctx))?
        {
            if bytes.len().saturating_add(chunk.len()) > MAX_ARTIFACT_BYTES {
                return Err(bad_request(
                    "Console artifact exceeds the 64 MiB limit",
                    &request_ctx,
                ));
            }
            bytes.extend_from_slice(&chunk);
        }
        downloads.insert(locator, bytes);
    }
    let root = super::console_shell::console_artifact_root();
    tokio::task::spawn_blocking(move || materialize_downloads(&root, &request, &downloads))
        .await
        .map_err(|error| internal_error(error, &request_ctx))?
        .map(Json)
        .map_err(|error| bad_request(error, &request_ctx))
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
        let console = framework_console_artifact(artifact);
        validate_console_artifact(&console, &artifact.module_id)?;
    }
    let mut bundles = BTreeSet::new();
    for bundle in &request.theme_bundles {
        if !bundles.insert(&bundle.bundle_id) {
            return Err(format!(
                "duplicate Console Theme Bundle for {}",
                bundle.bundle_id
            ));
        }
        validate_theme_bundle(bundle)?;
    }
    Ok(())
}

fn framework_console_artifact(artifact: &ConsoleCompositionArtifact) -> ConsoleUiArtifact {
    ConsoleUiArtifact {
        artifact: ArtifactReference {
            locator: artifact.locator.clone(),
            digest: artifact.digest.clone(),
        },
        format: artifact.format.clone(),
        protocol_major: artifact.protocol_major,
        entry: artifact.entry.clone(),
        entries: artifact.entries.clone(),
        style_assets: artifact.style_assets.clone(),
        manifest: artifact.manifest.clone(),
        requested_permissions: artifact.requested_permissions.clone(),
        provenance: Vec::new(),
    }
}

fn validate_console_artifact(
    artifact: &ConsoleUiArtifact,
    expected_module_id: &str,
) -> Result<(), String> {
    if artifact.artifact.locator.trim().is_empty() {
        return Err("Console UI artifact locator is empty".to_owned());
    }
    validate_digest(&artifact.artifact.digest)?;
    if !matches!(artifact.format, ConsoleUiArtifactFormat::Esm) {
        return Err(format!(
            "Console UI artifact format must be {CONSOLE_UI_ESM_FORMAT}"
        ));
    }
    if artifact.protocol_major != CONSOLE_MODULE_PROTOCOL_MAJOR {
        return Err(format!(
            "Console UI artifact protocol major must be {CONSOLE_MODULE_PROTOCOL_MAJOR}"
        ));
    }
    if artifact.manifest.protocol != CONSOLE_MODULE_PROTOCOL
        || artifact.manifest.module_id != expected_module_id
    {
        return Err("Console UI artifact manifest identity is invalid".to_owned());
    }
    if artifact.manifest.surfaces.is_empty() {
        return Err("Console UI artifact manifest must declare surfaces".to_owned());
    }
    let mut surface_ids = BTreeSet::new();
    let mut surface_paths = BTreeSet::new();
    for surface in &artifact.manifest.surfaces {
        if surface.id.trim().is_empty() || !surface_ids.insert(&surface.id) {
            return Err("Console surface ids must be non-empty and unique".to_owned());
        }
        if !surface.path.starts_with('/')
            || surface.path.contains('\\')
            || surface.path.contains('?')
            || surface.path.contains('#')
            || surface.path.split('/').any(|segment| segment == "..")
            || !surface_paths.insert(&surface.path)
        {
            return Err("Console surface paths must be absolute and unique".to_owned());
        }
    }
    if !safe_entry_path(&artifact.entry) {
        return Err("Console UI artifact entry must be a safe relative path".to_owned());
    }
    if artifact.entries.is_empty() {
        return Err("Console UI artifact must declare entries".to_owned());
    }
    let mut entry_names = BTreeSet::new();
    let mut entry_paths = BTreeSet::new();
    if artifact.entries.iter().any(|entry| {
        entry.name.trim().is_empty()
            || !safe_entry_path(&entry.path)
            || !entry_names.insert(&entry.name)
            || !entry_paths.insert(&entry.path)
    }) {
        return Err("Console UI artifact entries must be safe and unique".to_owned());
    }
    if !entry_paths.contains(&artifact.entry) {
        return Err("Console UI artifact entry must be declared in entries".to_owned());
    }
    let mut style_paths = BTreeSet::new();
    for asset in &artifact.style_assets {
        if !safe_entry_path(&asset.path)
            || !style_paths.insert(&asset.path)
            || !entry_paths.contains(&asset.path)
        {
            return Err("Console UI style assets must be safe and declared".to_owned());
        }
    }
    if artifact
        .requested_permissions
        .iter()
        .any(|permission| permission.permission_id.trim().is_empty())
    {
        return Err("Console UI requested permission ids must be non-empty".to_owned());
    }
    Ok(())
}

fn artifact_locators(request: &ConsoleCompositionRequest) -> Vec<String> {
    request
        .artifacts
        .iter()
        .map(|artifact| artifact.locator.clone())
        .chain(
            request
                .theme_bundles
                .iter()
                .map(|bundle| bundle.locator.clone()),
        )
        .collect()
}

fn validate_theme_bundle(bundle: &ConsoleThemeBundleArtifact) -> Result<(), String> {
    if bundle.format != "console_theme_bundle"
        || !publisher_namespaced_id(&bundle.bundle_id)
        || bundle.version.trim().is_empty()
    {
        return Err("Console Theme Bundle identity is invalid".to_owned());
    }
    validate_digest(&bundle.digest)?;
    if bundle.entries.is_empty() {
        return Err("Console Theme Bundle must declare entries".to_owned());
    }
    let mut names = BTreeSet::new();
    let mut paths = BTreeSet::<String>::new();
    if bundle.entries.iter().any(|entry| {
        entry.name.trim().is_empty()
            || !safe_entry_path(&entry.path)
            || !names.insert(&entry.name)
            || !paths.insert(entry.path.clone())
    }) {
        return Err("Console Theme Bundle entries must be safe and unique".to_owned());
    }
    let manifest = bundle
        .manifest
        .as_object()
        .ok_or_else(|| "Console Theme Bundle manifest must be an object".to_owned())?;
    if manifest.get("format").and_then(serde_json::Value::as_str) != Some("console_theme_bundle")
        || manifest.get("bundleId").and_then(serde_json::Value::as_str)
            != Some(bundle.bundle_id.as_str())
    {
        return Err("Console Theme Bundle manifest identity is invalid".to_owned());
    }
    let variants = manifest
        .get("variants")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| "Console Theme Bundle variants are required".to_owned())?;
    if variants.is_empty()
        || manifest
            .get("defaultVariant")
            .and_then(serde_json::Value::as_str)
            .is_none_or(|default| {
                !variants.iter().any(|variant| {
                    variant.get("id").and_then(serde_json::Value::as_str) == Some(default)
                })
            })
    {
        return Err("Console Theme Bundle default variant is invalid".to_owned());
    }
    let assets = manifest
        .get("assets")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| "Console Theme Bundle assets are required".to_owned())?;
    for asset in assets {
        let path = asset
            .get("path")
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| "Console Theme Bundle asset path is required".to_owned())?;
        if !paths.contains(path) {
            return Err(format!("Console Theme Bundle asset is undeclared: {path}"));
        }
    }
    if let Some(composition) = manifest.get("composition") {
        let entry = composition
            .get("entry")
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| "Console Theme Bundle composition entry is required".to_owned())?;
        if !paths.contains(entry) {
            return Err("Console Theme Bundle composition entry is undeclared".to_owned());
        }
    }
    Ok(())
}

fn publisher_namespaced_id(value: &str) -> bool {
    let Some((publisher, name)) = value.split_once('/') else {
        return false;
    };
    !publisher.is_empty() && !name.is_empty() && !value.chars().any(char::is_whitespace)
}

fn materialize_downloads(
    root: &Path,
    request: &ConsoleCompositionRequest,
    downloads: &BTreeMap<String, Vec<u8>>,
) -> Result<ConsoleCompositionReceipt, String> {
    validate_request(request)?;
    let mut materialized = Vec::new();
    for artifact in &request.artifacts {
        let console = framework_console_artifact(artifact);
        let locator = &artifact.locator;
        let digest = &artifact.digest;
        let bytes = downloads
            .get(locator)
            .ok_or_else(|| format!("missing downloaded artifact for {}", artifact.module_id))?;
        if sha256(bytes) != *digest {
            return Err(format!(
                "Console artifact integrity mismatch for {}",
                artifact.module_id
            ));
        }
        let stored_path = PathBuf::from("objects")
            .join(digest.trim_start_matches("sha256:"))
            .with_extension("artifact");
        atomic_write(&root.join(&stored_path), bytes)?;
        let base_path = materialize_web_artifact(root, &console, bytes)?;
        let granted_permissions = console
            .requested_permissions
            .iter()
            .map(|permission| permission.permission_id.clone())
            .collect();
        materialized.push(MaterializedArtifact {
            module_id: artifact.module_id.clone(),
            module_release_digest: artifact.module_release_digest.clone(),
            artifact_digest: digest.clone(),
            protocol_major: console.protocol_major,
            format: CONSOLE_UI_ESM_FORMAT.to_owned(),
            stored_path: stored_path.to_string_lossy().into_owned(),
            base_path,
            entry: console.entry.clone(),
            entries: console.entries.clone(),
            style_assets: console.style_assets.clone(),
            manifest: console.manifest.clone(),
            contract: console.clone(),
            granted_permissions,
        });
    }
    let mut materialized_theme_bundles = Vec::new();
    for bundle in &request.theme_bundles {
        let bytes = downloads
            .get(&bundle.locator)
            .ok_or_else(|| format!("missing downloaded Theme Bundle for {}", bundle.bundle_id))?;
        if sha256(bytes) != bundle.digest {
            return Err(format!(
                "Console Theme Bundle integrity mismatch for {}",
                bundle.bundle_id
            ));
        }
        let stored_path = PathBuf::from("objects")
            .join(bundle.digest.trim_start_matches("sha256:"))
            .with_extension("theme-bundle");
        atomic_write(&root.join(&stored_path), bytes)?;
        let base_path = materialize_web_entries(root, &bundle.digest, &bundle.entries, bytes)?;
        let granted_permissions = bundle
            .requested_permissions
            .iter()
            .filter_map(|permission| permission.get("permission_id")?.as_str())
            .map(ToOwned::to_owned)
            .collect();
        materialized_theme_bundles.push(MaterializedThemeBundle {
            bundle_id: bundle.bundle_id.clone(),
            version: bundle.version.clone(),
            artifact_digest: bundle.digest.clone(),
            format: bundle.format.clone(),
            stored_path: stored_path.to_string_lossy().into_owned(),
            base_path,
            entries: bundle.entries.clone(),
            manifest: bundle.manifest.clone(),
            granted_permissions,
        });
    }
    let receipt = ConsoleCompositionReceipt {
        candidate_lock_digest: request.candidate_lock_digest.clone(),
        artifacts: materialized,
        theme_bundles: materialized_theme_bundles,
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
    artifact: &ConsoleUiArtifact,
    bytes: &[u8],
) -> Result<String, String> {
    materialize_web_entries(root, &artifact.artifact.digest, &artifact.entries, bytes)
}

fn materialize_web_entries(
    root: &Path,
    digest_value: &str,
    entries: &[ConsoleUiArtifactEntry],
    bytes: &[u8],
) -> Result<String, String> {
    const MAX_EXPANDED_BYTES: u64 = 128 * 1024 * 1024;
    const MAX_FILES: usize = 4_096;

    let digest = digest_value.trim_start_matches("sha256:");
    let relative = PathBuf::from("web").join(digest);
    let destination = root.join(&relative);
    if destination.is_dir() {
        validate_materialized_entries(&destination, entries)?;
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
        validate_materialized_entries(&temporary, entries)
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

fn api_error(
    code: ErrorCode,
    message: impl Into<String>,
    request_ctx: &RequestContext,
) -> ApiErrorResponse {
    ApiErrorResponse::with_context(AppError::new(code, message), request_ctx)
}

fn bad_request(error: impl std::fmt::Display, request_ctx: &RequestContext) -> ApiErrorResponse {
    api_error(ErrorCode::Validation, error.to_string(), request_ctx)
}

fn upstream_error(
    _error: impl std::fmt::Display,
    request_ctx: &RequestContext,
) -> ApiErrorResponse {
    api_error(
        ErrorCode::ExternalDependency,
        "Console artifact download failed",
        request_ctx,
    )
}

fn internal_error(
    _error: impl std::fmt::Display,
    request_ctx: &RequestContext,
) -> ApiErrorResponse {
    api_error(
        ErrorCode::Internal,
        "Console artifact state could not be materialized",
        request_ctx,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use flate2::Compression;
    use flate2::write::GzEncoder;
    use lenso::ModuleRelease;
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
        let mut release: ModuleRelease = serde_json::from_value(
            lenso::console_contract_vectors()["positive"]["release"].clone(),
        )
        .unwrap();
        let mut console = release.console_ui_artifact.take().unwrap();
        console.artifact.locator = "https://modules.example/crm.artifact".to_owned();
        console.artifact.digest = sha256(bytes);
        let module_id = release.module_id;
        ConsoleCompositionRequest {
            kind: "console_composition".to_owned(),
            effect_id: "25-console-composition:lenso-console".to_owned(),
            console_service_id: "lenso-console".to_owned(),
            candidate_lock_digest: format!("sha256:{}", "a".repeat(64)),
            artifacts: vec![ConsoleCompositionArtifact {
                module_id,
                module_release_digest: format!("sha256:{}", "b".repeat(64)),
                locator: console.artifact.locator,
                digest: console.artifact.digest,
                format: console.format,
                protocol_major: console.protocol_major,
                entry: console.entry,
                entries: console.entries,
                style_assets: console.style_assets,
                manifest: console.manifest,
                requested_permissions: console.requested_permissions,
            }],
            theme_bundles: Vec::new(),
        }
    }

    fn artifact() -> Vec<u8> {
        let encoder = GzEncoder::new(Vec::new(), Compression::default());
        let mut archive = tar::Builder::new(encoder);
        for (path, content) in [
            (
                "package/dist/assets/support.js",
                b"export default { manifest: {}, surfaces: [] };".as_slice(),
            ),
            ("package/dist/assets/support.css", b"body {}".as_slice()),
        ] {
            let mut header = tar::Header::new_gnu();
            header.set_mode(0o644);
            header.set_size(content.len() as u64);
            header.set_cksum();
            archive.append_data(&mut header, path, content).unwrap();
        }
        archive.into_inner().unwrap().finish().unwrap()
    }

    #[test]
    fn materializes_verified_artifact_and_receipt() {
        let root = root();
        let bytes = artifact();
        let request = request(&bytes);
        let locator = request.artifacts[0].locator.clone();
        let downloads = BTreeMap::from([(locator, bytes)]);

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
                .join("assets/support.js")
                .is_file()
        );
        assert!(receipt.artifacts[0].granted_permissions.is_empty());
        assert_eq!(receipt.artifacts[0].format, "console_ui_esm");
        assert_eq!(receipt.artifacts[0].entry, "assets/support.js");
        assert_eq!(
            receipt.artifacts[0].manifest.module_id,
            "acme/support-console"
        );
        assert_eq!(receipt.artifacts[0].contract.protocol_major, 1);
        assert!(receipt.theme_bundles.is_empty());
        assert!(root.join("composition-receipt.json").is_file());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_integrity_mismatch_without_writing_receipt() {
        let root = root();
        let request = request(&artifact());
        let locator = request.artifacts[0].locator.clone();
        let downloads = BTreeMap::from([(locator, b"tampered".to_vec())]);

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

    #[test]
    fn consumes_the_framework_console_contract_vectors_without_translation() {
        let vectors = lenso::console_contract_vectors();
        assert_eq!(vectors["protocol"], "lenso.console-contract-vectors.v1");
        let positive: ModuleRelease =
            serde_json::from_value(vectors["positive"]["release"].clone()).unwrap();
        assert!(positive.validate().is_empty());

        for vector in vectors["negative"].as_array().unwrap() {
            let release: ModuleRelease = serde_json::from_value(vector["release"].clone()).unwrap();
            assert!(
                !release.validate().is_empty(),
                "framework negative vector unexpectedly accepted: {}",
                vector["id"]
            );
        }
    }
}
