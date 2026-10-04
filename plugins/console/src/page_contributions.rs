use std::{
    collections::{BTreeMap, BTreeSet},
    path::{Component, Path, PathBuf},
    sync::Arc,
};

use base64::{Engine as _, engine::general_purpose::STANDARD};
use bytes::Bytes;
use http::{Method, StatusCode, header};
use lenso::ManyPort;
use lenso_capability_ui_contribution::{
    ContributionClient, ContributionInvocationError, DescribeRequest, DescribeResponse,
    DescribeResponseAssetsItemMediaType, DescribeResponseSubject as ContractSubject,
    DescribeResponseSubjectKind as ContractSubjectKind,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::http::{Body, IntoResponse as _, Json, Path as HttpPath, Request, Response, State};
use crate::workspace_paths::{
    WorkspaceAccess, WorkspaceMountOverride, canonical_path, matches_route, reserved,
    validate_routes,
};
use crate::workspace_services::{
    PublishedRequirement, WorkspaceServiceBuilder, WorkspaceServiceDispatch,
    WorkspaceServiceRuntime,
};

#[cfg(test)]
const DESCRIPTOR_FILE: &str = "contribution.json";
const MAX_ASSET_BYTES: usize = 1024 * 1024;

#[cfg(test)]
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

#[cfg(test)]
#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct ContributionRuntime {
    api_major: u32,
}

#[cfg(test)]
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
    base_path: String,
    access: WorkspaceAccess,
    index: Vec<String>,
    routes: Vec<Vec<String>>,
    global: bool,
    id: String,
    page_id: String,
    implementation_id: String,
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

#[derive(Clone, Debug, Deserialize, Serialize)]
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

#[derive(Clone, Debug, Deserialize)]
struct WorkspaceDescriptor {
    id: String,
    title: String,
    path: String,
    access: WorkspaceAccess,
    index: Vec<String>,
    routes: Vec<Vec<String>>,
    navigation: ContributionNavigationResponse,
    #[serde(default)]
    requirements: Option<Vec<lenso_capability_ui_contribution::DescribeResponseRequirementsItem>>,
}

#[derive(Clone)]
pub(super) struct PageCatalog {
    mounts: Arc<Vec<PageMount>>,
    assets: Arc<AssetMap>,
    services: WorkspaceServiceDispatch,
}

impl PageCatalog {
    pub(super) fn apply_mount_overrides(
        &mut self,
        overrides: &[WorkspaceMountOverride],
    ) -> anyhow::Result<()> {
        anyhow::ensure!(overrides.len() <= 64, "Too many workspace mount overrides");
        let mut mounts = self.mounts.as_ref().clone();
        let mut keys = BTreeSet::new();
        for value in overrides {
            anyhow::ensure!(
                keys.insert((&value.instance, &value.workspace)),
                "Duplicate workspace mount override"
            );
            let mount = mounts
                .iter_mut()
                .find(|mount| {
                    !mount.global
                        && mount.owner.instance == value.instance
                        && mount.page_id == value.workspace
                })
                .ok_or_else(|| {
                    anyhow::anyhow!(
                        "Workspace mount override targets an unknown Plugin Instance/workspace"
                    )
                })?;
            mount.base_path =
                subject_path(&canonical_path(&value.path, mount.access)?, &mount.subject);
        }
        let routed = mounts
            .iter()
            .filter(|mount| !mount.global)
            .collect::<Vec<_>>();
        for (index, left) in routed.iter().enumerate() {
            if left.base_path == "/" {
                anyhow::ensure!(
                    left.routes.iter().all(|route| route
                        .first()
                        .is_none_or(|part| !reserved(part) && part != "admin")),
                    "Root workspace route conflicts with a reserved Console path"
                );
            }
            for right in &routed[index + 1..] {
                anyhow::ensure!(
                    left.base_path != right.base_path
                        && (left.base_path == "/"
                            || right.base_path == "/"
                            || (!left.base_path.starts_with(&right.base_path)
                                && !right.base_path.starts_with(&left.base_path))),
                    "Workspace mount paths conflict: {} and {}",
                    left.base_path,
                    right.base_path
                );
                for (root, child) in [(*left, *right), (*right, *left)] {
                    if root.base_path == "/" {
                        let prefix = child
                            .base_path
                            .trim_matches('/')
                            .split('/')
                            .collect::<Vec<_>>();
                        anyhow::ensure!(
                            !root.routes.iter().any(|route| matches_route(
                                &route[..route.len().min(prefix.len())],
                                &prefix,
                            )),
                            "Root workspace page conflicts with another mount"
                        );
                    }
                }
            }
        }
        self.mounts = Arc::new(mounts);
        Ok(())
    }

