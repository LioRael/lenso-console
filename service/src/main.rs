use lenso_console_plugin::{ConsoleConfig, serve_host};

#[tokio::main(flavor = "current_thread")]
async fn main() -> anyhow::Result<()> {
    let local = tokio::task::LocalSet::new();
    local
        .run_until(serve_host(ConsoleConfig::load()?, shutdown_signal()))
        .await
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
}
