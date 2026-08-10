use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use utoipa::ToSchema;

/// The four states exposed by the System Connection contract.  These are
/// deliberately object-level states; the Console does not derive a second
/// readiness, proof, or evidence aggregate.
#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionStatus {
    Connected,
    Unavailable,
    Incompatible,
    Unmanaged,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ModuleDelivery {
    Linked,
    Service,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ModuleRuntimeStatus {
    Active,
    Unavailable,
    Incompatible,
    Unmanaged,
}

#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SystemTopology {
    pub protocol: String,
    pub system_id: String,
    pub services: Vec<SystemTopologyService>,
    pub modules: Vec<SystemTopologyModule>,
    pub adapters: Vec<SystemTopologyAdapter>,
}

#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SystemTopologyService {
    pub service_id: String,
    pub service_principal: String,
    pub revision: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SystemTopologyModule {
    pub module_id: String,
    pub delivery: ModuleDelivery,
    pub service_id: Option<String>,
    pub module_release_digest: String,
    pub console_ui_artifact_digest: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub surface_api_grant: Option<SurfaceApiGrant>,
    pub runtime_status: Option<ModuleRuntimeStatus>,
}

#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SurfaceApiGrant {
    pub artifact_digest: String,
    pub module_release_digest: String,
    pub contract_digest: String,
    pub operation_ids: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SystemTopologyAdapter {
    pub adapter_id: String,
    pub capabilities: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ManagementPolicy {
    pub policy_id: String,
    pub revision: u64,
    pub digest: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ManagementBinding {
    pub system_id: String,
    pub topology_digest: String,
    pub service_ids: Vec<String>,
    pub adapter_ids: Vec<String>,
    pub permissions: Vec<String>,
    pub policy: ManagementPolicy,
}

#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SystemConnectRequest {
    pub system_id: String,
    pub topology_digest: String,
    pub topology: SystemTopology,
    pub management_binding: ManagementBinding,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SystemConnectionResponse {
    pub system_id: String,
    pub topology_digest: String,
    pub status: ConnectionStatus,
    pub reason: Option<String>,
    pub management_binding: ManagementBinding,
    pub services: Vec<SystemConnectionService>,
    pub modules: Vec<SystemConnectionModule>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SystemConnectionService {
    pub service_id: String,
    pub service_principal: String,
    pub status: ConnectionStatus,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SystemConnectionModule {
    pub module_id: String,
    pub delivery: ModuleDelivery,
    pub service_id: Option<String>,
    pub module_release_digest: String,
    pub console_ui_artifact_digest: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub surface_api_grant: Option<SurfaceApiGrant>,
    pub status: ConnectionStatus,
    pub reason: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ManagedServiceObservation {
    pub service_id: String,
    pub service_principal: String,
    pub enrollment_state: String,
    pub connection_state: String,
    pub last_error_code: Option<String>,
}

pub fn validate_connect_request(request: &SystemConnectRequest) -> Result<(), Vec<String>> {
    let mut errors = Vec::new();
    if request.system_id.trim().is_empty() {
        errors.push("systemId must not be empty".to_owned());
    }
    if request.topology.protocol != "lenso.system.v2" {
        errors.push("topology.protocol must be lenso.system.v2".to_owned());
    }
    if request.topology.system_id != request.system_id {
        errors.push("topology.systemId must match systemId".to_owned());
    }
    if !valid_digest(&request.topology_digest) {
        errors.push("topologyDigest must be a sha256 digest".to_owned());
    } else if calculate_topology_digest(&request.topology).ok().as_deref()
        != Some(request.topology_digest.as_str())
    {
        errors.push("topologyDigest does not match the supplied topology".to_owned());
    }
    if request.management_binding.system_id != request.system_id {
        errors.push("managementBinding.systemId must match systemId".to_owned());
    }
    if request.management_binding.topology_digest != request.topology_digest {
        errors.push("managementBinding.topologyDigest must match topologyDigest".to_owned());
    }
    validate_services(&request.topology.services, &mut errors);
    validate_modules(&request.topology, &mut errors);
    validate_adapters(&request.topology.adapters, &mut errors);
    validate_binding(&request.topology, &request.management_binding, &mut errors);
    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors)
    }
}

pub fn calculate_topology_digest(topology: &SystemTopology) -> Result<String, serde_json::Error> {
    let mut canonical = topology.clone();
    canonical
        .services
        .sort_by(|left, right| left.service_id.cmp(&right.service_id));
    canonical
        .modules
        .sort_by(|left, right| left.module_id.cmp(&right.module_id));
    canonical
        .adapters
        .sort_by(|left, right| left.adapter_id.cmp(&right.adapter_id));
    for adapter in &mut canonical.adapters {
        adapter.capabilities.sort();
    }
    let bytes = serde_json::to_vec(&canonical)?;
    let digest = Sha256::digest(bytes);
    let mut hex = String::with_capacity(digest.len() * 2);
    for byte in digest {
        use std::fmt::Write;
        let _ = write!(hex, "{byte:02x}");
    }
    Ok(format!("sha256:{hex}"))
}

pub fn project_connection(
    topology: &SystemTopology,
    management_binding: &ManagementBinding,
    observations: &[ManagedServiceObservation],
) -> SystemConnectionResponse {
    let mut services = topology
        .services
        .iter()
        .map(|service| project_service(service, observations))
        .collect::<Vec<_>>();
    let bound_ids = topology
        .services
        .iter()
        .map(|service| service.service_id.as_str())
        .collect::<std::collections::BTreeSet<_>>();
    let mut unexpected = observations
        .iter()
        .filter(|observation| !bound_ids.contains(observation.service_id.as_str()))
        .map(|observation| SystemConnectionService {
            service_id: observation.service_id.clone(),
            service_principal: observation.service_principal.clone(),
            status: ConnectionStatus::Unmanaged,
            reason: Some("Enrolled Service is not part of this Management Binding".to_owned()),
        })
        .collect::<Vec<_>>();
    unexpected.sort_by(|left, right| left.service_id.cmp(&right.service_id));
    services.extend(unexpected);

    let modules = topology
        .modules
        .iter()
        .map(|module| project_module(module, &services))
        .collect::<Vec<_>>();
    let status = aggregate_status(
        services
            .iter()
            .map(|service| service.status)
            .chain(modules.iter().map(|module| module.status)),
    );
    let reason = status_reason(status, &services, &modules);
    SystemConnectionResponse {
        system_id: topology.system_id.clone(),
        topology_digest: management_binding.topology_digest.clone(),
        status,
        reason,
        management_binding: management_binding.clone(),
        services,
        modules,
    }
}

fn validate_services(services: &[SystemTopologyService], errors: &mut Vec<String>) {
    let mut ids = std::collections::BTreeSet::new();
    for service in services {
        if service.service_id.trim().is_empty() {
            errors.push("topology.services.serviceId must not be empty".to_owned());
        } else if !ids.insert(service.service_id.as_str()) {
            errors.push(format!(
                "topology.services contains duplicate {}",
                service.service_id
            ));
        }
        if service.service_principal.trim().is_empty() {
            errors.push(format!(
                "service {} has an empty principal",
                service.service_id
            ));
        }
        if service.revision == 0 {
            errors.push(format!(
                "service {} revision must be positive",
                service.service_id
            ));
        }
    }
}

fn validate_modules(topology: &SystemTopology, errors: &mut Vec<String>) {
    let service_ids = topology
        .services
        .iter()
        .map(|service| service.service_id.as_str())
        .collect::<std::collections::BTreeSet<_>>();
    let mut module_ids = std::collections::BTreeSet::new();
    for module in &topology.modules {
        if module.module_id.trim().is_empty() {
            errors.push("topology.modules.moduleId must not be empty".to_owned());
        } else if !module_ids.insert(module.module_id.as_str()) {
            errors.push(format!(
                "topology.modules contains duplicate {}",
                module.module_id
            ));
        }
        if !valid_digest(&module.module_release_digest) {
            errors.push(format!(
                "module {} has an invalid release digest",
                module.module_id
            ));
        }
        if module
            .console_ui_artifact_digest
            .as_deref()
            .is_some_and(|digest| !valid_digest(digest))
        {
            errors.push(format!(
                "module {} has an invalid Console UI digest",
                module.module_id
            ));
        }
        if let Some(grant) = &module.surface_api_grant {
            if !valid_digest(&grant.artifact_digest) {
                errors.push(format!(
                    "module {} has an invalid Surface API artifact digest",
                    module.module_id
                ));
            }
            if !valid_digest(&grant.contract_digest) {
                errors.push(format!(
                    "module {} has an invalid Surface API contract digest",
                    module.module_id
                ));
            }
            if !valid_digest(&grant.module_release_digest) {
                errors.push(format!(
                    "module {} has an invalid Surface API release digest",
                    module.module_id
                ));
            }
            if grant.operation_ids.is_empty()
                || grant
                    .operation_ids
                    .iter()
                    .any(|operation| operation.trim().is_empty())
            {
                errors.push(format!(
                    "module {} has an empty Surface API operation grant",
                    module.module_id
                ));
            }
            if grant.operation_ids.windows(2).any(|ids| ids[0] >= ids[1]) {
                errors.push(format!(
                    "module {} Surface API operation grant must be sorted and unique",
                    module.module_id
                ));
            }
            if module.console_ui_artifact_digest.as_deref() != Some(grant.artifact_digest.as_str())
            {
                errors.push(format!(
                    "module {} Surface API artifact digest must match the Console UI artifact digest",
                    module.module_id
                ));
            }
            if module.module_release_digest != grant.module_release_digest {
                errors.push(format!(
                    "module {} Surface API release digest must match the Module release digest",
                    module.module_id
                ));
            }
        }
        match module.delivery {
            ModuleDelivery::Linked if module.service_id.is_some() => errors.push(format!(
                "linked module {} must not reference a Service",
                module.module_id
            )),
            ModuleDelivery::Service => match module.service_id.as_deref() {
                None => errors.push(format!(
                    "service-backed module {} must reference a Service",
                    module.module_id
                )),
                Some(service_id) if !service_ids.contains(service_id) => errors.push(format!(
                    "module {} references unknown Service {}",
                    module.module_id, service_id
                )),
                Some(_) => {}
            },
            ModuleDelivery::Linked => {}
        }
    }
}

fn validate_adapters(adapters: &[SystemTopologyAdapter], errors: &mut Vec<String>) {
    let mut ids = std::collections::BTreeSet::new();
    for adapter in adapters {
        if adapter.adapter_id.trim().is_empty() {
            errors.push("topology.adapters.adapterId must not be empty".to_owned());
        } else if !ids.insert(adapter.adapter_id.as_str()) {
            errors.push(format!(
                "topology.adapters contains duplicate {}",
                adapter.adapter_id
            ));
        }
        if adapter
            .capabilities
            .iter()
            .any(|capability| capability.trim().is_empty())
        {
            errors.push(format!(
                "adapter {} has an empty capability",
                adapter.adapter_id
            ));
        }
    }
}

fn validate_binding(
    topology: &SystemTopology,
    binding: &ManagementBinding,
    errors: &mut Vec<String>,
) {
    let mut service_ids = binding.service_ids.clone();
    service_ids.sort();
    if service_ids.windows(2).any(|ids| ids[0] == ids[1]) {
        errors.push("managementBinding.serviceIds must not contain duplicates".to_owned());
    }
    service_ids.dedup();
    let mut expected_service_ids = topology
        .services
        .iter()
        .map(|service| service.service_id.clone())
        .collect::<Vec<_>>();
    expected_service_ids.sort();
    if service_ids != expected_service_ids {
        errors.push("managementBinding.serviceIds must match topology.services".to_owned());
    }
    let mut adapter_ids = binding.adapter_ids.clone();
    adapter_ids.sort();
    if adapter_ids.windows(2).any(|ids| ids[0] == ids[1]) {
        errors.push("managementBinding.adapterIds must not contain duplicates".to_owned());
    }
    adapter_ids.dedup();
    let mut expected_adapter_ids = topology
        .adapters
        .iter()
        .map(|adapter| adapter.adapter_id.clone())
        .collect::<Vec<_>>();
    expected_adapter_ids.sort();
    if adapter_ids != expected_adapter_ids {
        errors.push("managementBinding.adapterIds must match topology.adapters".to_owned());
    }
    if binding.permissions.is_empty()
        || binding
            .permissions
            .iter()
            .any(|permission| permission.trim().is_empty())
    {
        errors.push("managementBinding.permissions must contain non-empty permissions".to_owned());
    }
    let mut permissions = binding.permissions.clone();
    permissions.sort();
    permissions.dedup();
    if permissions.len() != binding.permissions.len() {
        errors.push("managementBinding.permissions must not contain duplicates".to_owned());
    }
    if binding.policy.policy_id.trim().is_empty() || binding.policy.revision == 0 {
        errors.push("managementBinding.policy identity and revision are required".to_owned());
    }
    if !valid_digest(&binding.policy.digest) {
        errors.push("managementBinding.policy.digest must be a sha256 digest".to_owned());
    }
}

fn project_service(
    topology_service: &SystemTopologyService,
    observations: &[ManagedServiceObservation],
) -> SystemConnectionService {
    let Some(observation) = observations
        .iter()
        .find(|observation| observation.service_id == topology_service.service_id)
    else {
        return SystemConnectionService {
            service_id: topology_service.service_id.clone(),
            service_principal: topology_service.service_principal.clone(),
            status: ConnectionStatus::Unmanaged,
            reason: Some("System Service is not enrolled in the Console".to_owned()),
        };
    };
    if observation.service_principal != topology_service.service_principal {
        return connection_service(
            topology_service,
            ConnectionStatus::Incompatible,
            "Enrolled Service principal does not match the System topology",
        );
    }
    let (status, fallback_reason) = match (
        observation.enrollment_state.as_str(),
        observation.connection_state.as_str(),
    ) {
        ("revoked", _) => (
            ConnectionStatus::Unavailable,
            "Service enrollment is revoked",
        ),
        ("active", "ready") => (ConnectionStatus::Connected, ""),
        ("active", "incompatible") => (
            ConnectionStatus::Incompatible,
            "Service connection is incompatible",
        ),
        ("active", _) => (ConnectionStatus::Unavailable, "Service is unavailable"),
        _ => (
            ConnectionStatus::Incompatible,
            "Service enrollment state is invalid",
        ),
    };
    let reason = if status == ConnectionStatus::Connected {
        None
    } else {
        observation
            .last_error_code
            .as_deref()
            .filter(|error| !error.trim().is_empty())
            .map(str::to_owned)
            .or_else(|| Some(fallback_reason.to_owned()))
    };
    SystemConnectionService {
        service_id: topology_service.service_id.clone(),
        service_principal: topology_service.service_principal.clone(),
        status,
        reason,
    }
}

fn connection_service(
    service: &SystemTopologyService,
    status: ConnectionStatus,
    reason: &str,
) -> SystemConnectionService {
    SystemConnectionService {
        service_id: service.service_id.clone(),
        service_principal: service.service_principal.clone(),
        status,
        reason: Some(reason.to_owned()),
    }
}

fn project_module(
    module: &SystemTopologyModule,
    services: &[SystemConnectionService],
) -> SystemConnectionModule {
    let mut status = match module.runtime_status {
        Some(ModuleRuntimeStatus::Unavailable) => ConnectionStatus::Unavailable,
        Some(ModuleRuntimeStatus::Incompatible) => ConnectionStatus::Incompatible,
        Some(ModuleRuntimeStatus::Unmanaged) => ConnectionStatus::Unmanaged,
        Some(ModuleRuntimeStatus::Active) | None => ConnectionStatus::Connected,
    };
    let mut reason = match module.runtime_status {
        Some(ModuleRuntimeStatus::Unavailable) => Some("Module workload is unavailable".to_owned()),
        Some(ModuleRuntimeStatus::Incompatible) => {
            Some("Module workload is incompatible with the System topology".to_owned())
        }
        Some(ModuleRuntimeStatus::Unmanaged) => {
            Some("Module workload is not managed by this binding".to_owned())
        }
        Some(ModuleRuntimeStatus::Active) | None => None,
    };
    if let Some(service_id) = module.service_id.as_deref() {
        if let Some(service) = services
            .iter()
            .find(|service| service.service_id == service_id)
        {
            match service.status {
                ConnectionStatus::Connected => {}
                other => {
                    status = other;
                    reason.clone_from(&service.reason);
                }
            }
        } else {
            status = ConnectionStatus::Unmanaged;
            reason = Some("Module references a Service outside this binding".to_owned());
        }
    }
    SystemConnectionModule {
        module_id: module.module_id.clone(),
        delivery: module.delivery,
        service_id: module.service_id.clone(),
        module_release_digest: module.module_release_digest.clone(),
        console_ui_artifact_digest: module.console_ui_artifact_digest.clone(),
        surface_api_grant: module.surface_api_grant.clone(),
        status,
        reason,
    }
}

fn aggregate_status<I>(statuses: I) -> ConnectionStatus
where
    I: IntoIterator<Item = ConnectionStatus>,
{
    let mut status = ConnectionStatus::Connected;
    for candidate in statuses {
        status = match (status, candidate) {
            (ConnectionStatus::Incompatible, _) | (_, ConnectionStatus::Incompatible) => {
                ConnectionStatus::Incompatible
            }
            (ConnectionStatus::Unavailable, _) | (_, ConnectionStatus::Unavailable) => {
                ConnectionStatus::Unavailable
            }
            (ConnectionStatus::Unmanaged, _) | (_, ConnectionStatus::Unmanaged) => {
                ConnectionStatus::Unmanaged
            }
            _ => ConnectionStatus::Connected,
        };
    }
    status
}

fn status_reason(
    status: ConnectionStatus,
    services: &[SystemConnectionService],
    modules: &[SystemConnectionModule],
) -> Option<String> {
    if status == ConnectionStatus::Connected {
        return None;
    }
    services
        .iter()
        .find_map(|service| service.reason.clone())
        .or_else(|| modules.iter().find_map(|module| module.reason.clone()))
}

pub fn valid_digest(value: &str) -> bool {
    let Some(hex) = value.strip_prefix("sha256:") else {
        return false;
    };
    hex.len() == 64 && hex.bytes().all(|byte| byte.is_ascii_hexdigit())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn digest() -> String {
        format!("sha256:{}", "a".repeat(64))
    }

    fn topology() -> SystemTopology {
        SystemTopology {
            protocol: "lenso.system.v2".to_owned(),
            system_id: "support-desk".to_owned(),
            services: vec![SystemTopologyService {
                service_id: "support-service".to_owned(),
                service_principal: "svc.support-service".to_owned(),
                revision: 1,
            }],
            modules: vec![SystemTopologyModule {
                module_id: "support/tickets".to_owned(),
                delivery: ModuleDelivery::Service,
                service_id: Some("support-service".to_owned()),
                module_release_digest: digest(),
                console_ui_artifact_digest: Some(digest()),
                surface_api_grant: Some(SurfaceApiGrant {
                    artifact_digest: digest(),
                    contract_digest: digest(),
                    module_release_digest: digest(),
                    operation_ids: vec![
                        "support-ticket/http/GET:/tickets".to_owned(),
                        "support-ticket/http/PATCH:/tickets/{id}".to_owned(),
                        "support-ticket/http/POST:/tickets".to_owned(),
                        "support-ticket/http/POST:/tickets/{id}/close".to_owned(),
                    ],
                }),
                runtime_status: Some(ModuleRuntimeStatus::Active),
            }],
            adapters: vec![SystemTopologyAdapter {
                adapter_id: "support-workload".to_owned(),
                capabilities: vec!["module.business_api".to_owned()],
            }],
        }
    }

    fn request(topology: SystemTopology) -> SystemConnectRequest {
        let topology_digest = calculate_topology_digest(&topology).expect("digest");
        SystemConnectRequest {
            system_id: topology.system_id.clone(),
            topology_digest: topology_digest.clone(),
            topology,
            management_binding: ManagementBinding {
                system_id: "support-desk".to_owned(),
                topology_digest,
                service_ids: vec!["support-service".to_owned()],
                adapter_ids: vec!["support-workload".to_owned()],
                permissions: vec![
                    "console.module.business.read".to_owned(),
                    "console.module.business.write".to_owned(),
                ],
                policy: ManagementPolicy {
                    policy_id: "support-console".to_owned(),
                    revision: 1,
                    digest: digest(),
                },
            },
        }
    }

    #[test]
    fn validates_an_exact_topology_and_binding() {
        assert!(validate_connect_request(&request(topology())).is_ok());
    }

    #[test]
    fn rejects_a_topology_digest_mismatch() {
        let mut request = request(topology());
        request.topology_digest = digest();
        assert!(
            validate_connect_request(&request)
                .expect_err("mismatch")
                .iter()
                .any(|error| error.contains("topologyDigest"))
        );
    }

    #[test]
    fn rejects_duplicate_binding_references() {
        let mut request = request(topology());
        request
            .management_binding
            .service_ids
            .push("support-service".to_owned());
        assert!(
            validate_connect_request(&request)
                .expect_err("duplicate service")
                .iter()
                .any(|error| error.contains("serviceIds must not contain duplicates"))
        );
    }

    #[test]
    fn rejects_an_unsorted_surface_api_grant() {
        let mut request = request(topology());
        request.topology.modules[0]
            .surface_api_grant
            .as_mut()
            .expect("surface grant")
            .operation_ids
            .reverse();
        let error = validate_connect_request(&request).expect_err("grant order");
        assert!(
            error
                .iter()
                .any(|message| message.contains("Surface API operation grant must be sorted"))
        );
    }

    #[test]
    fn omits_an_absent_surface_grant_from_legacy_topology_serialization() {
        let mut topology = topology();
        topology.modules[0].surface_api_grant = None;
        let value = serde_json::to_value(topology).expect("topology JSON");
        assert!(
            !value["modules"][0]
                .as_object()
                .expect("module object")
                .contains_key("surfaceApiGrant")
        );
    }

    #[test]
    fn projects_unavailable_and_unmanaged_objects_without_adopting_them() {
        let request = request(topology());
        let response = project_connection(
            &request.topology,
            &request.management_binding,
            &[
                ManagedServiceObservation {
                    service_id: "support-service".to_owned(),
                    service_principal: "svc.support-service".to_owned(),
                    enrollment_state: "active".to_owned(),
                    connection_state: "unavailable".to_owned(),
                    last_error_code: Some("endpoint_unreachable".to_owned()),
                },
                ManagedServiceObservation {
                    service_id: "unrelated-service".to_owned(),
                    service_principal: "svc.unrelated-service".to_owned(),
                    enrollment_state: "active".to_owned(),
                    connection_state: "ready".to_owned(),
                    last_error_code: None,
                },
            ],
        );
        assert_eq!(response.status, ConnectionStatus::Unavailable);
        assert_eq!(response.services[0].status, ConnectionStatus::Unavailable);
        assert_eq!(
            response.services[0].reason.as_deref(),
            Some("endpoint_unreachable")
        );
        assert_eq!(response.services[1].status, ConnectionStatus::Unmanaged);
        assert_eq!(response.modules[0].status, ConnectionStatus::Unavailable);
    }
}
