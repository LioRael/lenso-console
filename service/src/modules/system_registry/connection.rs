use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use utoipa::ToSchema;

use super::workload_control::{
    WORKLOAD_CONTROL_PROTOCOL, WorkloadCapability, WorkloadReference, valid_control_scalar,
    valid_path_identity, valid_workload_reference, workload_control_schema_digest,
};

const LOCAL_CONTROL_ADAPTER_SERVICE_ID: &str = "lenso-local-control-adapter";
const LOCAL_CONTROL_ADAPTER_SERVICE_PRINCIPAL: &str = "svc.lenso-local-control-adapter";
const LOCAL_CONTROL_WORKLOAD_PREFIX: &str = "workload-control:";

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
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub workloads: Vec<SystemTopologyWorkload>,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SystemTopologyWorkload {
    pub workload_id: String,
    pub role: String,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workload: Option<WorkloadReference>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workload_control: Option<WorkloadControlAdapterInterface>,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkloadControlAdapterInterface {
    pub protocol: String,
    pub schema_digest: String,
    pub status: ConnectionStatus,
    pub capabilities: Vec<WorkloadCapability>,
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
    pub adapters: Vec<SystemTopologyAdapter>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SystemConnectionService {
    pub service_id: String,
    pub service_principal: String,
    pub status: ConnectionStatus,
    pub reason: Option<String>,
    pub workloads: Vec<SystemTopologyWorkload>,
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
    if !valid_path_identity(&request.system_id) {
        errors.push("systemId must be a stable Workload Control identity".to_owned());
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
    validate_adapters(&request.topology, &mut errors);
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
    for service in &mut canonical.services {
        service
            .workloads
            .sort_by(|left, right| left.workload_id.cmp(&right.workload_id));
    }
    canonical
        .modules
        .sort_by(|left, right| left.module_id.cmp(&right.module_id));
    canonical
        .adapters
        .sort_by(|left, right| left.adapter_id.cmp(&right.adapter_id));
    for adapter in &mut canonical.adapters {
        adapter.capabilities.sort();
        if let Some(interface) = &mut adapter.workload_control {
            interface.capabilities.sort();
        }
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
        .map(|service| {
            control_plane_authority(topology, &service.service_id).map_or_else(
                || project_service(service, observations),
                |interface| project_control_plane_service(service, interface.status),
            )
        })
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
            workloads: Vec::new(),
        })
        .collect::<Vec<_>>();
    unexpected.sort_by(|left, right| left.service_id.cmp(&right.service_id));
    services.extend(unexpected);

    let modules = topology
        .modules
        .iter()
        .map(|module| project_module(module, &services))
        .collect::<Vec<_>>();
    let adapters = topology.adapters.clone();
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
        adapters,
    }
}

pub(super) fn is_control_plane_authority(topology: &SystemTopology, service_id: &str) -> bool {
    control_plane_authority(topology, service_id).is_some()
}

fn control_plane_authority<'a>(
    topology: &'a SystemTopology,
    service_id: &str,
) -> Option<&'a WorkloadControlAdapterInterface> {
    if service_id != LOCAL_CONTROL_ADAPTER_SERVICE_ID
        || topology.modules.iter().any(|module| {
            module.delivery == ModuleDelivery::Service
                && module.service_id.as_deref() == Some(service_id)
        })
    {
        return None;
    }
    let expected_workload_id = format!("{LOCAL_CONTROL_WORKLOAD_PREFIX}{}", topology.system_id);
    let service = topology
        .services
        .iter()
        .find(|service| service.service_id == service_id)?;
    if service.service_principal != LOCAL_CONTROL_ADAPTER_SERVICE_PRINCIPAL
        || service.revision != 1
        || service.workloads.len() != 1
        || service.workloads[0].workload_id != expected_workload_id
        || service.workloads[0].role != "control_adapter"
    {
        return None;
    }
    let mut matches = topology.adapters.iter().filter_map(|adapter| {
        let workload = adapter.workload.as_ref()?;
        let interface = adapter.workload_control.as_ref()?;
        (workload.system_id == topology.system_id
            && workload.service_id == service_id
            && workload.workload_id == expected_workload_id)
            .then_some(interface)
    });
    let interface = matches.next()?;
    (matches.next().is_none()
        && interface.protocol == WORKLOAD_CONTROL_PROTOCOL
        && interface.schema_digest == workload_control_schema_digest())
    .then_some(interface)
}