    pub(super) fn request_requires_administrator(&self, path: &str) -> bool {
        path.strip_prefix("/api/console/v1/pages/")
            .and_then(|tail| tail.split('/').next())
            .is_some_and(|id| {
                self.mounts
                    .iter()
                    .any(|mount| mount.id == id && mount.access == WorkspaceAccess::Administrator)
            })
    }

    pub(super) fn canonical_page_path(&self, path: &str) -> Option<String> {
        if !path.starts_with('/') || path.contains('%') || path.contains("//") {
            return None;
        }
        let normalized = path.trim_end_matches('/');
        let mut mounts = self
            .mounts
            .iter()
            .filter(|mount| !mount.global)
            .collect::<Vec<_>>();
        mounts.sort_by_key(|mount| std::cmp::Reverse(mount.base_path.len()));
        for mount in mounts {
            let base = mount.base_path.trim_end_matches('/');
            let relative = if normalized == base {
                ""
            } else {
                let Some(relative) = path.strip_prefix(&mount.base_path) else {
                    continue;
                };
                relative.trim_end_matches('/')
            };
            let parts = if relative.is_empty() {
                Vec::new()
            } else {
                relative.split('/').collect::<Vec<_>>()
            };
            if mount.base_path == "/"
                && parts
                    .first()
                    .is_some_and(|part| reserved(part) || *part == "admin")
            {
                continue;
            }
            if parts.iter().any(|part| !valid_path_segment(part)) {
                continue;
            }
            if parts.is_empty()
                || mount
                    .routes
                    .iter()
                    .any(|route| matches_route(route, &parts))
            {
                return Some(if normalized.is_empty() {
                    "/".to_owned()
                } else {
                    format!("{normalized}/")
                });
            }
        }
        None
    }

