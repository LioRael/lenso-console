//! Fixed, instance-owned HTTP mounts. Internal handlers keep their canonical paths.

#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(default, deny_unknown_fields)]
pub struct ConsoleHttpPaths {
    pub shell_base_path: String,
    pub api_base_path: String,
    pub auth_base_path: String,
}

impl Default for ConsoleHttpPaths {
    fn default() -> Self {
        Self {
            shell_base_path: "/".into(),
            api_base_path: "/api".into(),
            auth_base_path: "/auth".into(),
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
    fn mounts_are_segment_bounded_and_reject_ambiguous_prefixes() {
        let paths = ConsoleHttpPaths {
            shell_base_path: "/admin".into(),
            api_base_path: "/admin/api".into(),
            auth_base_path: "/auth/operator".into(),
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
