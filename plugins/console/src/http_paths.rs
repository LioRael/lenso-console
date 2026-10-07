//! Fixed, instance-owned HTTP mounts. Internal handlers keep their canonical paths.

#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(default, deny_unknown_fields)]
pub struct ConsoleHttpPaths {
    pub shell_base_path: String,
    pub api_base_path: String,
    pub auth_base_path: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub workspace_sources: Vec<WorkspaceSource>,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(deny_unknown_fields)]
pub struct WorkspaceSource {
    pub id: String,
    pub account_issuer: String,
    pub shell_base_path: String,
    pub api_base_path: String,
    pub auth_base_path: String,
    pub mounts: Vec<WorkspaceSourceMount>,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(deny_unknown_fields)]
pub struct WorkspaceSourceMount {
    pub id: String,
    pub base_path: String,
    pub navigation_checks: Vec<WorkspaceNavigationCheck>,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(deny_unknown_fields)]
pub struct WorkspaceNavigationCheck {
    pub path: Vec<String>,
    pub service_id: String,
    pub operation: String,
    pub fields: Vec<String>,
}

impl Default for ConsoleHttpPaths {
    fn default() -> Self {
        Self {
            shell_base_path: "/".into(),
            api_base_path: "/api".into(),
            auth_base_path: "/auth".into(),
            workspace_sources: Vec::new(),
        }
    }
}

impl ConsoleHttpPaths {
    pub fn validate(&self) -> Result<(), String> {
        for path in [
            &self.shell_base_path,
            &self.api_base_path,
            &self.auth_base_path,
        ] {
            if path.len() > 128
                || !path.starts_with('/')
                || (path != "/" && path.ends_with('/'))
                || path.split('/').skip(1).any(|part| {
                    path != "/"
                        && (part.is_empty()
                            || matches!(part, "." | "..")
                            || !part
                                .bytes()
                                .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b)))
                })
            {
                return Err(
                    "Console HTTP paths must be canonical same-origin path prefixes".into(),
                );
            }
        }
        if self.api_base_path == "/"
            || self.auth_base_path == "/"
            || within(&self.shell_base_path, &self.api_base_path).is_some()
            || within(&self.api_base_path, &self.auth_base_path).is_some()
            || within(&self.auth_base_path, &self.api_base_path).is_some()
        {
            return Err("Console API and Auth prefixes must be separate non-root paths".into());
        }
        validate_sources(self)?;
        Ok(())
    }

    pub(crate) fn shell_path(&self, path: &str) -> String {
        format!("{}{}", self.shell_base_path.trim_end_matches('/'), path)
    }

    pub(crate) fn canonical_path(&self, path: &str) -> Option<String> {
        if let Some(tail) = within(path, &self.api_base_path) {
            return Some(format!("/api{tail}"));
        }
        if self.api_base_path != "/api" && within(path, "/api").is_some() {
            return None;
        }
        within(path, &self.shell_base_path).map(|tail| {
            if tail.is_empty() {
                "/".into()
            } else {
                tail.into()
            }
        })
    }

    pub(crate) fn shell_html(&self, bytes: Vec<u8>) -> Vec<u8> {
        let Ok(html) = String::from_utf8(bytes) else {
            return Vec::new();
        };
        let paths = serde_json::to_string(self).expect("HTTP paths serialize");
        let prefix = self.shell_base_path.trim_end_matches('/');
        let bootstrap = format!(
            "<base href=\"{prefix}/\"><script type=\"application/json\" id=\"lenso-console-http-paths\">{paths}</script>"
        );
        // The trusted Shell bundle may use root-relative preload/style URLs.
        let html = html
            .replace("\"/assets/", &format!("\"{prefix}/assets/"))
            .replace("\"/favicon.svg\"", &format!("\"{prefix}/favicon.svg\""));
        if let Some(position) = html.find("<head>") {
            let position = position + "<head>".len();
            format!("{}{}{}", &html[..position], bootstrap, &html[position..]).into_bytes()
        } else {
            format!("{bootstrap}{html}").into_bytes()
        }
    }
}

fn identifier(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value.as_bytes()[0].is_ascii_lowercase()
        && value.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || b"._-".contains(&byte)
        })
}