    pub(super) async fn from_ports(
        port: &ManyPort<ContributionClient>,
        global_port: &ManyPort<lenso_capability_ui_global_contribution::GlobalContributionClient>,
        service_port: &ManyPort<lenso_capability_workspace_service::WorkspaceServiceClient>,
        allowed_app_subjects: &BTreeSet<String>,
    ) -> Result<(Self, WorkspaceServiceRuntime), lenso_kernel::RuntimeFailure> {
        let mut contributions = Vec::with_capacity(port.len());
        for provider in port.iter() {
            let owner = provider.provider_instance().to_owned();
            let response = provider
                .describe_contribution(DescribeRequest {})
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
        let mut global_ids = BTreeSet::new();
        for provider in global_port.iter() {
            let response = provider
                .describe_contribution(lenso_capability_ui_global_contribution::DescribeRequest {})
                .await
                .map_err(|error| lenso_kernel::RuntimeFailure::PluginFailure {
                    detail: format!("Global UI contribution describe failed: {error:?}"),
                })?;
            global_ids.insert((
                provider.provider_instance().to_owned(),
                response.workspace_id.clone(),
            ));
            let response =
                serde_json::from_value(serde_json::to_value(response).map_err(|error| {
                    lenso_kernel::RuntimeFailure::Internal {
                        detail: error.to_string(),
                    }
                })?)
                .map_err(|error| lenso_kernel::RuntimeFailure::Internal {
                    detail: error.to_string(),
                })?;
            contributions.push((provider.provider_instance().to_owned(), response));
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
        let mut mounts = catalog.mounts.as_ref().clone();
        for mount in &mut mounts {
            mount.global =
                global_ids.contains(&(mount.owner.instance.clone(), mount.page_id.clone()));
            if mount.global && !matches!(mount.subject, ContributionSubject::Console) {
                return Err(lenso_kernel::RuntimeFailure::InvalidResolvedPlan {
                    detail: "Global UI contributions require Console subject".to_owned(),
                });
            }
        }
        catalog.mounts = Arc::new(mounts);
        let (dispatch, runtime) = services.finish(service_port.clone());
        catalog.services = dispatch;
        Ok((catalog, runtime))
    }

    #[cfg(test)]
    pub(super) fn from_contributions(
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
            validate_response(&contribution)?;
            let subject =
                contribution_subject(contribution.subject.as_ref(), allowed_app_subjects)?;
            let workspaces = workspace_descriptors(&contribution)?;
            let (digest, decoded_assets) = snapshot_implementation(&contribution)?;
            for workspace in workspaces {
                let (mount, contribution_assets) = snapshot_contribution(
                    owner.clone(),
                    &contribution,
                    workspace,
                    &subject,
                    &digest,
                    &decoded_assets,
                    services.as_deref_mut(),
                )?;
                anyhow::ensure!(
                    ids.insert(mount.id.clone()),
                    "duplicate Console mount id: {}",
                    mount.id
                );
                for (key, asset) in contribution_assets {
                    anyhow::ensure!(
                        assets.insert(key, asset).is_none(),
                        "duplicate Console Workspace asset path"
                    );
                }
                mounts.push(mount);
            }
        }
        anyhow::ensure!(
            mounts.len() <= 64,
            "Console supports at most 64 workspace mounts"
        );
        Ok(Self {
            mounts: Arc::new(mounts),
            assets: Arc::new(assets),
            services: WorkspaceServiceDispatch::unavailable(),
        })
    }

    #[cfg(test)]
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
                    workspaces: None,
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

    pub(super) async fn handle(&self, request: &Request) -> Option<Response> {
        if request.path == "/api/console/v1/surfaces" {
            return Some(if request.method == Method::GET {
                Json(serde_json::json!({
                    "schema": "console.page-catalog/1",
                    "mounts": self.mounts.iter().filter(|mount| mount.global).collect::<Vec<_>>(),
                }))
                .into_response()
            } else {
                StatusCode::METHOD_NOT_ALLOWED.into_response()
            });
        }
        if request.path == "/api/console/v1/pages" {
            return Some(if request.method == Method::GET {
                list_pages(State(self.clone())).into_response()
            } else {
                StatusCode::METHOD_NOT_ALLOWED.into_response()
            });
        }
        if let Some(tail) = request.path.strip_prefix("/api/console/v1/pages/") {
            let mut parts = tail.splitn(4, '/');
            let workspace_id = parts.next()?;
            let marker = parts.next()?;
            let digest = parts.next()?;
            let path = parts.next()?;
            if marker == "assets" {
                return Some(
                    if request.method == Method::GET || request.method == Method::HEAD {
                        let mut response = read_asset(
                            State(self.clone()),
                            HttpPath((
                                crate::http::decode_path(workspace_id)?,
                                crate::http::decode_path(digest)?,
                                crate::http::decode_path(path)?,
                            )),
                        );
                        if request.method == Method::HEAD {
                            *response.body_mut() = Body::empty();
                        }
                        response
                    } else {
                        StatusCode::METHOD_NOT_ALLOWED.into_response()
                    },
                );
            }
        }
        if let Some(tail) = request.path.strip_prefix("/api/console/v1/pages/") {
            let mut parts = tail.split('/');
            if let (Some(id), Some("services")) = (parts.next(), parts.next()) {
                let id = crate::http::decode_path(id)?;
                if let Some(mount) = self.mounts.iter().find(|mount| mount.id == id) {
                    let changed = [
                        ("x-lenso-page-owner", mount.owner.instance.as_str()),
                        ("x-lenso-page-revision", mount.revision.as_str()),
                        (
                            "x-lenso-page-implementation",
                            mount.implementation_id.as_str(),
                        ),
                    ]
                    .iter()
                    .any(|(name, expected)| {
                        request
                            .headers
                            .get(*name)
                            .is_some_and(|value| value.to_str().ok() != Some(*expected))
                    });
                    if changed {
                        return Some(
                            (
                                StatusCode::CONFLICT,
                                [(header::CACHE_CONTROL, "no-store")],
                                Json(serde_json::json!({"code":"page_mount_changed"})),
                            )
                                .into_response(),
                        );
                    }
                }
            }
        }
        self.services.handle(request).await
    }
}

fn snapshot_contribution(
    owner: String,
    contribution: &DescribeResponse,
    workspace: WorkspaceDescriptor,
    subject: &ContributionSubject,
    digest: &str,
    decoded_assets: &[(String, Asset)],
    services: Option<&mut WorkspaceServiceBuilder>,
) -> anyhow::Result<(PageMount, AssetMap)> {
    let mount_id = instance_mount_id(
        &owner,
        &workspace.id,
        subject,
        contribution.workspaces.is_none(),
    );
    let declared_requirements = workspace
        .requirements
        .as_ref()
        .unwrap_or(&contribution.requirements);
    let requirements = if let Some(services) = services {
        services.bind_mount(&mount_id, &owner, declared_requirements)?
    } else {
        declared_requirements
            .iter()
            .map(PublishedRequirement::unavailable)
            .collect()
    };
    let asset_base = format!("/api/console/v1/pages/{mount_id}/assets/{digest}");
    let assets = decoded_assets
        .iter()
        .map(|(path, asset)| {
            (
                (mount_id.clone(), digest.to_owned(), path.clone()),
                asset.clone(),
            )
        })
        .collect();
    let mount = PageMount {
        base_path: subject_path(
            &if contribution.workspaces.is_none() {
                format!("/{mount_id}/")
            } else {
                workspace.path
            },
            subject,
        ),
        access: workspace.access,
        index: workspace.index,
        routes: workspace.routes,
        global: false,
        id: mount_id,
        page_id: workspace.id,
        implementation_id: digest.to_owned(),
        title: workspace.title,
        subject: subject.clone(),
        api_major: 1,
        module: format!("{asset_base}/{}", contribution.module),
        styles: contribution
            .styles
            .iter()
            .map(|path| format!("{asset_base}/{path}"))
            .collect(),
        navigation: workspace.navigation,
        owner: ContributionOwner {
            instance: owner,
            source: "resolved-plan",
            trusted: true,
        },
        revision: contribution.revision.clone(),
        requirements,
    };
    Ok((mount, assets))
}

fn subject_path(path: &str, subject: &ContributionSubject) -> String {
    match subject {
        ContributionSubject::Console => path.to_owned(),
        ContributionSubject::App { app_id } => format!("/apps/{app_id}{path}"),
    }
}

fn workspace_descriptors(
    contribution: &DescribeResponse,
) -> anyhow::Result<Vec<WorkspaceDescriptor>> {
    let mut workspaces: Vec<WorkspaceDescriptor> = if let Some(workspaces) =
        &contribution.workspaces
    {
        anyhow::ensure!(
            !workspaces.is_empty() && workspaces.len() <= 32,
            "Plugin requires 1..32 workspaces"
        );
        serde_json::from_value(serde_json::to_value(workspaces)?)?
    } else {
        vec![WorkspaceDescriptor {
            id: contribution.workspace_id.clone(),
            title: contribution.title.clone(),
            path: format!("/{}", contribution.workspace_id),
            access: WorkspaceAccess::Member,
            index: Vec::new(),
            routes: vec![vec!["[[...path]]".to_owned()]],
            navigation: serde_json::from_value(serde_json::to_value(&contribution.navigation)?)?,
            requirements: None,
        }]
    };
    let mut ids = BTreeSet::new();
    for workspace in &mut workspaces {
        anyhow::ensure!(
            valid_slug(&workspace.id) && ids.insert(workspace.id.clone()),
            "Invalid or duplicate workspace identity"
        );
        anyhow::ensure!(
            !workspace.title.trim().is_empty()
                && workspace.title.len() <= 80
                && !workspace.navigation.label.trim().is_empty()
                && workspace.navigation.label.len() <= 40,
            "Invalid workspace labels"
        );
        workspace.path = canonical_path(&workspace.path, workspace.access)?;
        validate_routes(&workspace.routes)?;
        anyhow::ensure!(
            workspace.index.len() <= 8
                && workspace
                    .index
                    .iter()
                    .all(|segment| valid_path_segment(segment))
                && workspace.routes.iter().any(|route| matches_route(
                    route,
                    &workspace
                        .index
                        .iter()
                        .map(String::as_str)
                        .collect::<Vec<_>>()
                )),
            "Workspace homepage is not a declared page"
        );
        let mut paths = BTreeSet::new();
        if let Some(requirements) = &workspace.requirements {
            anyhow::ensure!(
                requirements.len() <= 32
                    && requirements
                        .iter()
                        .all(
                            |requirement| contribution.requirements.iter().any(|declared| {
                                requirement.service_id == declared.service_id
                                    && requirement.capability_id == declared.capability_id
                                    && requirement.descriptor_version == declared.descriptor_version
                                    && requirement.source == declared.source
                                    && !requirement.operations.is_empty()
                                    && requirement
                                        .operations
                                        .iter()
                                        .all(|operation| declared.operations.contains(operation))
                            })
                        ),
                "Workspace service requirements must be a subset of the owning Plugin declaration"
            );
        }
        anyhow::ensure!(
            workspace.navigation.items.len() <= 32
                && workspace
                    .navigation
                    .items
                    .iter()
                    .all(|item| !item.label.trim().is_empty()
                        && item.label.len() <= 80
                        && item.path.len() <= 8
                        && item.path.iter().all(|segment| valid_path_segment(segment))
                        && paths.insert(item.path.clone())),
            "Invalid workspace navigation"
        );
    }
    Ok(workspaces)
}

fn snapshot_implementation(
    contribution: &DescribeResponse,
) -> anyhow::Result<(String, Vec<(String, Asset)>)> {
    let mut decoded_assets = decode_assets(contribution)?;
    decoded_assets.sort_by(|left, right| left.0.cmp(&right.0));
    let mut hasher = Sha256::new();
    hash_part(&mut hasher, contribution.revision.as_bytes());
    for (path, asset) in &decoded_assets {
        hash_part(&mut hasher, path.as_bytes());
        hash_part(&mut hasher, asset.media_type.as_bytes());
        hash_part(&mut hasher, &asset.bytes);
    }
    Ok((hex::encode(hasher.finalize()), decoded_assets))
}

fn instance_mount_id(
    owner: &str,
    page_id: &str,
    subject: &ContributionSubject,
    legacy: bool,
) -> String {
    // Legacy global workspace IDs retain configured permission selectors.
    // New workspace IDs are local to their Plugin and always bind the owner.
    if legacy
        && (owner.ends_with("/default") || owner.starts_with("dev.filesystem."))
        && matches!(subject, ContributionSubject::Console)
    {
        return page_id.to_owned();
    }
    let mut hasher = Sha256::new();
    hash_part(&mut hasher, owner.as_bytes());
    hash_part(&mut hasher, page_id.as_bytes());
    match subject {
        ContributionSubject::Console => hash_part(&mut hasher, b"console"),
        ContributionSubject::App { app_id } => {
            hash_part(&mut hasher, b"app");
            hash_part(&mut hasher, app_id.as_bytes());
        }
    }
    let digest = hex::encode(hasher.finalize());
    format!("{}-{}", &page_id[..page_id.len().min(39)], &digest[..24])
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

fn list_pages(State(catalog): State<PageCatalog>) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "schema": "console.page-catalog/1",
        "mounts": catalog.mounts.iter().filter(|mount| !mount.global).collect::<Vec<_>>(),
    }))
}

