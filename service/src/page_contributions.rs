use std::{
    collections::{BTreeMap, BTreeSet},
    path::{Component, Path, PathBuf},
    sync::Arc,
};

use axum::{
    Json, Router,
    body::Bytes,
    extract::{Path as AxumPath, State},
    http::{StatusCode, header},
    response::{IntoResponse, Response},
    routing::get,
};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use lenso::ManyPort;
use lenso_capability_ui_contribution::{
    ContributionClient, ContributionInvocationError, DescribeRequest, DescribeResponse,
    DescribeResponseAssetsItemMediaType, DescribeResponseSubject as ContractSubject,
    DescribeResponseSubjectKind as ContractSubjectKind,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::workspace_services::{
    PublishedRequirement, WorkspaceServiceBuilder, WorkspaceServiceDispatch,
    WorkspaceServiceRuntime,
};

const DESCRIPTOR_FILE: &str = "contribution.json";
const MAX_ASSET_BYTES: usize = 1024 * 1024;

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct ContributionDescriptor {
    schema: String,
    id: String,
    title: String,
    subject: ContributionSubject,
    runtime: ContributionRuntime,
    module: String,
    #[serde(default)]
    styles: Vec<String>,
    navigation: ContributionNavigation,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
enum ContributionSubject {
    Console,
    App { app_id: String },
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct ContributionRuntime {
    api_major: u32,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct ContributionNavigation {
    label: String,
    #[serde(default)]
    items: Vec<ContributionNavigationItem>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct ContributionNavigationItem {
    label: String,
    path: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PageMount {
    id: String,
    title: String,
    subject: ContributionSubject,
    api_major: u32,
    module: String,
    styles: Vec<String>,
    navigation: ContributionNavigationResponse,
    owner: ContributionOwner,
    revision: String,
    requirements: Vec<PublishedRequirement>,
}

#[derive(Clone, Debug, Serialize)]
struct ContributionNavigationResponse {
    label: String,
    items: Vec<ContributionNavigationItem>,
}

#[derive(Clone, Debug, Serialize)]
struct ContributionOwner {
    instance: String,
    source: &'static str,
    trusted: bool,
}

#[derive(Clone)]
struct Asset {
    bytes: Bytes,
    media_type: &'static str,
}

type AssetMap = BTreeMap<(String, String, String), Asset>;

#[derive(Clone)]
pub(super) struct PageCatalog {
    mounts: Arc<Vec<PageMount>>,
    assets: Arc<AssetMap>,
    services: WorkspaceServiceDispatch,
}

impl PageCatalog {
    pub(super) async fn from_ports(
        port: &ManyPort<ContributionClient>,
        service_port: &ManyPort<lenso_capability_workspace_service::WorkspaceServiceClient>,
        allowed_app_subjects: &BTreeSet<String>,
    ) -> Result<(Self, WorkspaceServiceRuntime), lenso_kernel::RuntimeFailure> {
        let mut contributions = Vec::with_capacity(port.len());
        for provider in port.iter() {
            let owner = provider.provider_instance().to_owned();
            let response =
                provider
                    .describe(DescribeRequest {})
                    .await
                    .map_err(|error| match error {
                        ContributionInvocationError::Domain(error) => {
                            lenso_kernel::RuntimeFailure::PluginFailure {
                                detail: format!(
                                    "UI Contribution `{owner}` rejected describe: {error:?}"
                                ),
                            }
                        }
                        ContributionInvocationError::Runtime(error) => error,
                    })?;
            contributions.push((owner, response));
        }
        let mut services = WorkspaceServiceBuilder::prepare(service_port).await?;
        let mut catalog = Self::from_contributions_with_services(
            contributions,
            allowed_app_subjects,
            Some(&mut services),
        )
        .map_err(|error| lenso_kernel::RuntimeFailure::InvalidResolvedPlan {
            detail: error.to_string(),
        })?;
        let (dispatch, runtime) = services.finish(service_port.clone());
        catalog.services = dispatch;
        Ok((catalog, runtime))
    }

    fn from_contributions(
        contributions: Vec<(String, DescribeResponse)>,
        allowed_app_subjects: &BTreeSet<String>,
    ) -> anyhow::Result<Self> {
        Self::from_contributions_with_services(contributions, allowed_app_subjects, None)
    }

    fn from_contributions_with_services(
        contributions: Vec<(String, DescribeResponse)>,
        allowed_app_subjects: &BTreeSet<String>,
        mut services: Option<&mut WorkspaceServiceBuilder>,
    ) -> anyhow::Result<Self> {
        anyhow::ensure!(
            contributions.len() <= 64,
            "Console supports at most 64 Workspace contributions"
        );
        let mut mounts = Vec::with_capacity(contributions.len());
        let mut assets = BTreeMap::new();
        let mut ids = BTreeSet::new();
        for (owner, contribution) in contributions {
            anyhow::ensure!(
                ids.insert(contribution.workspace_id.clone()),
                "duplicate Console Workspace id: {}",
                contribution.workspace_id
            );
            let (mount, contribution_assets) = snapshot_contribution(
                owner,
                contribution,
                allowed_app_subjects,
                services.as_deref_mut(),
            )?;
            for (key, asset) in contribution_assets {
                anyhow::ensure!(
                    assets.insert(key, asset).is_none(),
                    "duplicate Console Workspace asset path"
                );
            }
            mounts.push(mount);
        }
        Ok(Self {
            mounts: Arc::new(mounts),
            assets: Arc::new(assets),
            services: WorkspaceServiceDispatch::unavailable(),
        })
    }

    pub(super) fn discover(
        web_root: &Path,
        allowed_app_subjects: &BTreeSet<String>,
    ) -> anyhow::Result<Self> {
        let root = web_root.join("contributions");
        if !root.exists() {
            return Ok(Self {
                mounts: Arc::new(Vec::new()),
                assets: Arc::new(BTreeMap::new()),
                services: WorkspaceServiceDispatch::unavailable(),
            });
        }
        anyhow::ensure!(
            root.is_dir(),
            "Console contribution root must be a directory"
        );
        let mut directories = std::fs::read_dir(&root)?.collect::<Result<Vec<_>, _>>()?;
        directories.sort_by_key(std::fs::DirEntry::file_name);
        let mut contributions = Vec::new();
        for entry in directories {
            if !entry.file_type()?.is_dir() {
                continue;
            }
            let directory = entry.path();
            validate_artifact_tree(&directory)?;
            let descriptor: ContributionDescriptor =
                serde_json::from_slice(&std::fs::read(directory.join(DESCRIPTOR_FILE))?)?;
            validate_descriptor(&descriptor, &directory)?;
            let asset_paths = std::iter::once(&descriptor.module)
                .chain(&descriptor.styles)
                .cloned()
                .collect::<BTreeSet<_>>();
            let assets = asset_paths
                .into_iter()
                .map(|path| {
                    let content = std::fs::read(directory.join(&path))?;
                    let media_type = if is_css_asset(&path) {
                        DescribeResponseAssetsItemMediaType::TextCssCharsetUtf
                    } else {
                        DescribeResponseAssetsItemMediaType::TextJavascriptCharsetUtf
                    };
                    Ok(
                        lenso_capability_ui_contribution::DescribeResponseAssetsItem {
                            content_base64: STANDARD.encode(content),
                            media_type,
                            path,
                        },
                    )
                })
                .collect::<anyhow::Result<Vec<_>>>()?;
            contributions.push((
                format!("dev.filesystem.{}", descriptor.id),
                DescribeResponse {
                    assets,
                    module: descriptor.module,
                    navigation: lenso_capability_ui_contribution::DescribeResponseNavigation {
                        label: descriptor.navigation.label,
                        items: descriptor
                            .navigation
                            .items
                            .into_iter()
                            .map(|item| {
                                lenso_capability_ui_contribution::DescribeResponseNavigationItemsItem {
                                    label: item.label,
                                    path: item.path,
                                }
                            })
                            .collect(),
                    },
                    requirements: Vec::new(),
                    revision: "dev".to_owned(),
                    styles: descriptor.styles,
                    subject: Some(contract_subject(descriptor.subject)),
                    title: descriptor.title,
                    workspace_id: descriptor.id,
                },
            ));
        }
        let mut catalog = Self::from_contributions(contributions, allowed_app_subjects)?;
        for mount in Arc::make_mut(&mut catalog.mounts) {
            mount.owner.source = "development-filesystem";
            mount.owner.trusted = false;
        }
        Ok(catalog)
    }

    pub(super) fn routes(self) -> Router {
        let service_routes = self.services.clone().routes();
        Router::new()
            .route("/api/console/v1/pages", get(list_pages))
            .route(
                "/api/console/v1/pages/{workspace_id}/assets/{digest}/{*path}",
                get(read_asset),
            )
            .with_state(self)
            .merge(service_routes)
    }
}

fn snapshot_contribution(
    owner: String,
    contribution: DescribeResponse,
    allowed_app_subjects: &BTreeSet<String>,
    services: Option<&mut WorkspaceServiceBuilder>,
) -> anyhow::Result<(PageMount, AssetMap)> {
    let subject = contribution_subject(contribution.subject.as_ref(), allowed_app_subjects)?;
    validate_response(&contribution)?;
    let requirements = if let Some(services) = services {
        services.bind_mount(
            &contribution.workspace_id,
            &owner,
            &contribution.requirements,
        )?
    } else {
        contribution
            .requirements
            .iter()
            .map(PublishedRequirement::unavailable)
            .collect()
    };
    let mut decoded_assets = decode_assets(&contribution)?;
    decoded_assets.sort_by(|left, right| left.0.cmp(&right.0));
    let mut hasher = Sha256::new();
    hash_part(&mut hasher, contribution.revision.as_bytes());
    for (path, asset) in &decoded_assets {
        hash_part(&mut hasher, path.as_bytes());
        hash_part(&mut hasher, asset.media_type.as_bytes());
        hash_part(&mut hasher, &asset.bytes);
    }
    let digest = hex::encode(hasher.finalize());
    let asset_base = format!(
        "/api/console/v1/pages/{}/assets/{digest}",
        contribution.workspace_id
    );
    let assets = decoded_assets
        .into_iter()
        .map(|(path, asset)| {
            (
                (contribution.workspace_id.clone(), digest.clone(), path),
                asset,
            )
        })
        .collect();
    let mount = PageMount {
        id: contribution.workspace_id,
        title: contribution.title,
        subject,
        api_major: 1,
        module: format!("{asset_base}/{}", contribution.module),
        styles: contribution
            .styles
            .into_iter()
            .map(|path| format!("{asset_base}/{path}"))
            .collect(),
        navigation: ContributionNavigationResponse {
            label: contribution.navigation.label,
            items: contribution
                .navigation
                .items
                .into_iter()
                .map(|item| ContributionNavigationItem {
                    label: item.label,
                    path: item.path,
                })
                .collect(),
        },
        owner: ContributionOwner {
            instance: owner,
            source: "resolved-plan",
            trusted: true,
        },
        revision: contribution.revision,
        requirements,
    };
    Ok((mount, assets))
}

fn decode_assets(contribution: &DescribeResponse) -> anyhow::Result<Vec<(String, Asset)>> {
    contribution
        .assets
        .iter()
        .map(|asset| {
            let bytes = STANDARD.decode(&asset.content_base64)?;
            anyhow::ensure!(
                bytes.len() <= MAX_ASSET_BYTES,
                "Console Workspace asset exceeds one MiB: {}",
                asset.path
            );
            let media_type = match asset.media_type {
                DescribeResponseAssetsItemMediaType::TextCssCharsetUtf => "text/css; charset=utf-8",
                DescribeResponseAssetsItemMediaType::TextJavascriptCharsetUtf => {
                    "text/javascript; charset=utf-8"
                }
            };
            Ok((
                asset.path.clone(),
                Asset {
                    bytes: Bytes::from(bytes),
                    media_type,
                },
            ))
        })
        .collect()
}

async fn list_pages(State(catalog): State<PageCatalog>) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "schema": "console.page-catalog/1",
        "mounts": catalog.mounts.as_ref(),
    }))
}

async fn read_asset(
    State(catalog): State<PageCatalog>,
    AxumPath((workspace_id, digest, path)): AxumPath<(String, String, String)>,
) -> Response {
    let Some(asset) = catalog.assets.get(&(workspace_id, digest, path)) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    (
        [
            (header::CONTENT_TYPE, asset.media_type),
            (header::X_CONTENT_TYPE_OPTIONS, "nosniff"),
            (header::CACHE_CONTROL, "public, max-age=31536000, immutable"),
        ],
        asset.bytes.clone(),
    )
        .into_response()
}

fn validate_response(value: &DescribeResponse) -> anyhow::Result<()> {
    anyhow::ensure!(
        valid_slug(&value.workspace_id),
        "invalid Console Workspace id"
    );
    anyhow::ensure!(
        !value.title.trim().is_empty()
            && value.title.len() <= 80
            && !value.navigation.label.trim().is_empty()
            && value.navigation.label.len() <= 40
            && !value.revision.trim().is_empty(),
        "Console Workspace labels and revision must not be empty"
    );
    anyhow::ensure!(
        value.revision.len() <= 128
            && !value.assets.is_empty()
            && value.assets.len() <= 64
            && value.styles.len() <= 16
            && value.navigation.items.len() <= 32
            && value.requirements.len() <= 32,
        "Console Workspace contribution exceeds contract bounds"
    );
    let paths = value
        .assets
        .iter()
        .map(|asset| asset.path.as_str())
        .collect::<BTreeSet<_>>();
    anyhow::ensure!(
        paths.len() == value.assets.len(),
        "duplicate Console Workspace asset path"
    );
    for path in &paths {
        safe_relative_path(path)?;
    }
    for asset in &value.assets {
        let expected_css = matches!(
            asset.media_type,
            DescribeResponseAssetsItemMediaType::TextCssCharsetUtf
        );
        anyhow::ensure!(
            (expected_css && is_css_asset(&asset.path))
                || (!expected_css && is_javascript_asset(&asset.path)),
            "Console Workspace asset media type does not match its path: {}",
            asset.path
        );
    }
    anyhow::ensure!(
        paths.contains(value.module.as_str())
            && value
                .styles
                .iter()
                .all(|path| paths.contains(path.as_str())),
        "Console Workspace entry assets are missing"
    );
    let mut navigation_paths = BTreeSet::new();
    for item in &value.navigation.items {
        anyhow::ensure!(
            !item.label.trim().is_empty()
                && item.path.iter().all(|segment| valid_path_segment(segment))
                && navigation_paths.insert(item.path.clone()),
            "Console Workspace navigation item is invalid"
        );
    }
    for requirement in &value.requirements {
        anyhow::ensure!(
            valid_slug(&requirement.service_id)
                && !requirement.capability_id.trim().is_empty()
                && requirement.capability_id.len() <= 128
                && !requirement.descriptor_version.trim().is_empty()
                && requirement.descriptor_version.len() <= 32
                && !requirement.operations.is_empty()
                && requirement.operations.len() <= 32
                && requirement
                    .operations
                    .iter()
                    .all(|operation| !operation.trim().is_empty() && operation.len() <= 64),
            "Console Workspace Capability requirement is invalid"
        );
    }
    Ok(())
}

fn contribution_subject(
    value: Option<&ContractSubject>,
    allowed_app_subjects: &BTreeSet<String>,
) -> anyhow::Result<ContributionSubject> {
    let Some(value) = value else {
        return Ok(ContributionSubject::Console);
    };
    match (&value.kind, &value.app_id) {
        (ContractSubjectKind::Console, None | Some(None)) => Ok(ContributionSubject::Console),
        (ContractSubjectKind::App, Some(Some(app_id))) if allowed_app_subjects.contains(app_id) => {
            Ok(ContributionSubject::App {
                app_id: app_id.clone(),
            })
        }
        (ContractSubjectKind::App, Some(Some(app_id))) => {
            anyhow::bail!("Console Workspace targets unknown App `{app_id}`")
        }
        (ContractSubjectKind::Console, Some(Some(_))) => {
            anyhow::bail!("Console-scoped Workspace must not declare an App id")
        }
        (ContractSubjectKind::App, None | Some(None)) => {
            anyhow::bail!("App-scoped Workspace must declare an App id")
        }
    }
}

fn contract_subject(value: ContributionSubject) -> ContractSubject {
    match value {
        ContributionSubject::Console => ContractSubject {
            app_id: None,
            kind: ContractSubjectKind::Console,
        },
        ContributionSubject::App { app_id } => ContractSubject {
            app_id: Some(Some(app_id)),
            kind: ContractSubjectKind::App,
        },
    }
}

fn validate_artifact_tree(directory: &Path) -> anyhow::Result<()> {
    for entry in std::fs::read_dir(directory)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        anyhow::ensure!(
            file_type.is_file() || file_type.is_dir(),
            "Console contribution artifacts must contain only regular files and directories"
        );
        if file_type.is_dir() {
            validate_artifact_tree(&entry.path())?;
        }
    }
    Ok(())
}

fn validate_descriptor(
    descriptor: &ContributionDescriptor,
    directory: &Path,
) -> anyhow::Result<()> {
    anyhow::ensure!(
        descriptor.schema == "console.page-contribution/1",
        "unsupported Console contribution schema"
    );
    anyhow::ensure!(
        descriptor.runtime.api_major == 1,
        "unsupported Console page API major"
    );
    let response = DescribeResponse {
        assets: std::iter::once(&descriptor.module)
            .chain(&descriptor.styles)
            .map(
                |path| lenso_capability_ui_contribution::DescribeResponseAssetsItem {
                    content_base64: String::new(),
                    media_type: if is_css_asset(path) {
                        DescribeResponseAssetsItemMediaType::TextCssCharsetUtf
                    } else {
                        DescribeResponseAssetsItemMediaType::TextJavascriptCharsetUtf
                    },
                    path: path.clone(),
                },
            )
            .collect(),
        module: descriptor.module.clone(),
        navigation: lenso_capability_ui_contribution::DescribeResponseNavigation {
            label: descriptor.navigation.label.clone(),
            items: descriptor
                .navigation
                .items
                .iter()
                .map(
                    |item| lenso_capability_ui_contribution::DescribeResponseNavigationItemsItem {
                        label: item.label.clone(),
                        path: item.path.clone(),
                    },
                )
                .collect(),
        },
        requirements: Vec::new(),
        revision: "dev".to_owned(),
        styles: descriptor.styles.clone(),
        subject: Some(contract_subject(descriptor.subject.clone())),
        title: descriptor.title.clone(),
        workspace_id: descriptor.id.clone(),
    };
    validate_response(&response)?;
    let contribution_root = std::fs::canonicalize(directory)?;
    for asset in std::iter::once(&descriptor.module).chain(&descriptor.styles) {
        let relative = safe_relative_path(asset)?;
        let canonical_asset = std::fs::canonicalize(directory.join(relative))?;
        anyhow::ensure!(
            canonical_asset.starts_with(&contribution_root) && canonical_asset.is_file(),
            "Console contribution asset is missing: {asset}"
        );
    }
    Ok(())
}

fn safe_relative_path(value: &str) -> anyhow::Result<PathBuf> {
    let path = Path::new(value);
    anyhow::ensure!(
        !value.is_empty()
            && !path.is_absolute()
            && path.components().all(|part| {
                let Component::Normal(segment) = part else {
                    return false;
                };
                segment.to_str().is_some_and(|segment| {
                    !segment.is_empty()
                        && segment.chars().all(|character| {
                            character.is_ascii_alphanumeric()
                                || matches!(character, '.' | '_' | '-')
                        })
                })
            }),
        "Console contribution asset path must be a clean relative path"
    );
    Ok(path.to_path_buf())
}

fn is_css_asset(path: &str) -> bool {
    Path::new(path)
        .extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("css"))
}