fn source_prefix(value: &str) -> bool {
    value.len() <= 128
        && value.starts_with('/')
        && value != "/"
        && value.split('/').skip(1).all(|part| {
            !part.is_empty()
                && !matches!(part, "." | "..")
                && part
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || b"._-".contains(&byte))
        })
}

fn overlaps(left: &str, right: &str) -> bool {
    within(left, right).is_some() || within(right, left).is_some()
}

fn validate_sources(paths: &ConsoleHttpPaths) -> Result<(), String> {
    let invalid = || "Workspace source configuration is invalid or ambiguous".to_owned();
    if paths.workspace_sources.len() > 8 {
        return Err(invalid());
    }
    let mut sources = std::collections::BTreeSet::new();
    let mut mounts = std::collections::BTreeSet::new();
    let mut apis = vec![paths.api_base_path.as_str()];
    let mut auths: Vec<&str> = Vec::new();
    let mut routes: Vec<&str> = Vec::new();
    for source in &paths.workspace_sources {
        if !identifier(&source.id)
            || !sources.insert(&source.id)
            || source.account_issuer.is_empty()
            || source.account_issuer.len() > 256
            || !source.account_issuer.as_bytes()[0].is_ascii_alphanumeric()
            || !source
                .account_issuer
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || b"._:/-".contains(&byte))
            || !source_prefix(&source.shell_base_path)
            || !source_prefix(&source.api_base_path)
            || !source_prefix(&source.auth_base_path)
            || apis.iter().any(|api| overlaps(&source.api_base_path, api))
            || overlaps(&source.api_base_path, &paths.auth_base_path)
            || apis.iter().any(|api| overlaps(&source.auth_base_path, api))
            || source.auth_base_path == paths.auth_base_path
            || auths.iter().any(|auth| {
                overlaps(&source.api_base_path, auth) || overlaps(&source.auth_base_path, auth)
            })
            || overlaps(&source.api_base_path, &source.auth_base_path)
            || within(&source.shell_base_path, &source.api_base_path).is_some()
            || source.mounts.is_empty()
            || source.mounts.len() > 16
        {
            return Err(invalid());
        }
        apis.push(&source.api_base_path);
        auths.push(&source.auth_base_path);
        for mount in &source.mounts {
            let Some(base) = mount.base_path.strip_suffix('/') else {
                return Err(invalid());
            };
            if !identifier(&mount.id)
                || !mounts.insert(&mount.id)
                || !source_prefix(base)
                || crate::workspace_paths::canonical_path(
                    &mount.base_path,
                    crate::workspace_paths::WorkspaceAccess::Member,
                )
                .is_err()
                || routes.iter().any(|route| overlaps(base, route))
                || mount.navigation_checks.is_empty()
                || mount.navigation_checks.len() > 32
            {
                return Err(invalid());
            }
            routes.push(base);
            let mut checks = std::collections::BTreeSet::new();
            for check in &mount.navigation_checks {
                if check.path.len() > 8
                    || !checks.insert(&check.path)
                    || check.path.iter().any(|part| {
                        part.is_empty()
                            || part.len() > 64
                            || !part.as_bytes()[0].is_ascii_alphanumeric()
                            || !part
                                .bytes()
                                .all(|byte| byte.is_ascii_alphanumeric() || b"._-".contains(&byte))
                    })
                    || !identifier(&check.service_id)
                    || !identifier(&check.operation)
                    || check.fields.is_empty()
                    || check.fields.len() > 16
                    || check.fields.iter().any(|field| {
                        !field.starts_with("can_")
                            || field.len() < 5
                            || field.len() > 67
                            || !field[4..]
                                .bytes()
                                .all(|byte| byte.is_ascii_lowercase() || byte == b'_')
                    })
                {
                    return Err(invalid());
                }
            }
        }
    }
    Ok(())
}

