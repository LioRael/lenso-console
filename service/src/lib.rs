mod composition;
mod modules;

use std::path::{Path, PathBuf};

use lenso::host::prelude::*;
use serde::Serialize;
use utoipa::ToSchema;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ConsoleRecoveryMode {
    Normal,
    Restore,
}

/// Exact Console Service Composition.
///
/// The Console owns independent Auth and Organization domains, Host-owned
/// Console Access, and exactly one mandatory System Registry implementation.
/// Optional Console Modules are added here by a reviewed Console Service
/// Release rather than discovered at runtime.
pub fn host_composition() -> HostComposition {
    let composition = composition::official_host_composition();
    modules::story::install_default_story_display(&composition);
    composition
}

/// Load local development configuration and fail closed unless this process is
/// the dedicated Console Service using the minimal linked profile.
///
/// # Errors
///
/// Returns an error when the process is not configured as the exact Console
/// Service `core` composition.
pub fn prepare_environment() -> anyhow::Result<()> {
    load_service_environment()?;
    validate_environment(
        std::env::var("LENSO_COMPOSITION_PROFILE").as_deref(),
        std::env::var("SERVICE_NAME").as_deref(),
        std::env::var("CONSOLE_RECOVERY_MODE").as_deref(),
        std::env::var("LENSO_MODULE_PLATFORM_STORY_ENABLED").as_deref(),
    )
}

/// Return the startup-validated Console recovery mode.
///
/// # Errors
///
/// Returns an error when the mode is missing or not one of the closed values.
pub fn recovery_mode() -> anyhow::Result<ConsoleRecoveryMode> {
    recovery_mode_from_value(std::env::var("CONSOLE_RECOVERY_MODE").as_deref())
}

/// Reject a dedicated Worker process while recovery fencing is active.
///
/// # Errors
///
/// Returns an error in restore mode or when recovery configuration is invalid.
pub fn require_background_work_allowed() -> anyhow::Result<()> {
    anyhow::ensure!(
        recovery_mode()? == ConsoleRecoveryMode::Normal,
        "Console background work is disabled while CONSOLE_RECOVERY_MODE=restore"
    );
    Ok(())
}

fn load_service_environment() -> anyhow::Result<()> {
    let service_env = service_environment_path();
    if !service_env.is_file() {
        return Ok(());
    }
    dotenvy::from_path(&service_env).map_err(|error| {
        anyhow::anyhow!(
            "failed to load Console Service environment from {}: {error}",
            service_env.display()
        )
    })?;
    Ok(())
}

fn service_environment_path() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join(".env")
}

fn validate_environment(
    composition_profile: Result<&str, &std::env::VarError>,
    service_name: Result<&str, &std::env::VarError>,
    recovery_mode: Result<&str, &std::env::VarError>,
    legacy_story_enabled: Result<&str, &std::env::VarError>,
) -> anyhow::Result<()> {
    anyhow::ensure!(
        composition_profile == Ok("core"),
        "LENSO_COMPOSITION_PROFILE must be exactly `core` for the Console Service"
    );
    anyhow::ensure!(
        service_name == Ok("lenso-console"),
        "SERVICE_NAME must be exactly `lenso-console` for the Console Service"
    );
    anyhow::ensure!(
        legacy_story_enabled == Ok("false"),
        "LENSO_MODULE_PLATFORM_STORY_ENABLED must be exactly `false` while the Console supports framework releases that still bundle the legacy Story module"
    );
    recovery_mode_from_value(recovery_mode)?;
    Ok(())
}

fn recovery_mode_from_value(
    value: Result<&str, &std::env::VarError>,
) -> anyhow::Result<ConsoleRecoveryMode> {
    match value {
        Ok("normal") => Ok(ConsoleRecoveryMode::Normal),
        Ok("restore") => Ok(ConsoleRecoveryMode::Restore),
        _ => anyhow::bail!("CONSOLE_RECOVERY_MODE must be exactly `normal` or `restore`"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn composition_has_independent_identity_organization_and_one_system_registry() {
        let composition = host_composition();
        let names = composition
            .linked_modules()
            .iter()
            .map(|module| module.module_name)
            .collect::<Vec<_>>();

        assert_eq!(
            names,
            [
                "lenso/console-shell",
                "auth",
                "auth-password",
                "organization",
                "lenso/system-registry",
                "lenso/console-access",
                "lenso/platform-story"
            ]
        );
        assert_eq!(
            names
                .iter()
                .filter(|name| **name == "lenso/system-registry")
                .count(),
            1
        );
        assert_eq!(
            names,
            composition::official_composition(ConsoleRecoveryMode::Normal)
                .modules
                .iter()
                .map(|module| module.module_id.as_str())
                .collect::<Vec<_>>()
        );
        assert_eq!(
            composition::official_composition(ConsoleRecoveryMode::Normal).status,
            composition::ConsoleCompositionStatus::Ready
        );
    }

    #[test]
    fn environment_rejects_demo_or_renamed_service_composition() {
        assert!(
            validate_environment(Ok("core"), Ok("lenso-console"), Ok("normal"), Ok("false"))
                .is_ok()
        );
        assert!(
            validate_environment(Ok("demo"), Ok("lenso-console"), Ok("normal"), Ok("false"))
                .is_err()
        );
        assert!(
            validate_environment(Ok("core"), Ok("support"), Ok("normal"), Ok("false")).is_err()
        );
        assert!(
            validate_environment(Ok("core"), Ok("lenso-console"), Ok("normal"), Ok("true"))
                .is_err()
        );
    }

    #[test]
    fn recovery_mode_is_explicit_and_fail_closed() {
        assert_eq!(
            recovery_mode_from_value(Ok("normal")).unwrap(),
            ConsoleRecoveryMode::Normal
        );
        assert_eq!(
            recovery_mode_from_value(Ok("restore")).unwrap(),
            ConsoleRecoveryMode::Restore
        );
        assert!(recovery_mode_from_value(Ok("disabled")).is_err());
        let missing = std::env::VarError::NotPresent;
        assert!(recovery_mode_from_value(Err(&missing)).is_err());
    }

    #[test]
    fn service_environment_is_owned_by_the_service_directory() {
        assert_eq!(
            service_environment_path(),
            Path::new(env!("CARGO_MANIFEST_DIR")).join(".env")
        );
    }
}
