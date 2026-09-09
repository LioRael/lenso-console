//! Reference Workspace contribution Plugin.

use base64::{Engine as _, engine::general_purpose::STANDARD};
use futures::future::ready;
use lenso_capability_ui_contribution::{
    self as ui, ContributionProvider, DescribeRequest, DescribeResponse,
    DescribeResponseAssetsItem, DescribeResponseAssetsItemMediaType, DescribeResponseNavigation,
    DescribeResponseNavigationItemsItem, DescribeResponseSubject, DescribeResponseSubjectKind,
};
use lenso_kernel::InvocationContext;

const MODULE: &str = r#"
export const apiMajor = 1;
export const createWorkspace = ({ createElement }) => ({
  Page: ({ environment, location, mount, navigation }) => createElement(
    "section",
    { className: "welcome-workspace" },
    createElement("p", { className: "welcome-eyebrow" }, "PLUGIN WORKSPACE"),
    createElement("h1", null, "Welcome to " + mount.title),
    createElement("p", null, "This page is contributed by " + mount.owner.instance + "."),
    createElement("p", null, "Locale: " + environment.locale + " · Theme: " + environment.theme),
    createElement("button", { onClick: () => navigation.go([]), type: "button" },
      location.segments.length ? "Back to workspace home" : "Workspace is ready")
  )
});
"#;

const STYLES: &str = r"
.welcome-workspace { margin: 0 auto; max-width: 720px; padding: 64px 32px; }
.welcome-workspace h1 { font-size: 36px; letter-spacing: -0.04em; margin: 8px 0 16px; }
.welcome-workspace p { color: var(--lenso-color-text-secondary); line-height: 1.6; }
.welcome-workspace .welcome-eyebrow { font-size: 11px; font-weight: 700; letter-spacing: .12em; }
.welcome-workspace button { margin-top: 16px; }
";

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct WelcomeWorkspaceConfig {}

#[lenso::plugin(
    configuration_schema = "config.schema.json",
    configuration_defaults = "config.defaults.json"
)]
#[derive(Clone, Debug)]
struct WelcomeWorkspace {
    #[config]
    _config: WelcomeWorkspaceConfig,
}

#[lenso::provides(ui::Contribution)]
impl ContributionProvider for WelcomeWorkspace {
    fn describe(
        &self,
        _context: InvocationContext,
        _request: DescribeRequest,
    ) -> lenso_kernel::NativeRequestFuture<ui::Contribution> {
        Box::pin(ready(Ok(Ok(DescribeResponse {
            assets: vec![
                DescribeResponseAssetsItem {
                    content_base64: STANDARD.encode(MODULE),
                    media_type: DescribeResponseAssetsItemMediaType::TextJavascriptCharsetUtf,
                    path: "workspace.mjs".to_owned(),
                },
                DescribeResponseAssetsItem {
                    content_base64: STANDARD.encode(STYLES),
                    media_type: DescribeResponseAssetsItemMediaType::TextCssCharsetUtf,
                    path: "workspace.css".to_owned(),
                },
            ],
            module: "workspace.mjs".to_owned(),
            navigation: DescribeResponseNavigation {
                items: vec![
                    DescribeResponseNavigationItemsItem {
                        label: "Home".to_owned(),
                        path: Vec::new(),
                    },
                    DescribeResponseNavigationItemsItem {
                        label: "Runtime".to_owned(),
                        path: vec!["runtime".to_owned()],
                    },
                ],
                label: "Welcome".to_owned(),
            },
            requirements: Vec::new(),
            revision: env!("CARGO_PKG_VERSION").to_owned(),
            styles: vec!["workspace.css".to_owned()],
            subject: Some(DescribeResponseSubject {
                app_id: None,
                kind: DescribeResponseSubjectKind::Console,
            }),
            title: "Welcome".to_owned(),
            workspace_id: "welcome".to_owned(),
        }))))
    }
}

/// Forces this linked Plugin into a Host executable.
pub fn link() {}

#[cfg(test)]
mod tests {
    use super::*;
    use lenso_kernel::CancellationToken;

    #[test]
    fn descriptor_exports_one_workspace_contribution() {
        let descriptor: serde_json::Value = serde_json::from_str(PLUGIN_DESCRIPTOR_JSON).unwrap();
        assert_eq!(descriptor["plugin_id"], "lenso.console.workspace.welcome");
        assert_eq!(
            descriptor["provided_capabilities"][0]["capability_id"],
            ui::CAPABILITY_ID
        );
    }

    #[test]
    fn contribution_is_a_self_contained_workspace_snapshot() {
        let plugin = WelcomeWorkspace {
            _config: WelcomeWorkspaceConfig {},
        };
        let response = futures::executor::block_on(plugin.describe(
            InvocationContext::new(1, None, CancellationToken::new()),
            DescribeRequest {},
        ))
        .unwrap()
        .unwrap();
        assert_eq!(response.workspace_id, "welcome");
        assert_eq!(response.assets.len(), 2);
        assert!(
            response
                .assets
                .iter()
                .any(|asset| asset.path == response.module)
        );
    }
}
