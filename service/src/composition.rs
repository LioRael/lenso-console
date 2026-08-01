use lenso::host::prelude::*;
use serde::Serialize;
use utoipa::ToSchema;

use crate::ConsoleRecoveryMode;
use crate::modules;

pub const COMPOSITION_SCHEMA: &str = "lenso.console-service-composition.v2";
pub const CONSOLE_SERVICE_ID: &str = "lenso-console";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum MandatoryConsoleRole {
    Identity,
    SystemRegistry,
}

impl MandatoryConsoleRole {
    const ALL: [Self; 2] = [Self::Identity, Self::SystemRegistry];
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ConsoleCompositionStatus {
    Ready,
    RecoveryRequired,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ConsoleModuleKind {
    Shell,
    Mandatory,
    Optional,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConsoleCompositionModule {
    pub module_id: String,
    pub kind: ConsoleModuleKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<MandatoryConsoleRole>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConsoleCompositionIssue {
    pub code: String,
    pub message: String,
    pub next_action: String,
    pub role: MandatoryConsoleRole,
    pub module_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConsoleServiceComposition {
    pub schema: String,
    pub service_id: String,
    pub workload_mode: ConsoleRecoveryMode,
    pub status: ConsoleCompositionStatus,
    pub modules: Vec<ConsoleCompositionModule>,
    pub issues: Vec<ConsoleCompositionIssue>,
}

#[must_use]
pub fn official_composition(workload_mode: ConsoleRecoveryMode) -> ConsoleServiceComposition {
    evaluate_composition(
        vec![
            module(
                modules::console_shell::MODULE_NAME,
                ConsoleModuleKind::Shell,
                None,
            ),
            module(
                "auth",
                ConsoleModuleKind::Mandatory,
                Some(MandatoryConsoleRole::Identity),
            ),
            module("auth-password", ConsoleModuleKind::Optional, None),
            module(
                modules::system_registry::MODULE_NAME,
                ConsoleModuleKind::Mandatory,
                Some(MandatoryConsoleRole::SystemRegistry),
            ),
            module(
                modules::story::MODULE_NAME,
                ConsoleModuleKind::Optional,
                None,
            ),
        ],
        workload_mode,
    )
}

#[must_use]
pub fn official_host_composition() -> HostComposition {
    HostBuilder::new()
        .linked_module(modules::console_shell::linked_module())
        .linked_module(builtins::auth())
        .linked_module(builtins::auth_password())
        .linked_module(modules::system_registry::linked_module())
        .linked_module(modules::story::linked_module())
        .build()
}

fn module(
    module_id: &str,
    kind: ConsoleModuleKind,
    role: Option<MandatoryConsoleRole>,
) -> ConsoleCompositionModule {
    ConsoleCompositionModule {
        module_id: module_id.to_owned(),
        kind,
        role,
    }
}

fn evaluate_composition(
    modules: Vec<ConsoleCompositionModule>,
    workload_mode: ConsoleRecoveryMode,
) -> ConsoleServiceComposition {
    let mut issues = Vec::new();
    for role in MandatoryConsoleRole::ALL {
        let bindings = modules
            .iter()
            .filter(|module| module.role == Some(role))
            .map(|module| module.module_id.clone())
            .collect::<Vec<_>>();
        match bindings.as_slice() {
            [] => issues.push(issue(
                "mandatory_console_role_missing",
                "Mandatory Console Role has no Module binding",
                "Apply a reviewed Console Composition Change that binds exactly one compatible Module.",
                role,
                bindings,
            )),
            [_] => {}
            _ => issues.push(issue(
                "mandatory_console_role_ambiguous",
                "Mandatory Console Role has more than one Module binding",
                "Apply a reviewed Console Composition Change that retains exactly one compatible Module.",
                role,
                bindings,
            )),
        }
    }

    ConsoleServiceComposition {
        schema: COMPOSITION_SCHEMA.to_owned(),
        service_id: CONSOLE_SERVICE_ID.to_owned(),
        workload_mode,
        status: if issues.is_empty() {
            ConsoleCompositionStatus::Ready
        } else {
            ConsoleCompositionStatus::RecoveryRequired
        },
        modules,
        issues,
    }
}

fn issue(
    code: &str,
    message: &str,
    next_action: &str,
    role: MandatoryConsoleRole,
    module_ids: Vec<String>,
) -> ConsoleCompositionIssue {
    ConsoleCompositionIssue {
        code: code.to_owned(),
        message: message.to_owned(),
        next_action: next_action.to_owned(),
        role,
        module_ids,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn official_composition_binds_each_mandatory_role_once() {
        let composition = official_composition(ConsoleRecoveryMode::Normal);

        assert_eq!(composition.schema, COMPOSITION_SCHEMA);
        assert_eq!(composition.service_id, CONSOLE_SERVICE_ID);
        assert_eq!(composition.workload_mode, ConsoleRecoveryMode::Normal);
        assert_eq!(composition.status, ConsoleCompositionStatus::Ready);
        assert!(composition.issues.is_empty());
    }

    #[test]
    fn missing_mandatory_role_requires_recovery() {
        let composition = evaluate_composition(
            vec![module(
                "auth",
                ConsoleModuleKind::Mandatory,
                Some(MandatoryConsoleRole::Identity),
            )],
            ConsoleRecoveryMode::Restore,
        );

        assert_eq!(
            composition.status,
            ConsoleCompositionStatus::RecoveryRequired
        );
        assert_eq!(composition.workload_mode, ConsoleRecoveryMode::Restore);
        assert_eq!(composition.issues.len(), 1);
        assert_eq!(composition.issues[0].code, "mandatory_console_role_missing");
        assert_eq!(
            composition.issues[0].role,
            MandatoryConsoleRole::SystemRegistry
        );
    }

    #[test]
    fn ambiguous_mandatory_role_requires_recovery() {
        let composition = evaluate_composition(
            vec![
                module(
                    "auth",
                    ConsoleModuleKind::Mandatory,
                    Some(MandatoryConsoleRole::Identity),
                ),
                module(
                    "custom-auth",
                    ConsoleModuleKind::Mandatory,
                    Some(MandatoryConsoleRole::Identity),
                ),
                module(
                    "lenso/system-registry",
                    ConsoleModuleKind::Mandatory,
                    Some(MandatoryConsoleRole::SystemRegistry),
                ),
            ],
            ConsoleRecoveryMode::Normal,
        );

        assert_eq!(
            composition.status,
            ConsoleCompositionStatus::RecoveryRequired
        );
        assert_eq!(composition.issues.len(), 1);
        assert_eq!(
            composition.issues[0].code,
            "mandatory_console_role_ambiguous"
        );
        assert_eq!(composition.issues[0].module_ids, ["auth", "custom-auth"]);
    }
}
