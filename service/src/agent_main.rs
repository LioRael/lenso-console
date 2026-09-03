use std::{path::PathBuf, process::ExitCode, time::Duration};

use directories::BaseDirs;
use lenso_console_plugin::{ConsoleConfig, serve};
use tokio::process::{Child, Command};

const APP_AGENT_ADDRESS: &str = "127.0.0.1:8787";
const APP_AGENT_ORIGIN: &str = "http://127.0.0.1:8787";
const CONSOLE_AGENT_ADDRESS: &str = "127.0.0.1:8788";
const CONSOLE_AGENT_ORIGIN: &str = "http://127.0.0.1:8788";

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
    let app_agent_binary =
        std::env::var_os("LENSO_AGENT_WEB_BIN").unwrap_or_else(|| "lenso-agent-web".into());
    let console_agent_binary = std::env::var_os("LENSO_CONSOLE_AGENT_WEB_BIN")
        .unwrap_or_else(|| "lenso-agent-console-web".into());
    let console_home = console_home()?;
    let control_token = uuid::Uuid::new_v4().simple().to_string();

    let mut app_command = Command::new(&app_agent_binary);
    app_command
        .arg("--listen")
        .arg(APP_AGENT_ADDRESS)
        .arg("--plugin-control")
        .env_remove("LENSO_AGENT_DATA_PLANE_TOKEN")
        .env("LENSO_AGENT_HOME", agent_home()?)
        .env("LENSO_AGENT_CONTROL_TOKEN", &control_token);
    configure_app_agent_authority(&mut app_command)?;
    append_trusted_bundles(&mut app_command, "LENSO_AGENT_TRUSTED_PLUGIN_BUNDLES")?;

    let mut console_command = Command::new(&console_agent_binary);
    console_command
        .arg("--listen")
        .arg(CONSOLE_AGENT_ADDRESS)
        .arg("--plugin-control")
        .arg("--plugin-configuration-store")
        .arg(console_home.join("agent-configuration.sqlite3"))
        .arg("--tool-policy")
        .arg(console_home.join("agent/tool-policy.json"))
        .arg("--managed-agent")
        .arg(format!("app={APP_AGENT_ORIGIN}"))
        .env_remove("LENSO_AGENT_DATA_PLANE_TOKEN")
        .env("LENSO_AGENT_HOME", console_home.join("agent"))
        .env("LENSO_AGENT_CONTROL_TOKEN", &control_token);
    for tool in configured_console_agent_tools()? {
        console_command.arg("--allow-tool").arg(tool);
    }
    append_trusted_bundles(&mut console_command, "LENSO_CONSOLE_TRUSTED_PLUGIN_BUNDLES")?;

    let mut app_agent = spawn(&mut app_command, "App Agent")?;
    wait_until_ready(APP_AGENT_ORIGIN, "App Agent").await?;
    let mut console_agent = spawn(&mut console_command, "Console Agent")?;
    wait_until_ready(CONSOLE_AGENT_ORIGIN, "Console Agent").await?;

    let config = ConsoleConfig::load()?
        .with_console_agent(CONSOLE_AGENT_ORIGIN, Some(control_token.clone()))?
        .with_app_agent_management_token(APP_AGENT_ORIGIN, "Lenso Agent", &control_token)?;
    let result = serve(config, shutdown_signal()).await;
    stop(&mut console_agent).await;
    stop(&mut app_agent).await;
    result
}

fn spawn(command: &mut Command, label: &str) -> anyhow::Result<Child> {
    command.kill_on_drop(true);
    command
        .spawn()
        .map_err(|error| anyhow::anyhow!("failed to start {label}: {error}"))
}

async fn stop(child: &mut Child) {
    let _ = child.start_kill();
    let _ = child.wait().await;
}

