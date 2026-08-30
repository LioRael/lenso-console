use std::{net::SocketAddr, process::ExitCode};

use lenso_agent_web_current::{AgentWebAccess, AgentWebConfig, AgentWebSurface};
use lenso_console_plugin::{ConsoleConfig, serve};

const DEFAULT_AGENT_ADDRESS: &str = "127.0.0.1:8787";

#[tokio::main(flavor = "current_thread")]
async fn main() -> ExitCode {
    let local = tokio::task::LocalSet::new();
    match local.run_until(run()).await {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("error: {error:#}");
            ExitCode::FAILURE
        }
    }
}

async fn run() -> anyhow::Result<()> {
    lenso_console_plugin::link();
    let agent_address = agent_address()?;
    let agent_listener = tokio::net::TcpListener::bind(agent_address).await?;
    let agent_address = agent_listener.local_addr()?;
    let console = ConsoleConfig::load()?
        .with_connected_agent(&format!("http://{agent_address}"), "Connected Harness")?;
    let mut agent_config = AgentWebConfig::new(lenso_agent_default_plugins_current::link);
    agent_config.access = AgentWebAccess::Local;
    let agent = AgentWebSurface::start(agent_config)
        .await
        .map_err(anyhow::Error::msg)?;
    let (stop_agent, agent_shutdown) = tokio::sync::oneshot::channel();
    let agent_router = agent.router();
    let agent_server = tokio::task::spawn_local(async move {
        axum::serve(agent_listener, agent_router)
            .with_graceful_shutdown(async move {
                let _ = agent_shutdown.await;
            })
            .await
    });
    println!("Connected Lenso Agent listening on http://{agent_address}");

    let console_result = serve(console, shutdown_signal()).await;
    let _ = stop_agent.send(());
    let agent_server_result = agent_server
        .await
        .map_err(|error| anyhow::anyhow!("Agent Web server task failed: {error}"))?;
    let agent_shutdown_result = agent.shutdown().await.map_err(anyhow::Error::msg);
    console_result?;
    agent_server_result?;
    agent_shutdown_result
}

fn agent_address() -> anyhow::Result<SocketAddr> {
    let value = std::env::var("LENSO_AGENT_WEB_LISTEN")
        .unwrap_or_else(|_| DEFAULT_AGENT_ADDRESS.to_owned());
    let address = value.parse::<SocketAddr>()?;
    anyhow::ensure!(
        address.ip().is_loopback(),
        "LENSO_AGENT_WEB_LISTEN must be a loopback address"
    );
    Ok(address)
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_agent_address_is_loopback() {
        let address = DEFAULT_AGENT_ADDRESS.parse::<SocketAddr>().unwrap();
        assert!(address.ip().is_loopback());
    }
}
