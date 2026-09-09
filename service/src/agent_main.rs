use std::{path::PathBuf, process::ExitCode, time::Duration};

use directories::BaseDirs;
use lenso_console_plugin::{ConsoleConfig, start_host, store_agent_control_token};
use tokio::process::{Child, Command};

#[tokio::main(flavor = "current_thread")]
async fn main() -> ExitCode {
    let local = tokio::task::LocalSet::new();
    match local
        .run_until(async {
            tokio::select! {
                result = run() => result,
                () = shutdown_signal() => Ok(()),
            }
        })
        .await
    {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("error: {error:#}");
            ExitCode::FAILURE
        }
    }
}

async fn run() -> anyhow::Result<()> {
    // Reserve separate loopback ports before spawning either independent Host.
    let app_port = std::net::TcpListener::bind("127.0.0.1:0")?;
    let console_port = std::net::TcpListener::bind("127.0.0.1:0")?;
    let app_address = app_port.local_addr()?.to_string();
    let console_address = console_port.local_addr()?.to_string();
    let app_origin = format!("http://{app_address}");
    let console_origin = format!("http://{console_address}");
    let initial_config = ConsoleConfig::load()?;
    // Fail before modifying Agent state if the requested Console port is occupied.
    let console_listener = std::net::TcpListener::bind(initial_config.address)
        .map_err(|error| anyhow::anyhow!(
            "Console cannot listen on {}: {error}. Choose another port with --port or HTTP_PORT.",
            initial_config.address
        ))?;
    let app_agent_binary =
        std::env::var_os("LENSO_AGENT_WEB_BIN").unwrap_or_else(|| "lenso-agent-web".into());
    let console_agent_binary = std::env::var_os("LENSO_CONSOLE_AGENT_WEB_BIN")
        .unwrap_or_else(|| "lenso-agent-console-web".into());
    let console_home = console_home()?;
    let control_token = uuid::Uuid::new_v4().simple().to_string();
    let control_token_file = console_home.join("agent-control-token");
    store_agent_control_token(&control_token_file, &control_token)?;

    let mut app_command = Command::new(&app_agent_binary);
    app_command
        .arg("--listen")
        .arg(&app_address)
        .arg("--tool-policy")
        .arg(agent_home()?.join("tool-policy.json"))
        .arg("--plugin-control")
        .env_remove("LENSO_AGENT_DATA_PLANE_TOKEN")
        .env("LENSO_AGENT_HOME", agent_home()?)
        .env("LENSO_AGENT_CONTROL_TOKEN", &control_token);
    configure_app_agent_authority(&mut app_command)?;
    if let Ok(profile) = std::env::var("LENSO_AGENT_PROFILE") {
        anyhow::ensure!(
            !profile.trim().is_empty(),
            "LENSO_AGENT_PROFILE must not be empty"
        );
        app_command.arg("--profile").arg(profile);
    }
    if let Ok(tools) = std::env::var("LENSO_AGENT_TOOLS") {
        for tool in tools
            .split(',')
            .map(str::trim)
            .filter(|tool| !tool.is_empty())
        {
            app_command.arg("--allow-tool").arg(tool);
        }
    }
    append_trusted_bundles(&mut app_command, "LENSO_AGENT_TRUSTED_PLUGIN_BUNDLES")?;

    let mut console_command = Command::new(&console_agent_binary);
    console_command
        .arg("--listen")
        .arg(&console_address)
        .arg("--plugin-control")
        .arg("--plugin-configuration-store")
        .arg(console_home.join("agent-configuration.sqlite3"))
        .arg("--tool-policy")
        .arg(console_home.join("agent/tool-policy.json"))
        .arg("--managed-agent")
        .arg(format!("app={app_origin}"))
        .env_remove("LENSO_AGENT_DATA_PLANE_TOKEN")
        .env("LENSO_AGENT_HOME", console_home.join("agent"))
        .env("LENSO_AGENT_CONTROL_TOKEN", &control_token);
    for tool in configured_console_agent_tools()? {
        console_command.arg("--allow-tool").arg(tool);
    }
    append_trusted_bundles(&mut console_command, "LENSO_CONSOLE_TRUSTED_PLUGIN_BUNDLES")?;

    drop(app_port);
    let mut app_agent = spawn(&mut app_command, "App Agent")?;
    wait_until_ready(&app_origin, "App Agent", &mut app_agent).await?;
    drop(console_port);
    let mut console_agent = spawn(&mut console_command, "Console Agent")?;
    wait_until_ready(&console_origin, "Console Agent", &mut console_agent).await?;

    let project_binary = resolve_program(&PathBuf::from(app_agent_binary))?;
    let config = initial_config
        .with_local_project_paths(
            &console_home.join("projects"),
            &agent_home()?,
            &project_binary,
        )?
        .with_agent_control_token_file(control_token_file)
        .with_console_agent(&console_origin, Some(control_token.clone()))?
        .with_app_agent_management_token(&app_origin, "Lenso Agent", &control_token)?
        .with_app_agent_auth_connections("app")?;
    // The preflight listener protects Agent state from an immediately invalid
    // Console address. Plugin activation owns the actual listener lifecycle.
    drop(console_listener);
    let console = start_host(&config).await?;
    let result = tokio::select! {
        () = shutdown_signal() => Ok(()),
        status = app_agent.wait() => Err(anyhow::anyhow!("App Agent exited unexpectedly: {status:?}")),
        status = console_agent.wait() => Err(anyhow::anyhow!("Console Agent exited unexpectedly: {status:?}")),
    };
    let shutdown = console.shutdown(Duration::from_secs(10)).await;
    stop(&mut console_agent).await;
    stop(&mut app_agent).await;
    anyhow::ensure!(
        matches!(shutdown, lenso_kernel::ShutdownOutcome::Clean),
        "Console Host shutdown failed: {shutdown:?}"
    );
    result
}

fn resolve_program(program: &std::path::Path) -> anyhow::Result<PathBuf> {
    if program.is_absolute() || program.components().count() > 1 {
        return Ok(program.canonicalize()?);
    }
    for directory in std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default()) {
        let candidate = directory.join(program);
        if candidate.is_file() {
            return Ok(candidate.canonicalize()?);
        }
    }
    anyhow::bail!("Agent Web executable is unavailable")
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

async fn wait_until_ready(origin: &str, label: &str, child: &mut Child) -> anyhow::Result<()> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()?;
    let url = format!("{origin}/api/console/v1/agent/bootstrap");
    let deadline = tokio::time::Instant::now() + Duration::from_secs(60);
    while tokio::time::Instant::now() < deadline {
        if let Some(status) = child.try_wait()? {
            anyhow::bail!("{label} exited before readiness: {status}");
        }
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
    #[cfg(unix)]
    {
        if let Ok(mut signal) =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        {
            tokio::select! {
                _ = tokio::signal::ctrl_c() => {},
                _ = signal.recv() => {},
            }
            return;
        }
    }
    let _ = tokio::signal::ctrl_c().await;
}
