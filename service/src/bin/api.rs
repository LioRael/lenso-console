#[tokio::main]
async fn main() -> anyhow::Result<()> {
    lenso_console_service::prepare_environment()?;
    lenso::host::run_api_from_env_with_composition(lenso_console_service::host_composition()).await
}
