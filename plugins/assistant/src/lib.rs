//! Optional global UI provider. No Console binary or Agent implementation dependency.
use base64::{Engine as _, engine::general_purpose::STANDARD};
use lenso_capability_ui_global_contribution as ui;
use lenso_kernel::{ActivateContext, DeactivateContext, InvocationContext, RuntimeFailure};
use std::{path::PathBuf, time::Duration};

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct AssistantConfig {
    asset_root: PathBuf,
    agent_origin: String,
    control_token_file: Option<PathBuf>,
}

fn failure(error: impl std::fmt::Display) -> RuntimeFailure {
    RuntimeFailure::PluginFailure {
        detail: format!("Assistant: {error}"),
    }
}

fn validate_config(config: &AssistantConfig) -> Result<(), RuntimeFailure> {
    let url = reqwest::Url::parse(&config.agent_origin).map_err(failure)?;
    if !config.asset_root.is_absolute()
        || url.scheme() != "http"
        || !matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"))
        || url.path() != "/"
        || url.query().is_some()
        || url.fragment().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(failure(
            "requires installed assets and an explicit loopback Agent origin",
        ));
    }
    Ok(())
}

#[lenso::plugin(lifecycle, configuration_schema = "config.schema.json", validate = validate_config)]
#[derive(Clone, Debug)]
struct Assistant {
    #[config]
    config: AssistantConfig,
}

#[lenso::provides(ui::GlobalContribution)]
impl Assistant {
    fn describe_contribution(
        &self,
        _context: InvocationContext,
        _request: ui::DescribeRequest,
    ) -> lenso_kernel::NativeRequestFuture<ui::GlobalContribution> {
        let root = self.config.asset_root.clone();
        Box::pin(async move {
            let mut assets = Vec::new();
            let paths: Vec<String> =
                serde_json::from_slice(&std::fs::read(root.join("assets.json")).map_err(failure)?)
                    .map_err(failure)?;
            if paths.len() > 64 {
                return Err(failure("too many UI assets"));
            }
            for path in paths {
                if path.contains('/')
                    || path.contains('\\')
                    || !(path.ends_with(".mjs") || path.ends_with(".css"))
                {
                    return Err(failure("invalid UI asset path"));
                }
                let media_type = if path.ends_with(".css") {
                    "text/css; charset=utf-8"
                } else {
                    "text/javascript; charset=utf-8"
                };
                let bytes = std::fs::read(root.join(&path)).map_err(failure)?;
                if bytes.len() > 1024 * 1024 {
                    return Err(failure("asset exceeds one MiB"));
                }
                assets.push(serde_json::json!({"path":path,"media_type":media_type,"content_base64":STANDARD.encode(bytes)}));
            }
            let response = serde_json::from_value(serde_json::json!({
                "workspace_id":"assistant", "title":"Assistant", "revision":env!("CARGO_PKG_VERSION"),
                "module":"assistant.mjs", "styles":["assistant.css"], "subject":{"kind":"console"},
                "navigation":{"label":"Assistant", "items":[]}, "requirements":[], "assets":assets
            })).map_err(failure)?;
            Ok(Ok(response))
        })
    }
}

impl lenso::Lifecycle for Assistant {
    async fn activate(&self, _context: ActivateContext) -> Result<(), RuntimeFailure> {
        validate_config(&self.config)?;
        for path in ["assistant.mjs", "assistant.css"] {
            let metadata = std::fs::metadata(self.config.asset_root.join(path)).map_err(failure)?;
            if !metadata.is_file() || metadata.len() > 1024 * 1024 {
                return Err(failure("invalid installed UI asset"));
            }
        }
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(failure)?;
        let mut request = client
            .get(format!(
                "{}/api/console/v1/agent/bootstrap",
                self.config.agent_origin.trim_end_matches('/')
            ))
            .timeout(Duration::from_secs(2));
        if let Some(path) = &self.config.control_token_file {
            let token = std::fs::read_to_string(path).map_err(failure)?;
            if token.trim().is_empty() || token.len() > 8192 {
                return Err(failure("invalid Host Agent control credential"));
            }
            request = request.bearer_auth(token.trim());
        }
        let response = request.send().await.map_err(failure)?;
        if !response.status().is_success() {
            return Err(failure(format!(
                "Agent readiness returned {}",
                response.status()
            )));
        }
        Ok(())
    }
    async fn deactivate(&self, _context: DeactivateContext) -> Result<(), RuntimeFailure> {
        Ok(())
    }
}

pub fn link() {}
