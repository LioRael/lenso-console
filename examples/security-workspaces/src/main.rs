//! Native product Host; configure security owner Instances through its Plugin Root.
use lenso_kernel::{Kernel, ShutdownOutcome};
use lenso_runner::TokioDriver;
use lenso_security_workspaces_example::{
    admitted_catalog, host_catalog, registry, validate_session_transport,
};
use lenso_web_ingress_plugin::WebIngressFactory;
use std::{net::SocketAddr, path::PathBuf, time::Duration};

#[tokio::main(flavor = "current_thread")]
async fn main() -> anyhow::Result<()> {
    tokio::task::LocalSet::new().run_until(serve()).await
}

async fn serve() -> anyhow::Result<()> {
    let root = PathBuf::from(std::env::args().nth(1).ok_or_else(|| {
        anyhow::anyhow!("usage: security-workspaces <absolute-app-root> [bind-address]")
    })?);
    anyhow::ensure!(root.is_absolute(), "App root must be absolute");
    let address: SocketAddr = std::env::args()
        .nth(2)
        .unwrap_or_else(|| "127.0.0.1:3032".into())
        .parse()?;
    let catalog = host_catalog(address)?;
    // Publish the Host's availability authority; never write App selection, secrets,
    // migrations, initial roles, or storage state during startup.
    std::fs::create_dir_all(root.join(".lenso"))?;
    std::fs::create_dir_all(root.join("plugins"))?;
    std::fs::write(
        root.join(".lenso/host-catalog.json"),
        serde_json::to_vec_pretty(&catalog)?,
    )?;
    let resolved = lenso_app_authoring::load_resolved_app(&root)?;
    let admitted = admitted_catalog(&catalog, resolved.plan())?;
    std::fs::write(
        root.join(".lenso/host-catalog.json"),
        serde_json::to_vec_pretty(&admitted)?,
    )?;
    let resolved = lenso_app_authoring::load_resolved_app(&root)?;
    validate_session_transport(resolved.plan())?;
    let ingress = WebIngressFactory::new();
    let app = Kernel::start_native(
        resolved.plan().clone(),
        TokioDriver::new(),
        registry(ingress.clone()),
    )
    .await
    .map_err(|error| anyhow::anyhow!("native App startup: {error:?}"))?;
    println!(
        "Security workspaces App: http://{}",
        ingress.local_address().unwrap_or(address)
    );
    tokio::signal::ctrl_c().await?;
    anyhow::ensure!(
        app.shutdown(Duration::from_secs(5)).await == ShutdownOutcome::Clean,
        "native shutdown failed"
    );
    Ok(())
}
