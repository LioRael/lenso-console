//! Workspace URL metadata, independent of Plugin Instance and executable identity.
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub(super) enum WorkspaceAccess {
    #[default]
    Member,
    Administrator,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct WorkspaceMountOverride {
    pub instance: String,
    pub workspace: String,
    pub path: String,
}

pub(super) fn canonical_path(path: &str, access: WorkspaceAccess) -> anyhow::Result<String> {
    if path == "/" {
        return Ok(path.to_owned());
    }
    let normalized = path.strip_suffix('/').unwrap_or(path);
    let parts = normalized
        .strip_prefix('/')
        .ok_or_else(|| anyhow::anyhow!("Workspace path must start with /"))?
        .split('/')
        .collect::<Vec<_>>();
    anyhow::ensure!(
        path.len() <= 256 && parts.iter().all(|part| valid_segment(part)),
        "Workspace path is not canonical: {path}"
    );
    anyhow::ensure!(
        !reserved(parts[0]) && (parts[0] != "admin" || access == WorkspaceAccess::Administrator),
        "Workspace path is reserved: {path}"
    );
    Ok(format!("{normalized}/"))
}

pub(super) fn reserved(segment: &str) -> bool {
    matches!(
        segment,
        "api"
            | "auth"
            | "assets"
            | "health"
            | "management"
            | "settings"
            | "plugins"
            | "agent"
            | "apps"
            | "favicon.ico"
            | "favicon.svg"
            | "robots.txt"
            | "manifest.webmanifest"
            | "index.html"
    )
}

fn valid_segment(segment: &str) -> bool {
    !segment.is_empty()
        && segment.len() <= 64
        && segment.as_bytes()[0].is_ascii_alphanumeric()
        && segment.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || b"._-".contains(&byte)
        })
}

pub(super) fn validate_routes(routes: &[Vec<String>]) -> anyhow::Result<()> {
    use std::collections::BTreeSet;
    anyhow::ensure!(
        !routes.is_empty() && routes.len() <= 32,
        "Workspace requires 1..32 routes"
    );
    let mut shapes = BTreeSet::new();
    for route in routes {
        anyhow::ensure!(route.len() <= 8, "Workspace routes exceed eight segments");
        let mut names = BTreeSet::new();
        let mut shape = Vec::new();
        for (index, part) in route.iter().enumerate() {
            if part.starts_with('[') {
                let (name, marker) = if let Some(name) = part
                    .strip_prefix("[[...")
                    .and_then(|part| part.strip_suffix("]]"))
                {
                    (name, "[[...]]")
                } else if let Some(name) = part
                    .strip_prefix("[...")
                    .and_then(|part| part.strip_suffix(']'))
                {
                    (name, "[...]")
                } else if let Some(name) = part
                    .strip_prefix('[')
                    .and_then(|part| part.strip_suffix(']'))
                {
                    (name, "[]")
                } else {
                    anyhow::bail!("Invalid workspace route parameter");
                };
                anyhow::ensure!(
                    !name.is_empty()
                        && name.as_bytes()[0].is_ascii_alphabetic()
                        && name
                            .bytes()
                            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
                        && names.insert(name),
                    "Invalid or duplicate workspace route parameter"
                );
                anyhow::ensure!(
                    marker == "[]" || index + 1 == route.len(),
                    "Workspace catch-all must be terminal"
                );
                shape.push(marker.to_owned());
            } else {
                anyhow::ensure!(
                    !part.is_empty()
                        && part.len() <= 64
                        && part.as_bytes()[0].is_ascii_alphanumeric()
                        && part
                            .bytes()
                            .all(|byte| byte.is_ascii_alphanumeric() || b"._-".contains(&byte)),
                    "Invalid relative workspace route"
                );
                shape.push(part.clone());
            }
        }
        anyhow::ensure!(shapes.insert(shape), "Ambiguous workspace routes");
    }
    Ok(())
}

pub(super) fn matches_route<S: AsRef<str>>(pattern: &[S], actual: &[&str]) -> bool {
    let mut cursor = 0;
    for part in pattern {
        let part = part.as_ref();
        if part.starts_with("[[...") {
            return true;
        }
        if part.starts_with("[...") {
            return cursor < actual.len();
        }
        let Some(value) = actual.get(cursor) else {
            return false;
        };
        if !part.starts_with('[') && part != *value {
            return false;
        }
        cursor += 1;
    }
    cursor == actual.len()
}
