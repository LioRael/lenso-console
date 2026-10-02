//! Translate the Agent HTTP protocol for the local process launcher.
use super::AppAgentAdapter;
use std::{net::SocketAddr, time::Duration};

impl lenso_local_agent_launcher::AgentClient for AppAgentAdapter {
    fn connect(address: SocketAddr, token: String) -> anyhow::Result<Self> {
        let mut adapter = Self::parse_as("app", &format!("http://{address}"), "Lenso Agent")
            .map_err(anyhow::Error::msg)?
            .ok_or_else(|| anyhow::anyhow!("Project adapter is unavailable"))?;
        adapter.activity = Some(lenso_agent_turn_relay::TurnRelay::default());
        adapter.authorization = Some(format!("Bearer {token}"));
        Ok(adapter)
    }

    async fn require_ready(&self) -> anyhow::Result<()> {
        AppAgentAdapter::require_ready(self).await
    }

    async fn project_profile(&self) -> anyhow::Result<Option<String>> {
        // Readiness verifies the source before copying its visible configuration.
        self.require_ready().await?;
        let mut url = self.origin.clone();
        url.set_path("/api/console/v1/agent/bootstrap");
        let mut request = self.client.get(url).timeout(Duration::from_secs(2));
        if let Some(token) = &self.authorization {
            request = request.header("authorization", token);
        }
        let bootstrap: serde_json::Value = request.send().await?.error_for_status()?.json().await?;
        let profile = bootstrap["profile"].as_str().map(str::to_owned);
        anyhow::ensure!(
            profile
                .as_deref()
                .is_none_or(|name| matches!(name, "plan" | "code" | "code-sandbox")),
            "This project launcher supports the standard coding Profiles"
        );
        Ok(profile)
    }

    async fn initialize_profile(&self, profile: Option<&str>) -> anyhow::Result<()> {
        initialize_profile(self, profile).await
    }
}

async fn initialize_profile(
    adapter: &AppAgentAdapter,
    profile: Option<&str>,
) -> anyhow::Result<()> {
    let Some(profile) = profile else {
        return Ok(());
    };
    let token = adapter
        .authorization
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("Project authorization is unavailable"))?;
    let base = adapter.origin.join("api/console/v1/agent/")?;
    let configuration: serde_json::Value = adapter
        .client
        .get(base.join("control/plugins")?)
        .header("authorization", token)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    let inventory: serde_json::Value = adapter
        .client
        .get(base.join("plugins")?)
        .header("authorization", token)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    adapter.client.post(base.join("control/profiles/import")?).header("authorization", token).json(&serde_json::json!({"expectedRevision":configuration["revision"],"expectedStreamId":inventory["streamId"]})).send().await?.error_for_status()?;
    adapter
        .client
        .post(base.join("control/profile")?)
        .header("authorization", token)
        .json(&serde_json::json!({"profile":profile}))
        .send()
        .await?
        .error_for_status()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        Json, Router,
        extract::{Request, State},
        response::IntoResponse,
    };
    use lenso_local_agent_launcher::AgentClient;
    use std::sync::{Arc, Mutex};

    type Calls = Arc<Mutex<Vec<(String, serde_json::Value)>>>;

    #[tokio::test]
    async fn launcher_client_preserves_authorization_and_profile_preconditions() {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let router = Router::new()
            .fallback(|State(calls): State<Calls>, request: Request| async move {
                if request
                    .headers()
                    .get("authorization")
                    .and_then(|value| value.to_str().ok())
                    != Some("Bearer private-token")
                {
                    return http::StatusCode::UNAUTHORIZED.into_response();
                }
                let path = request.uri().path().to_owned();
                let bytes = axum::body::to_bytes(request.into_body(), 4096)
                    .await
                    .unwrap();
                let body = if bytes.is_empty() {
                    serde_json::Value::Null
                } else {
                    serde_json::from_slice(&bytes).unwrap()
                };
                calls.lock().unwrap().push((path.clone(), body));
                Json(match path.as_str() {
                    "/api/console/v1/agent/bootstrap" => serde_json::json!({"profile":"code"}),
                    "/api/console/v1/agent/control/plugins" => {
                        serde_json::json!({"revision":7})
                    }
                    "/api/console/v1/agent/plugins" => {
                        serde_json::json!({"streamId":"generation-a"})
                    }
                    _ => serde_json::json!({}),
                })
                .into_response()
            })
            .with_state(calls.clone());
        let server = tokio::spawn(async move {
            axum::serve(listener, router).await.unwrap();
        });
        let client = AppAgentAdapter::connect(address, "private-token".to_owned()).unwrap();
        assert_eq!(
            client.project_profile().await.unwrap().as_deref(),
            Some("code")
        );
        client.initialize_profile(Some("code")).await.unwrap();
        let observed = calls.lock().unwrap().clone();
        assert_eq!(
            observed,
            vec![
                (
                    "/api/console/v1/agent/bootstrap".to_owned(),
                    serde_json::Value::Null
                ),
                (
                    "/api/console/v1/agent/bootstrap".to_owned(),
                    serde_json::Value::Null
                ),
                (
                    "/api/console/v1/agent/control/plugins".to_owned(),
                    serde_json::Value::Null
                ),
                (
                    "/api/console/v1/agent/plugins".to_owned(),
                    serde_json::Value::Null
                ),
                (
                    "/api/console/v1/agent/control/profiles/import".to_owned(),
                    serde_json::json!({"expectedRevision":7,"expectedStreamId":"generation-a"})
                ),
                (
                    "/api/console/v1/agent/control/profile".to_owned(),
                    serde_json::json!({"profile":"code"})
                ),
            ]
        );
        let unauthorized = AppAgentAdapter::connect(address, "wrong-token".to_owned()).unwrap();
        assert!(unauthorized.project_profile().await.is_err());
        assert_eq!(calls.lock().unwrap().len(), observed.len());
        server.abort();
        let _ = server.await;
    }
}
