use lenso::host::http::{AppContext, AppError, ErrorCode};
use lenso::host::prelude::*;
use lenso::host::{ConsoleBridgeAuthority, ConsoleBridgeGrantRequest};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::sync::Arc;
use utoipa::ToSchema;

use crate::ConsoleRecoveryMode;
use crate::modules;

pub const COMPOSITION_SCHEMA: &str = "lenso.console-service-composition.v2";
pub const CONSOLE_SERVICE_ID: &str = "lenso-console";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum MandatoryConsoleRole {
    Identity,
    SystemRegistry,
}

impl MandatoryConsoleRole {
    const ALL: [Self; 2] = [Self::Identity, Self::SystemRegistry];
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ConsoleCompositionStatus {
    Ready,
    RecoveryRequired,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ConsoleModuleKind {
    Shell,
    Mandatory,
    Optional,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConsoleUiEntry {
    pub name: String,
    pub label: String,
    pub route: String,
    pub path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConsoleCompositionModule {
    pub module_id: String,
    pub kind: ConsoleModuleKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<MandatoryConsoleRole>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub module_release_digest: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ui_artifact_digest: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ui_artifact_base_url: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub ui_entries: Vec<ConsoleUiEntry>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub delivery: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub granted_permissions: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConsoleCompositionIssue {
    pub code: String,
    pub message: String,
    pub next_action: String,
    pub role: MandatoryConsoleRole,
    pub module_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConsoleServiceComposition {
    pub schema: String,
    pub service_id: String,
    pub workload_mode: ConsoleRecoveryMode,
    pub status: ConsoleCompositionStatus,
    pub modules: Vec<ConsoleCompositionModule>,
    pub issues: Vec<ConsoleCompositionIssue>,
}

impl ConsoleServiceComposition {
    pub fn validate_stored(&self) -> Result<(), &'static str> {
        if self.schema != COMPOSITION_SCHEMA || self.service_id != CONSOLE_SERVICE_ID {
            return Err("composition identity is invalid");
        }
        if self.status != ConsoleCompositionStatus::Ready || !self.issues.is_empty() {
            return Err("only a ready composition may be active");
        }
        for role in MandatoryConsoleRole::ALL {
            let bindings = self
                .modules
                .iter()
                .filter(|module| module.role == Some(role))
                .collect::<Vec<_>>();
            if bindings.len() != 1 || bindings[0].kind != ConsoleModuleKind::Mandatory {
                return Err("mandatory Console role binding is invalid");
            }
        }
        for module in &self.modules {
            if module.module_id.is_empty() || !module.module_id.contains('/') {
                return Err("Module identity is invalid");
            }
            let Some(release_digest) = module.module_release_digest.as_deref() else {
                return Err("Module Release digest is missing");
            };
            if !valid_sha256(release_digest) {
                return Err("Module Release digest is invalid");
            }
            if let Some(ui_digest) = module.ui_artifact_digest.as_deref()
                && !valid_sha256(ui_digest)
            {
                return Err("Console UI artifact digest is invalid");
            }
            if !module.ui_entries.is_empty()
                && (module.ui_artifact_digest.is_none()
                    || module.ui_artifact_base_url.as_deref().is_none_or(|url| {
                        !(url.starts_with("https://")
                            || url.starts_with("http://localhost")
                            || url.starts_with("http://127.0.0.1"))
                    }))
            {
                return Err("Console UI artifact binding is invalid");
            }
            if module.ui_entries.iter().any(|entry| {
                entry.name.is_empty()
                    || entry.label.is_empty()
                    || entry.route.is_empty()
                    || entry.path.is_empty()
                    || entry.path.starts_with('/')
                    || entry.path.split('/').any(|part| part == "..")
            }) {
                return Err("Console UI entry is invalid");
            }
            if module
                .granted_permissions
                .iter()
                .any(|permission| permission.is_empty())
            {
                return Err("Console permission grant is invalid");
            }
            let entry_names = module
                .ui_entries
                .iter()
                .map(|entry| entry.name.as_str())
                .collect::<BTreeSet<_>>();
            let entry_routes = module
                .ui_entries
                .iter()
                .map(|entry| entry.route.as_str())
                .collect::<BTreeSet<_>>();
            let permissions = module
                .granted_permissions
                .iter()
                .map(String::as_str)
                .collect::<BTreeSet<_>>();
            if entry_names.len() != module.ui_entries.len()
                || entry_routes.len() != module.ui_entries.len()
                || permissions.len() != module.granted_permissions.len()
            {
                return Err("Console Module composition contains duplicate bindings");
            }
        }
        if self
            .modules
            .iter()
            .map(|module| module.module_id.as_str())
            .collect::<BTreeSet<_>>()
            .len()
            != self.modules.len()
        {
            return Err("Console composition contains duplicate Modules");
        }
        Ok(())
    }
}

fn valid_sha256(value: &str) -> bool {
    value.strip_prefix("sha256:").is_some_and(|hex| {
        hex.len() == 64
            && hex
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    })
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
                "lenso/auth",
                ConsoleModuleKind::Mandatory,
                Some(MandatoryConsoleRole::Identity),
            ),
            module("lenso/auth-password", ConsoleModuleKind::Optional, None),
            module(
                modules::system_registry::MODULE_NAME,
                ConsoleModuleKind::Mandatory,
                Some(MandatoryConsoleRole::SystemRegistry),
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
        .console_bridge_authority(Arc::new(ConsoleCompositionAuthority))
        .build()
}

#[derive(Debug)]
struct ConsoleCompositionAuthority;

#[async_trait::async_trait]
impl ConsoleBridgeAuthority for ConsoleCompositionAuthority {
    async fn authorize(
        &self,
        ctx: &AppContext,
        request: &ConsoleBridgeGrantRequest,
    ) -> Result<(), AppError> {
        if crate::recovery_mode().ok() != Some(ConsoleRecoveryMode::Normal) {
            return Err(AppError::new(
                ErrorCode::Forbidden,
                "Console Bridge is disabled outside normal workload mode",
            ));
        }
        let document = sqlx::query_scalar::<_, serde_json::Value>(
            "select document from console.service_composition where singleton = true",
        )
        .fetch_optional(&ctx.db)
        .await
        .map_err(|error| {
            AppError::new(ErrorCode::Internal, "Console composition Store read failed")
                .with_source(error)
        })?
        .ok_or_else(|| {
            AppError::new(
                ErrorCode::Forbidden,
                "Console Bridge requires an active digest-bound composition",
            )
        })?;
        let composition: ConsoleServiceComposition =
            serde_json::from_value(document).map_err(|error| {
                AppError::new(ErrorCode::Internal, "Stored Console composition is invalid")
                    .with_source(error)
            })?;
        authorize_bridge_request(&composition, request)
    }
}

fn authorize_bridge_request(
    composition: &ConsoleServiceComposition,
    request: &ConsoleBridgeGrantRequest,
) -> Result<(), AppError> {
    composition
        .validate_stored()
        .map_err(|message| AppError::new(ErrorCode::Internal, message))?;
    let authorized = composition.modules.iter().any(|module| {
        module.module_id == request.module_id
            && module.module_release_digest.as_deref()
                == Some(request.module_release_digest.as_str())
            && module.ui_artifact_digest.as_deref() == Some(request.ui_artifact_digest.as_str())
            && module
                .granted_permissions
                .iter()
                .any(|permission| permission == &request.permission)
    });
    if authorized {
        Ok(())
    } else {
        Err(AppError::new(
            ErrorCode::Forbidden,
            "Console Bridge grant does not match the active composition",
        ))
    }
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
        module_release_digest: None,
        ui_artifact_digest: None,
        ui_artifact_base_url: None,
        ui_entries: Vec::new(),
        delivery: None,
        granted_permissions: Vec::new(),
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
                    "lenso/auth",
                    ConsoleModuleKind::Mandatory,
                    Some(MandatoryConsoleRole::Identity),
                ),
                module(
                    "vendor/custom-auth",
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
        assert_eq!(
            composition.issues[0].module_ids,
            ["lenso/auth", "vendor/custom-auth"]
        );
    }

    #[test]
    fn bridge_authority_requires_exact_active_release_artifact_and_permission() {
        let mut composition = official_composition(ConsoleRecoveryMode::Normal);
        for module in &mut composition.modules {
            module.module_release_digest = Some(digest('a'));
        }
        let auth = composition
            .modules
            .iter_mut()
            .find(|module| module.module_id == "lenso/auth")
            .expect("auth composition entry");
        auth.ui_artifact_digest = Some(digest('b'));
        auth.ui_artifact_base_url = Some("https://artifacts.example/auth/".to_owned());
        auth.ui_entries.push(ConsoleUiEntry {
            name: "users".to_owned(),
            label: "Users".to_owned(),
            route: "/data/auth/users".to_owned(),
            path: "index.html?surface=users".to_owned(),
            icon: None,
        });
        auth.granted_permissions = vec!["auth.users.manage".to_owned()];
        let request = ConsoleBridgeGrantRequest {
            module_id: "lenso/auth".to_owned(),
            module_release_digest: digest('a'),
            ui_artifact_digest: digest('b'),
            permission: "auth.users.manage".to_owned(),
        };

        assert!(authorize_bridge_request(&composition, &request).is_ok());
        let mut stale = request.clone();
        stale.ui_artifact_digest = digest('c');
        assert!(authorize_bridge_request(&composition, &stale).is_err());
        let mut elevated = request;
        elevated.permission = "console.admin".to_owned();
        assert!(authorize_bridge_request(&composition, &elevated).is_err());
    }

    #[test]
    fn stored_composition_rejects_duplicate_module_and_permission_bindings() {
        let mut composition = official_composition(ConsoleRecoveryMode::Normal);
        for module in &mut composition.modules {
            module.module_release_digest = Some(digest('a'));
        }
        composition.modules.push(composition.modules[0].clone());
        assert_eq!(
            composition.validate_stored(),
            Err("Console composition contains duplicate Modules")
        );

        composition.modules.pop();
        composition.modules[0].granted_permissions =
            vec!["console.read".to_owned(), "console.read".to_owned()];
        assert_eq!(
            composition.validate_stored(),
            Err("Console Module composition contains duplicate bindings")
        );
    }

    fn digest(hex: char) -> String {
        format!("sha256:{}", hex.to_string().repeat(64))
    }
}
