#[tokio::main]
async fn main() -> anyhow::Result<()> {
    lenso_console_service::prepare_environment()?;
    lenso_console_service::require_background_work_allowed()?;
    lenso::host::run_worker_from_env_with_composition(lenso_console_service::host_composition())
        .await
}