fn is_javascript_asset(path: &str) -> bool {
    Path::new(path).extension().is_some_and(|extension| {
        extension.eq_ignore_ascii_case("js") || extension.eq_ignore_ascii_case("mjs")
    })
}

fn hash_part(hasher: &mut Sha256, value: &[u8]) {
    hasher.update(u64::try_from(value.len()).unwrap_or(u64::MAX).to_be_bytes());
    hasher.update(value);
}

fn valid_slug(value: &str) -> bool {
    let mut characters = value.chars();
    matches!(characters.next(), Some(first) if first.is_ascii_lowercase())
        && value.len() <= 64
        && characters.all(|character| {
            character.is_ascii_lowercase()
                || character.is_ascii_digit()
                || matches!(character, '.' | '_' | '-')
        })
}

fn valid_path_segment(value: &str) -> bool {
    let mut characters = value.chars();
    matches!(characters.next(), Some(first) if first.is_ascii_alphanumeric())
        && value.len() <= 64
        && characters.all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-')
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::{Body, to_bytes},
        http::Request,
    };
    use tower::ServiceExt;

    #[test]
    fn app_subjects_are_bound_to_known_managed_apps() {
        let allowed = BTreeSet::from(["support".to_owned()]);
        let app = Some(ContractSubject {
            app_id: Some(Some("support".to_owned())),
            kind: ContractSubjectKind::App,
        });
        assert_eq!(
            contribution_subject(app.as_ref(), &allowed).unwrap(),
            ContributionSubject::App {
                app_id: "support".to_owned()
            }
        );
        assert_eq!(
            serde_json::to_value(contribution_subject(app.as_ref(), &allowed).unwrap()).unwrap(),
            serde_json::json!({ "kind": "app", "appId": "support" })
        );
        assert!(contribution_subject(app.as_ref(), &BTreeSet::new()).is_err());
        assert!(
            contribution_subject(
                Some(&ContractSubject {
                    app_id: None,
                    kind: ContractSubjectKind::App,
                }),
                &allowed,
            )
            .is_err()
        );
        assert!(
            contribution_subject(
                Some(&ContractSubject {
                    app_id: Some(Some("support".to_owned())),
                    kind: ContractSubjectKind::Console,
                }),
                &allowed,
            )
            .is_err()
        );
        assert_eq!(
            contribution_subject(None, &allowed).unwrap(),
            ContributionSubject::Console
        );
    }

    fn write_contribution(root: &Path, id: &str, module: &str) {
        let directory = root.join("contributions").join(id);
        std::fs::create_dir_all(&directory).unwrap();
        std::fs::write(directory.join(module), "export const apiMajor = 1;").unwrap();
        std::fs::write(
            directory.join(DESCRIPTOR_FILE),
            serde_json::json!({
                "schema": "console.page-contribution/1",
                "id": id,
                "title": "Example",
                "subject": { "kind": "console" },
                "runtime": { "apiMajor": 1 },
                "module": module,
                "navigation": {
                    "label": "Example",
                    "items": [
                        { "label": "Home", "path": [] },
                        { "label": "Details", "path": ["details"] }
                    ]
                }
            })
            .to_string(),
        )
        .unwrap();
    }

    #[test]
    fn discovers_valid_contributions_and_rejects_escaping_assets() {
        let root = tempfile::tempdir().unwrap();
        write_contribution(root.path(), "example", "page.mjs");
        let catalog = PageCatalog::discover(root.path(), &BTreeSet::new()).unwrap();
        assert_eq!(catalog.mounts.len(), 1);
        assert_eq!(catalog.mounts[0].owner.source, "development-filesystem");

        let descriptor = root.path().join("contributions/example/contribution.json");
        let mut value: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&descriptor).unwrap()).unwrap();
        value["module"] = serde_json::json!("../page.mjs");
        std::fs::write(descriptor, value.to_string()).unwrap();
        assert!(PageCatalog::discover(root.path(), &BTreeSet::new()).is_err());
    }

    #[test]
    fn asset_urls_change_with_content() {
        let root = tempfile::tempdir().unwrap();
        write_contribution(root.path(), "example", "page.mjs");
        let first = PageCatalog::discover(root.path(), &BTreeSet::new())
            .unwrap()
            .mounts[0]
            .module
            .clone();
        std::fs::write(
            root.path().join("contributions/example/page.mjs"),
            "export const apiMajor = 1; export const changed = true;",
        )
        .unwrap();
        let second = PageCatalog::discover(root.path(), &BTreeSet::new())
            .unwrap()
            .mounts[0]
            .module
            .clone();
        assert_ne!(first, second);
    }

    #[tokio::test]
    async fn serves_immutable_catalog_assets_without_spa_fallback() {
        let root = tempfile::tempdir().unwrap();
        write_contribution(root.path(), "example", "page.mjs");
        let app = PageCatalog::discover(root.path(), &BTreeSet::new())
            .unwrap()
            .routes();
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/console/v1/pages")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), 16 * 1024).await.unwrap();
        let value: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(value["mounts"][0]["owner"]["trusted"], false);
        let module = value["mounts"][0]["module"].as_str().unwrap();

        let asset = app
            .clone()
            .oneshot(Request::builder().uri(module).body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(asset.status(), StatusCode::OK);
        assert_eq!(
            asset.headers()[header::CACHE_CONTROL],
            "public, max-age=31536000, immutable"
        );

        let missing = app
            .oneshot(
                Request::builder()
                    .uri(module.replace("page.mjs", "missing.mjs"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(missing.status(), StatusCode::NOT_FOUND);
    }
}