fn project_control_plane_service(
    service: &SystemTopologyService,
    status: ConnectionStatus,
) -> SystemConnectionService {
    let reason = match status {
        ConnectionStatus::Connected => None,
        ConnectionStatus::Unavailable => {
            Some("Workload Control Adapter authority is unavailable".to_owned())
        }
        ConnectionStatus::Incompatible => {
            Some("Workload Control Adapter authority is incompatible".to_owned())
        }
        ConnectionStatus::Unmanaged => {
            Some("Workload Control Adapter authority is unmanaged".to_owned())
        }
    };
    SystemConnectionService {
        service_id: service.service_id.clone(),
        service_principal: service.service_principal.clone(),
        status,
        reason,
        workloads: service.workloads.clone(),
    }
}

fn validate_services(services: &[SystemTopologyService], errors: &mut Vec<String>) {
    let mut ids = std::collections::BTreeSet::new();
    for service in services {
        if !valid_path_identity(&service.service_id) {
            errors.push(
                "topology.services.serviceId must be a stable Workload Control identity".to_owned(),
            );
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
        let mut workload_ids = std::collections::BTreeSet::new();
        for workload in &service.workloads {
            if !valid_path_identity(&workload.workload_id) {
                errors.push(format!(
                    "service {} has an invalid stable Workload id",
                    service.service_id
                ));
            } else if !workload_ids.insert(workload.workload_id.as_str()) {
                errors.push(format!(
                    "service {} contains duplicate Workload {}",
                    service.service_id, workload.workload_id
                ));
            }
            if workload.role.trim().is_empty() {
                errors.push(format!(
                    "service {} Workload {} has an empty role",
                    service.service_id, workload.workload_id
                ));
            }
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

fn validate_adapters(topology: &SystemTopology, errors: &mut Vec<String>) {
    let mut ids = std::collections::BTreeSet::new();
    for adapter in &topology.adapters {
        if !valid_control_scalar(&adapter.adapter_id) {
            errors.push(
                "topology.adapters.adapterId must be a stable Workload Control identity".to_owned(),
            );
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
        if let Some(workload) = &adapter.workload {
            let exists = workload.system_id == topology.system_id
                && topology.services.iter().any(|service| {
                    service.service_id == workload.service_id
                        && service
                            .workloads
                            .iter()
                            .any(|candidate| candidate.workload_id == workload.workload_id)
                });
            if !valid_workload_reference(workload) || !exists {
                errors.push(format!(
                    "adapter {} must reference an exact stable authority Workload",
                    adapter.adapter_id
                ));
            }
        }
        if let Some(interface) = &adapter.workload_control
            && (interface.protocol != WORKLOAD_CONTROL_PROTOCOL
                || interface.schema_digest != workload_control_schema_digest())
        {
            errors.push(format!(
                "adapter {} Workload Control interface is incompatible",
                adapter.adapter_id
            ));
        }
        if adapter.workload_control.is_some() && adapter.workload.is_none() {
            errors.push(format!(
                "adapter {} Workload Control interface requires an exact authority Workload",
                adapter.adapter_id
            ));
        }
        if let Some(interface) = &adapter.workload_control {
            let unique = interface
                .capabilities
                .iter()
                .copied()
                .collect::<std::collections::BTreeSet<_>>();
            if unique.len() != interface.capabilities.len() {
                errors.push(format!(
                    "adapter {} Workload Control capabilities must be exact",
                    adapter.adapter_id
                ));
            }
            if !unique.contains(&WorkloadCapability::Suspend)
                || !unique.contains(&WorkloadCapability::Resume)
            {
                errors.push(format!(
                    "adapter {} Workload Control capabilities must include suspend and resume",
                    adapter.adapter_id
                ));
            }
        }
    }
    if topology
        .adapters
        .iter()
        .filter(|adapter| adapter.workload_control.is_some())
        .count()
        > 1
    {
        errors.push(
            "topology must declare at most one active Workload Control Adapter interface"
                .to_owned(),
        );
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
            workloads: topology_service.workloads.clone(),
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
        workloads: topology_service.workloads.clone(),
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
        workloads: service.workloads.clone(),
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
                workloads: vec![
                    SystemTopologyWorkload {
                        workload_id: "support-api".to_owned(),
                        role: "api".to_owned(),
                    },
                    SystemTopologyWorkload {
                        workload_id: "support-control-adapter".to_owned(),
                        role: "control_adapter".to_owned(),
                    },
                ],
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
                workload: Some(WorkloadReference {
                    system_id: "support-desk".to_owned(),
                    service_id: "support-service".to_owned(),
                    workload_id: "support-control-adapter".to_owned(),
                }),
                workload_control: Some(WorkloadControlAdapterInterface {
                    protocol: WORKLOAD_CONTROL_PROTOCOL.to_owned(),
                    schema_digest: workload_control_schema_digest(),
                    status: ConnectionStatus::Connected,
                    capabilities: vec![WorkloadCapability::Suspend, WorkloadCapability::Resume],
                }),
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
    fn topology_digest_canonicalizes_workload_control_capabilities() {
        let mut reordered = topology();
        reordered.adapters[0]
            .workload_control
            .as_mut()
            .expect("typed Workload Control interface")
            .capabilities
            .reverse();

        assert_eq!(
            calculate_topology_digest(&topology()).expect("canonical digest"),
            calculate_topology_digest(&reordered).expect("reordered canonical digest")
        );
    }

    #[test]
    fn workload_control_requires_the_standard_suspend_and_resume_capabilities() {
        for capabilities in [
            vec![WorkloadCapability::Suspend],
            vec![WorkloadCapability::Resume],
            vec![WorkloadCapability::Restart, WorkloadCapability::Scale],
        ] {
            let mut candidate = topology();
            candidate.adapters[0]
                .workload_control
                .as_mut()
                .expect("typed Workload Control interface")
                .capabilities = capabilities;
            assert!(
                validate_connect_request(&request(candidate))
                    .expect_err("missing standard control capability")
                    .iter()
                    .any(|error| error.contains("must include suspend and resume"))
            );
        }
    }

    #[test]
    fn topology_digest_canonicalizes_stable_workloads() {
        let mut declared = topology();
        declared.services[0].workloads.push(SystemTopologyWorkload {
            workload_id: "support-worker".to_owned(),
            role: "worker".to_owned(),
        });
        let mut reordered = declared.clone();
        reordered.services[0].workloads.reverse();

        assert_eq!(
            calculate_topology_digest(&declared).expect("canonical digest"),
            calculate_topology_digest(&reordered).expect("reordered canonical digest")
        );
    }

    #[test]
    fn rejects_an_incompatible_workload_control_interface_once() {
        let mut topology = topology();
        topology.adapters[0]
            .workload_control
            .as_mut()
            .expect("typed Workload Control interface")
            .schema_digest = format!("sha256:{}", "f".repeat(64));

        let errors = validate_connect_request(&request(topology)).expect_err("digest mismatch");
        assert_eq!(
            errors
                .iter()
                .filter(|error| error.contains("Workload Control interface is incompatible"))
                .count(),
            1
        );
    }

    #[test]
    fn rejects_ambiguous_workload_control_authority_at_connect_time() {
        let mut topology = topology();
        let mut second = topology.adapters[0].clone();
        second.adapter_id = "secondary-workload-control".to_owned();
        topology.adapters.push(second);
        let mut request = request(topology);
        request
            .management_binding
            .adapter_ids
            .push("secondary-workload-control".to_owned());

        let errors = validate_connect_request(&request).expect_err("ambiguous authority");

        assert!(
            errors
                .iter()
                .any(|error| error.contains("at most one active"))
        );
    }

    #[test]
    fn rejects_workload_control_without_an_exact_authority_workload() {
        let mut topology = topology();
        topology.adapters[0].workload = None;
        let request = request(topology);

        let errors = validate_connect_request(&request).expect_err("missing authority workload");

        assert!(
            errors
                .iter()
                .any(|error| error.contains("requires an exact authority Workload"))
        );
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
    fn legacy_topology_defaults_to_no_stable_workloads() {
        let legacy = serde_json::json!({
            "protocol": "lenso.system.v2",
            "systemId": "support-desk",
            "services": [{
                "serviceId": "support-service",
                "servicePrincipal": "svc.support-service",
                "revision": 1
            }],
            "modules": [],
            "adapters": []
        });

        let topology: SystemTopology = serde_json::from_value(legacy).expect("legacy topology");
        assert!(topology.services[0].workloads.is_empty());
        let serialized = serde_json::to_value(topology).expect("legacy topology JSON");
        assert!(serialized["services"][0].get("workloads").is_none());
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
        let workload_control = response.adapters[0]
            .workload_control
            .as_ref()
            .expect("typed adapter projection");
        assert_eq!(workload_control.protocol, WORKLOAD_CONTROL_PROTOCOL);
        assert_eq!(
            workload_control.schema_digest,
            workload_control_schema_digest()
        );
        assert_eq!(workload_control.status, ConnectionStatus::Connected);
    }

    #[test]
    fn adapter_unavailability_stays_separate_from_system_and_service_status() {
        let mut request = request(topology());
        request.topology.adapters[0]
            .workload_control
            .as_mut()
            .expect("typed Workload Control interface")
            .status = ConnectionStatus::Unavailable;
        let response = project_connection(
            &request.topology,
            &request.management_binding,
            &[ManagedServiceObservation {
                service_id: "support-service".to_owned(),
                service_principal: "svc.support-service".to_owned(),
                enrollment_state: "active".to_owned(),
                connection_state: "ready".to_owned(),
                last_error_code: None,
            }],
        );

        assert_eq!(response.status, ConnectionStatus::Connected);
        assert_eq!(response.services[0].status, ConnectionStatus::Connected);
        assert_eq!(response.reason, None);
        assert_eq!(
            response.adapters[0]
                .workload_control
                .as_ref()
                .expect("typed Workload Control interface")
                .status,
            ConnectionStatus::Unavailable
        );
    }

    #[test]
    fn exact_adapter_workload_projects_its_control_plane_service_without_business_enrollment() {
        let mut request = request(topology());
        request.topology.services.push(SystemTopologyService {
            service_id: "lenso-local-control-adapter".to_owned(),
            service_principal: "svc.lenso-local-control-adapter".to_owned(),
            revision: 1,
            workloads: vec![SystemTopologyWorkload {
                workload_id: "workload-control:support-desk".to_owned(),
                role: "control_adapter".to_owned(),
            }],
        });
        request.topology.adapters[0].workload = Some(WorkloadReference {
            system_id: "support-desk".to_owned(),
            service_id: "lenso-local-control-adapter".to_owned(),
            workload_id: "workload-control:support-desk".to_owned(),
        });
        request.management_binding.service_ids = vec![
            "support-service".to_owned(),
            "lenso-local-control-adapter".to_owned(),
        ];
        request.topology_digest = calculate_topology_digest(&request.topology).expect("digest");
        request.management_binding.topology_digest = request.topology_digest.clone();

        assert!(validate_connect_request(&request).is_ok());
        let response = project_connection(
            &request.topology,
            &request.management_binding,
            &[
                ManagedServiceObservation {
                    service_id: "support-service".to_owned(),
                    service_principal: "svc.support-service".to_owned(),
                    enrollment_state: "active".to_owned(),
                    connection_state: "ready".to_owned(),
                    last_error_code: None,
                },
                ManagedServiceObservation {
                    service_id: "unexpected-service".to_owned(),
                    service_principal: "svc.unexpected-service".to_owned(),
                    enrollment_state: "active".to_owned(),
                    connection_state: "ready".to_owned(),
                    last_error_code: None,
                },
            ],
        );

        assert_eq!(response.status, ConnectionStatus::Unmanaged);
        assert_eq!(response.services[0].status, ConnectionStatus::Connected);
        assert_eq!(response.services[1].status, ConnectionStatus::Connected);
        assert_eq!(response.services[2].status, ConnectionStatus::Unmanaged);
        assert_eq!(
            response.services[1].service_id,
            "lenso-local-control-adapter"
        );
        assert_eq!(response.services[1].reason, None);

        let mut lookalike = request.topology.clone();
        lookalike.services[1].service_id = "lookalike-control-adapter".to_owned();
        lookalike.adapters[0]
            .workload
            .as_mut()
            .expect("adapter workload")
            .service_id = "lookalike-control-adapter".to_owned();
        assert!(!is_control_plane_authority(
            &lookalike,
            "lookalike-control-adapter"
        ));

        for mutate in [
            |topology: &mut SystemTopology| {
                topology.services[1].service_principal =
                    "service:lenso-local-control-adapter".to_owned();
            },
            |topology: &mut SystemTopology| {
                topology.services[1].revision = 2;
            },
            |topology: &mut SystemTopology| {
                topology.services[1].workloads.push(SystemTopologyWorkload {
                    workload_id: "unexpected-workload".to_owned(),
                    role: "control_adapter".to_owned(),
                });
            },
            |topology: &mut SystemTopology| {
                topology.services[1].workloads[0].role = "api".to_owned();
            },
        ] {
            let mut invalid = request.topology.clone();
            mutate(&mut invalid);
            assert!(
                !is_control_plane_authority(&invalid, "lenso-local-control-adapter"),
                "Local Adapter enrollment exemption must require the exact pinned identity"
            );
        }

        let mut duplicate_interface = request.topology.clone();
        duplicate_interface
            .adapters
            .push(duplicate_interface.adapters[0].clone());
        duplicate_interface.adapters[1].adapter_id = "second-local-control".to_owned();
        assert!(!is_control_plane_authority(
            &duplicate_interface,
            "lenso-local-control-adapter"
        ));
    }
}
