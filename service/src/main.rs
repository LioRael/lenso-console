use lenso_console_plugin::{ConsoleConfig, serve};

#[tokio::main(flavor = "current_thread")]
async fn main() -> anyhow::Result<()> {
    lenso_console_plugin::link();
    let local = tokio::task::LocalSet::new();
    local
        .run_until(serve(ConsoleConfig::load()?, shutdown_signal()))
        .await
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
}