fn read_asset(
    State(catalog): State<PageCatalog>,
    HttpPath((workspace_id, digest, path)): HttpPath<(String, String, String)>,
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

#[cfg(test)]
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

#[cfg(test)]
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

#[cfg(test)]
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
        workspaces: None,
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
    use crate::http::Request;

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

    // Existing discovery tests have one owner. Prevent repeated page declarations
    // from colliding, and ensure changing executable content cannot rename a mount.
    #[test]
    fn one_implementation_has_independent_stable_instance_mounts() {
        let root = tempfile::tempdir().unwrap();
        write_contribution(root.path(), "example", "page.mjs");
        let response = DescribeResponse {
            assets: vec![
                lenso_capability_ui_contribution::DescribeResponseAssetsItem {
                    content_base64: STANDARD.encode("export const apiMajor = 1;"),
                    media_type: DescribeResponseAssetsItemMediaType::TextJavascriptCharsetUtf,
                    path: "page.mjs".to_owned(),
                },
            ],
            module: "page.mjs".to_owned(),
            navigation: lenso_capability_ui_contribution::DescribeResponseNavigation {
                label: "Example".to_owned(),
                items: vec![],
            },
            requirements: vec![],
            revision: "1".to_owned(),
            styles: vec![],
            subject: None,
            title: "Example".to_owned(),
            workspaces: None,
            workspace_id: "example".to_owned(),
        };
        let catalog = PageCatalog::from_contributions(
            vec![
                ("plugin/alpha".to_owned(), response.clone()),
                ("plugin/beta".to_owned(), response.clone()),
            ],
            &BTreeSet::new(),
        )
        .unwrap();
        let [alpha, beta] = catalog.mounts.as_slice() else {
            panic!("expected two mounts")
        };
        assert_ne!(alpha.id, beta.id);
        assert_eq!(alpha.page_id, beta.page_id);
        assert_eq!(alpha.implementation_id, beta.implementation_id);
        assert_ne!(alpha.module, beta.module);
        let mut upgraded = response.clone();
        upgraded.revision = "2".to_owned();
        let upgraded = PageCatalog::from_contributions(
            vec![("plugin/alpha".to_owned(), upgraded)],
            &BTreeSet::new(),
        )
        .unwrap();
        assert_eq!(upgraded.mounts[0].id, alpha.id);
        assert_ne!(
            upgraded.mounts[0].implementation_id,
            alpha.implementation_id
        );
        assert!(
            PageCatalog::from_contributions(
                vec![
                    ("plugin/alpha".to_owned(), response.clone()),
                    ("plugin/alpha".to_owned(), response)
                ],
                &BTreeSet::new()
            )
            .is_err()
        );
        assert_ne!(
            instance_mount_id(
                "plugin/alpha",
                "example",
                &ContributionSubject::Console,
                true
            ),
            instance_mount_id(
                "plugin/alpha",
                "example",
                &ContributionSubject::App {
                    app_id: "support".to_owned()
                },
                true
            )
        );
    }

    // Legacy discovery cannot exercise local workspace IDs, URL overrides, or
    // admin mounts. This uses the formal multi-workspace wire response directly.
    fn declared_response(path: &str, routes: &serde_json::Value) -> DescribeResponse {
        serde_json::from_value(serde_json::json!({
            "assets": [{"content_base64": STANDARD.encode("export const apiMajor = 1;"),
                "media_type": "text/javascript; charset=utf-8", "path": "page.mjs"}],
            "module": "page.mjs", "navigation": {"label":"User","items":[]},
            "requirements": [], "revision":"1", "styles": [], "title":"User",
            "workspace_id":"user", "workspaces":[{
                "id":"user", "title":"User", "path":path, "access":"member",
                "index":[], "routes":routes, "navigation":{"label":"User","items":[]}
            }]
        }))
        .unwrap()
    }

    #[test]
    fn declared_default_instances_keep_local_page_ids_and_stable_mount_identity() {
        let response = declared_response("/user", &serde_json::json!([[], ["details"]]));
        let mut catalog = PageCatalog::from_contributions(
            vec![
                ("first/default".into(), response.clone()),
                ("second/default".into(), response.clone()),
            ],
            &BTreeSet::new(),
        )
        .unwrap();
        let identities = catalog
            .mounts
            .iter()
            .map(|mount| {
                (
                    mount.id.clone(),
                    mount.page_id.clone(),
                    mount.implementation_id.clone(),
                    mount.module.clone(),
                )
            })
            .collect::<Vec<_>>();
        assert_ne!(identities[0].0, identities[1].0);
        assert_eq!(identities[0].1, identities[1].1);
        assert_eq!(identities[0].2, identities[1].2);
        assert!(catalog.apply_mount_overrides(&[]).is_err());
        catalog
            .apply_mount_overrides(&[
                WorkspaceMountOverride {
                    instance: "first/default".into(),
                    workspace: "user".into(),
                    path: "/user-one".into(),
                },
                WorkspaceMountOverride {
                    instance: "second/default".into(),
                    workspace: "user".into(),
                    path: "/user-two".into(),
                },
            ])
            .unwrap();
        for (mount, expected) in catalog.mounts.iter().zip(identities) {
            assert_eq!(
                (
                    &mount.id,
                    &mount.page_id,
                    &mount.implementation_id,
                    &mount.module
                ),
                (&expected.0, &expected.1, &expected.2, &expected.3)
            );
        }
        assert_eq!(
            catalog.canonical_page_path("/user-one/details"),
            Some("/user-one/details/".into())
        );
        assert_eq!(
            catalog.canonical_page_path("/user-two/details/"),
            Some("/user-two/details/".into())
        );
        assert_eq!(catalog.canonical_page_path("/user-two/missing.js"), None);
        assert!(
            catalog
                .apply_mount_overrides(&[WorkspaceMountOverride {
                    instance: "first/default".into(),
                    workspace: "missing".into(),
                    path: "/other".into()
                }])
                .is_err()
        );
        // Failed overrides cannot mutate the published catalog.
        assert_eq!(catalog.mounts[0].base_path, "/user-one/");
        let mut admin = serde_json::to_value(response).unwrap();
        admin["workspaces"][0]["access"] = serde_json::json!("administrator");
        admin["workspaces"][0]["path"] = serde_json::json!("/admin");
        let mut admin = PageCatalog::from_contributions(
            vec![(
                "first/default".into(),
                serde_json::from_value(admin).unwrap(),
            )],
            &BTreeSet::new(),
        )
        .unwrap();
        admin.apply_mount_overrides(&[]).unwrap();
        let id = &admin.mounts[0].id;
        assert!(admin.request_requires_administrator(&format!(
            "/api/console/v1/pages/{id}/assets/test/page.mjs"
        )));
        assert!(admin.request_requires_administrator(&format!(
            "/api/console/v1/pages/{id}/services/example/invoke/read"
        )));
        assert!(
            !admin
                .request_requires_administrator("/api/console/v1/pages/other/assets/test/page.mjs")
        );
    }

    #[test]
    fn root_workspace_rejects_reserved_and_ambiguous_mount_routes() {
        for routes in [
            serde_json::json!([[], ["api"]]),
            serde_json::json!([[], ["admin"]]),
            serde_json::json!([[], ["[name]", "details"]]),
            serde_json::json!([[], ["[...path]"]]),
        ] {
            let mut catalog = PageCatalog::from_contributions(
                vec![
                    ("root/default".into(), declared_response("/", &routes)),
                    (
                        "child/default".into(),
                        declared_response("/child", &serde_json::json!([[]])),
                    ),
                ],
                &BTreeSet::new(),
            )
            .unwrap();
            assert!(catalog.apply_mount_overrides(&[]).is_err());
        }
        let mut catalog = PageCatalog::from_contributions(
            vec![
                (
                    "root/default".into(),
                    declared_response(
                        "/",
                        &serde_json::json!([[], ["administrator"], ["admin-tools"]]),
                    ),
                ),
                (
                    "child/default".into(),
                    declared_response("/child", &serde_json::json!([[]])),
                ),
            ],
            &BTreeSet::new(),
        )
        .unwrap();
        catalog.apply_mount_overrides(&[]).unwrap();
        assert_eq!(
            catalog.canonical_page_path("/administrator"),
            Some("/administrator/".into())
        );
        assert_eq!(
            catalog.canonical_page_path("/admin-tools"),
            Some("/admin-tools/".into())
        );
        assert_eq!(catalog.canonical_page_path("/favicon.ico"), None);
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
        let app = PageCatalog::discover(root.path(), &BTreeSet::new()).unwrap();
        let response = app
            .handle(&Request::new(Method::GET, "/api/console/v1/pages"))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = response.into_body().collect(16 * 1024).await.unwrap();
        let value: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(value["mounts"][0]["owner"]["trusted"], false);
        let module = value["mounts"][0]["module"].as_str().unwrap();

        let asset = app
            .handle(&Request::new(Method::GET, module))
            .await
            .unwrap();
        assert_eq!(asset.status(), StatusCode::OK);
        assert_eq!(
            asset.headers()[header::CACHE_CONTROL],
            "public, max-age=31536000, immutable"
        );

        let missing = app
            .handle(&Request::new(
                Method::GET,
                &module.replace("page.mjs", "missing.mjs"),
            ))
            .await
            .unwrap();
        assert_eq!(missing.status(), StatusCode::NOT_FOUND);
    }
}
