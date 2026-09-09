use std::{
    collections::BTreeSet,
    path::{Component, Path, PathBuf},
    sync::Arc,
};

use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use tower_http::services::ServeDir;

const DESCRIPTOR_FILE: &str = "contribution.json";

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

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
enum ContributionSubject {
    Console,
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
}

#[derive(Clone, Debug, Serialize)]
struct ContributionNavigationResponse {
    label: String,
    items: Vec<ContributionNavigationItem>,
}

#[derive(Clone)]
pub(super) struct PageCatalog {
    mounts: Arc<Vec<PageMount>>,
}

impl PageCatalog {
    pub(super) fn discover(web_root: &Path) -> anyhow::Result<(Self, Router)> {
        let root = web_root.join("contributions");
        if !root.exists() {
            return Ok((
                Self {
                    mounts: Arc::new(Vec::new()),
                },
                Router::new(),
            ));
        }
        anyhow::ensure!(
            root.is_dir(),
            "Console contribution root must be a directory"
        );

        let mut directories = std::fs::read_dir(&root)?.collect::<Result<Vec<_>, _>>()?;
        directories.sort_by_key(std::fs::DirEntry::file_name);
        let mut ids = BTreeSet::new();
        let mut mounts = Vec::new();
        let mut assets = Router::new();
        for entry in directories {
            if !entry.file_type()?.is_dir() {
                continue;
            }
            let directory = entry.path();
            validate_artifact_tree(&directory)?;
            let descriptor: ContributionDescriptor =
                serde_json::from_slice(&std::fs::read(directory.join(DESCRIPTOR_FILE))?)?;
            validate_descriptor(&descriptor, &directory)?;
            anyhow::ensure!(
                ids.insert(descriptor.id.clone()),
                "duplicate Console contribution id: {}",
                descriptor.id
            );
            let asset_base = format!("/api/console/v1/pages/{}/assets", descriptor.id);
            let module = format!("{asset_base}/{}", descriptor.module);
            let styles = descriptor
                .styles
                .iter()
                .map(|style| format!("{asset_base}/{style}"))
                .collect();
            assets = assets.nest_service(&asset_base, ServeDir::new(directory));
            mounts.push(PageMount {
                id: descriptor.id,
                title: descriptor.title,
                subject: descriptor.subject,
                api_major: descriptor.runtime.api_major,
                module,
                styles,
                navigation: ContributionNavigationResponse {
                    label: descriptor.navigation.label,
                    items: descriptor.navigation.items,
                },
            });
        }
        Ok((
            Self {
                mounts: Arc::new(mounts),
            },
            assets,
        ))
    }

    pub(super) fn routes(self) -> Router {
        Router::new()
            .route("/api/console/v1/pages", axum::routing::get(list_pages))
            .with_state(self)
    }
}

async fn list_pages(
    axum::extract::State(catalog): axum::extract::State<PageCatalog>,
) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "schema": "console.page-catalog/1",
        "mounts": catalog.mounts.as_ref(),
    }))
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
        valid_slug(&descriptor.id),
        "invalid Console contribution id"
    );
    anyhow::ensure!(
        !descriptor.title.trim().is_empty() && !descriptor.navigation.label.trim().is_empty(),
        "Console contribution labels must not be empty"
    );
    let mut navigation_paths = BTreeSet::new();
    for item in &descriptor.navigation.items {
        anyhow::ensure!(
            !item.label.trim().is_empty()
                && item.path.iter().all(|segment| valid_path_segment(segment))
                && navigation_paths.insert(item.path.clone()),
            "Console contribution navigation item is invalid"
        );
    }
    anyhow::ensure!(
        descriptor.runtime.api_major == 1,
        "unsupported Console page API major"
    );
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
        http::{Request, StatusCode},
    };
    use tower::ServiceExt;

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
                "subject": "console",
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
        let (catalog, _) = PageCatalog::discover(root.path()).unwrap();
        assert_eq!(catalog.mounts.len(), 1);
        assert_eq!(catalog.mounts[0].id, "example");
        assert_eq!(catalog.mounts[0].navigation.items.len(), 2);

        let descriptor = root.path().join("contributions/example/contribution.json");
        let mut value: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&descriptor).unwrap()).unwrap();
        value["module"] = serde_json::json!("../page.mjs");
        std::fs::write(descriptor, value.to_string()).unwrap();
        assert!(PageCatalog::discover(root.path()).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn rejects_assets_that_escape_through_a_symbolic_link() {
        use std::os::unix::fs::symlink;

        let root = tempfile::tempdir().unwrap();
        write_contribution(root.path(), "example", "page.mjs");
        let outside = root.path().join("outside.mjs");
        std::fs::write(&outside, "export const apiMajor = 1;").unwrap();
        let module = root.path().join("contributions/example/page.mjs");
        std::fs::remove_file(&module).unwrap();
        symlink(outside, module).unwrap();

        assert!(PageCatalog::discover(root.path()).is_err());
    }

    #[test]
    fn rejects_duplicate_navigation_destinations() {
        let root = tempfile::tempdir().unwrap();
        write_contribution(root.path(), "example", "page.mjs");
        let descriptor = root.path().join("contributions/example/contribution.json");
        let mut value: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&descriptor).unwrap()).unwrap();
        value["navigation"]["items"] = serde_json::json!([
            { "label": "Home", "path": [] },
            { "label": "Also home", "path": [] }
        ]);
        std::fs::write(descriptor, value.to_string()).unwrap();

        assert!(PageCatalog::discover(root.path()).is_err());
    }

    #[test]
    fn rejects_navigation_path_traversal() {
        let root = tempfile::tempdir().unwrap();
        write_contribution(root.path(), "example", "page.mjs");
        let descriptor = root.path().join("contributions/example/contribution.json");
        let mut value: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&descriptor).unwrap()).unwrap();
        value["navigation"]["items"] = serde_json::json!([{ "label": "Escape", "path": [".."] }]);
        std::fs::write(descriptor, value.to_string()).unwrap();

        assert!(PageCatalog::discover(root.path()).is_err());
    }

    #[tokio::test]
    async fn serves_the_catalog_and_assets_without_spa_fallback() {
        let root = tempfile::tempdir().unwrap();
        write_contribution(root.path(), "example", "page.mjs");
        let (catalog, assets) = PageCatalog::discover(root.path()).unwrap();
        let app = catalog.routes().merge(assets);

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
        assert_eq!(value["mounts"][0]["id"], "example");
        assert_eq!(
            value["mounts"][0]["module"],
            "/api/console/v1/pages/example/assets/page.mjs"
        );

        let asset = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/console/v1/pages/example/assets/page.mjs")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(asset.status(), StatusCode::OK);
        let missing = app
            .oneshot(
                Request::builder()
                    .uri("/api/console/v1/pages/example/assets/missing.mjs")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(missing.status(), StatusCode::NOT_FOUND);
    }
}
