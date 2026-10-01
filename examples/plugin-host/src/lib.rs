use lenso_capability_http_endpoint::prelude::*;
#[cfg(feature = "console")]
use lenso_console_plugin::ConsolePlugin;
use lenso_web_host::NativeWebHost;

#[lenso::plugin]
#[derive(Clone, Debug, Default)]
pub struct Health {}

#[endpoint]
impl Health {
    #[get("health.read", "/health")]
    async fn health(
        &self,
    ) -> Result<Json<serde_json::Value>, lenso_capability_http_endpoint::response::Problem> {
        Ok(Json(serde_json::json!({ "status": "ok" })))
    }
}

/// Compose an optional Console beside the application's own endpoint Plugin.
pub fn app() -> NativeWebHost {
    let host = NativeWebHost::new().plugin::<Health>();
    #[cfg(feature = "console")]
    let host = host.plugin::<ConsolePlugin>();
    host
}

#[cfg(test)]
mod tests {
    use super::app;

    // Prevent removing the optional Console dependency from taking the
    // application's business endpoint down; run with and without defaults.
    #[tokio::test(flavor = "current_thread")]
    async fn console_can_be_removed_without_removing_the_application() {
        tokio::task::LocalSet::new()
            .run_until(async {
                let client = reqwest::Client::new();
                let with_console = cfg!(feature = "console");
                {
                    let running = app()
                        .bind("127.0.0.1:0".parse().unwrap())
                        .start()
                        .await
                        .unwrap();
                    let origin = format!("http://{}", running.address());
                    let health = client.get(format!("{origin}/health")).send().await.unwrap();
                    assert_eq!(health.status(), reqwest::StatusCode::OK);
                    assert_eq!(
                        health.json::<serde_json::Value>().await.unwrap()["status"],
                        "ok"
                    );
                    let shell = client.get(format!("{origin}/")).send().await.unwrap();
                    if with_console {
                        assert_eq!(shell.status(), reqwest::StatusCode::OK);
                        assert!(
                            shell
                                .text()
                                .await
                                .unwrap()
                                .to_ascii_lowercase()
                                .contains("<!doctype html>")
                        );
                    } else {
                        assert_eq!(shell.status(), reqwest::StatusCode::NOT_FOUND);
                    }
                    running.shutdown().await.unwrap();
                }
            })
            .await;
    }
}