async fn wait_until_ready(origin: &str, label: &str) -> anyhow::Result<()> {
    let client = reqwest::Client::new();
    let url = format!("{origin}/api/console/v1/agent/bootstrap");
    for _ in 0..100 {
        if client
            .get(&url)
            .send()
            .await
            .is_ok_and(|response| response.status().is_success())
        {
            return Ok(());
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    anyhow::bail!("{label} did not become ready at {origin}")
}

fn console_home() -> anyhow::Result<PathBuf> {
    std::env::var_os("LENSO_CONSOLE_HOME").map_or_else(
        || {
            BaseDirs::new()
                .map(|base| base.home_dir().join(".lenso/console"))
                .ok_or_else(|| anyhow::anyhow!("the user home directory is unavailable"))
        },
        |value| absolute_path(value.into(), "LENSO_CONSOLE_HOME"),
    )
}

fn agent_home() -> anyhow::Result<PathBuf> {
    std::env::var_os("LENSO_AGENT_HOME").map_or_else(
        || {
            BaseDirs::new()
                .map(|base| base.home_dir().join(".lenso/agent"))
                .ok_or_else(|| anyhow::anyhow!("the user home directory is unavailable"))
        },
        |value| absolute_path(value.into(), "LENSO_AGENT_HOME"),
    )
}

fn absolute_path(value: PathBuf, name: &str) -> anyhow::Result<PathBuf> {
    anyhow::ensure!(value.is_absolute(), "{name} must be an absolute path");
    Ok(value)
}

fn configure_app_agent_authority(command: &mut Command) -> anyhow::Result<()> {
    let kind = std::env::var("LENSO_AGENT_PLUGIN_CONFIGURATION_AUTHORITY")
        .unwrap_or_else(|_| "sqlite_configuration_store".to_owned());
    match kind.as_str() {
        "local_plugin_root" => {}
        "sqlite_configuration_store" => {
            let store = std::env::var_os("LENSO_AGENT_PLUGIN_CONFIGURATION_STORE")
                .map(PathBuf::from)
                .map_or_else(
                    || agent_home().map(|home| home.join("plugin-configuration.sqlite3")),
                    Ok,
                )?;
            command.arg("--plugin-configuration-store").arg(store);
        }
        "remote_configuration_service" => {
            for (argument, variable) in [
                (
                    "--plugin-configuration-remote",
                    "LENSO_AGENT_PLUGIN_CONFIGURATION_REMOTE_URL",
                ),
                (
                    "--plugin-configuration-app",
                    "LENSO_AGENT_PLUGIN_CONFIGURATION_REMOTE_APP",
                ),
                (
                    "--plugin-configuration-environment",
                    "LENSO_AGENT_PLUGIN_CONFIGURATION_REMOTE_ENVIRONMENT",
                ),
            ] {
                command.arg(argument).arg(required_environment(variable)?);
            }
        }
        _ => anyhow::bail!("unsupported LENSO_AGENT_PLUGIN_CONFIGURATION_AUTHORITY: {kind}"),
    }
    Ok(())
}

fn required_environment(name: &str) -> anyhow::Result<String> {
    std::env::var(name)
        .ok()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| anyhow::anyhow!("{name} is required"))
}

fn append_trusted_bundles(command: &mut Command, name: &str) -> anyhow::Result<()> {
    let Ok(value) = std::env::var(name) else {
        return Ok(());
    };
    let entries = serde_json::from_str::<std::collections::BTreeMap<String, PathBuf>>(&value)
        .map_err(|error| anyhow::anyhow!("{name} must be a JSON object: {error}"))?;
    for (id, path) in entries {
        anyhow::ensure!(path.is_absolute(), "{name} paths must be absolute");
        command
            .arg("--trusted-plugin-bundle")
            .arg(format!("{id}={}", path.display()));
    }
    Ok(())
}

fn configured_console_agent_tools() -> anyhow::Result<Vec<String>> {
    match std::env::var("LENSO_CONSOLE_AGENT_TOOLS") {
        Ok(value) => Ok(value
            .split(',')
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_owned)
            .collect()),
        Err(std::env::VarError::NotPresent) => Ok([
            "inspect_app",
            "list_plugins",
            "inspect_plugin",
            "check_plugin_change",
            "apply_plugin_change",
            "list_plugin_changes",
            "check_plugin_rollback",
            "apply_plugin_rollback",
            "set_plugin_enabled",
            "list_available_plugins",
            "check_plugin_install",
            "apply_plugin_install",
            "check_plugin_removal",
            "apply_plugin_removal",
        ]
        .into_iter()
        .map(str::to_owned)
        .collect()),
        Err(error) => Err(error.into()),
    }
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
}