fn within<'a>(path: &'a str, prefix: &str) -> Option<&'a str> {
    if prefix == "/" {
        return path.starts_with('/').then_some(path);
    }
    path.strip_prefix(prefix)
        .filter(|tail| tail.is_empty() || tail.starts_with('/'))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn workspace_sources_are_fixed_allowlists_before_bootstrap_serialization() {
        let mut paths: ConsoleHttpPaths = serde_json::from_value(serde_json::json!({
            "shell_base_path":"/console","api_base_path":"/console/api","auth_base_path":"/auth",
            "workspace_sources":[{
                "id":"operations","account_issuer":"relay.accounts.local",
                "shell_base_path":"/admin","api_base_path":"/admin/api","auth_base_path":"/auth/operator",
                "mounts":[{"id":"relay.operations","base_path":"/operations/","navigation_checks":[{
                    "path":[],"service_id":"relay-operator-actions","operation":"describe_permissions","fields":["can_list_requests"]
                }]}]
            }]
        })).unwrap();
        assert!(paths.validate().is_ok());
        let encoded = serde_json::to_value(&paths).unwrap();
        assert_eq!(
            encoded["workspace_sources"][0]["account_issuer"],
            "relay.accounts.local"
        );
        assert!(
            serde_json::to_value(ConsoleHttpPaths::default())
                .unwrap()
                .get("workspace_sources")
                .is_none()
        );
        for api in [
            "https://other/api",
            "/console/api/private",
            "/auth/operator/api",
            "/admin/../api",
        ] {
            let mut invalid = paths.clone();
            invalid.workspace_sources[0].api_base_path = api.into();
            assert!(invalid.validate().is_err());
        }
        for route in ["/settings/", "/operations/%2f/", "/admin/", "/operations"] {
            let mut invalid = paths.clone();
            invalid.workspace_sources[0].mounts[0].base_path = route.into();
            assert!(invalid.validate().is_err());
        }
        paths
            .workspace_sources
            .push(paths.workspace_sources[0].clone());
        assert!(paths.validate().is_err());
    }

    #[test]
    fn mounts_are_segment_bounded_and_reject_ambiguous_prefixes() {
        let paths = ConsoleHttpPaths {
            shell_base_path: "/admin".into(),
            api_base_path: "/admin/api".into(),
            auth_base_path: "/auth/operator".into(),
            workspace_sources: Vec::new(),
        };
        assert!(paths.validate().is_ok());
        assert_eq!(
            paths
                .canonical_path("/admin/api/console/v1/session")
                .as_deref(),
            Some("/api/console/v1/session")
        );
        assert_eq!(
            paths.canonical_path("/admin/keys/").as_deref(),
            Some("/keys/")
        );
        assert_eq!(
            paths.canonical_path("/console/api/console/v1/session"),
            None
        );
        assert_eq!(paths.canonical_path("/administrator/keys"), None);
        for path in [
            "//admin",
            "/admin/",
            "/admin/../console",
            "/admin%2f",
            "https://host/admin",
        ] {
            assert!(
                ConsoleHttpPaths {
                    shell_base_path: path.into(),
                    ..paths.clone()
                }
                .validate()
                .is_err()
            );
        }
        assert!(
            ConsoleHttpPaths {
                shell_base_path: "/admin/api/ui".into(),
                ..paths.clone()
            }
            .validate()
            .is_err()
        );
        assert!(
            ConsoleHttpPaths {
                auth_base_path: "/admin/api/auth".into(),
                ..paths
            }
            .validate()
            .is_err()
        );
    }

    #[test]
    fn bootstrap_exposes_only_paths_before_shell_modules() {
        let paths = ConsoleHttpPaths {
            shell_base_path: "/admin".into(),
            api_base_path: "/admin/api".into(),
            auth_base_path: "/auth/operator".into(),
            workspace_sources: Vec::new(),
        };
        let html = String::from_utf8(paths.shell_html(
            b"<html><head><script src=\"/assets/app.js\"></script></head></html>".to_vec(),
        ))
        .unwrap();
        assert!(html.contains("<base href=\"/admin/\">"));
        assert!(html.contains("src=\"/admin/assets/app.js\""));
        assert!(
            html.find("lenso-console-http-paths").unwrap()
                < html.find("/admin/assets/app.js").unwrap()
        );
        assert!(!html.contains("issuer") && !html.contains("public_key"));
    }
}
