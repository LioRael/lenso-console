#[tokio::main]
async fn main() -> anyhow::Result<()> {
    lenso_console_service::prepare_environment()?;
    match lenso_console_service::recovery_mode()? {
        lenso_console_service::ConsoleRecoveryMode::Normal => {
            lenso::host::run_api_with_embedded_worker_from_env_with_composition(
                lenso_console_service::host_composition(),
            )
            .await
        }
        lenso_console_service::ConsoleRecoveryMode::Restore => {
            lenso::host::run_api_from_env_with_composition(
                lenso_console_service::host_composition(),
            )
            .await
        }
    }
}
