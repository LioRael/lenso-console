use std::{fmt, time::Duration};

use lenso_agent_host::PluginManagementTarget;
use lenso_capability_agent_plugin_management_target as contract;
use lenso_kernel::RuntimeFailure;
use reqwest::{Method, Response, StatusCode, Url};
use serde::{Deserialize, de::DeserializeOwned};

use crate::AppAgentAdapter;

const MAX_RESPONSE_BYTES: usize = 2 * 1024 * 1024;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Clone)]
pub(super) struct AppAgentPluginManagementTarget {
    agents: Vec<AppAgentAdapter>,
}

impl AppAgentPluginManagementTarget {
    pub(super) fn new(agents: Vec<AppAgentAdapter>) -> Self {
        Self { agents }
    }

    fn target<E>(&self, agent_id: &str, missing: E, unsupported: E) -> Result<AppAgentAdapter, E> {
        let Some(agent) = self.agents.iter().find(|agent| agent.id == agent_id) else {
            return Err(missing);
        };
        if !agent.plugin_configuration {
            return Err(unsupported);
        }
        Ok(agent.clone())
    }
}

impl fmt::Debug for AppAgentPluginManagementTarget {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("AppAgentPluginManagementTarget")
            .field(
                "agent_ids",
                &self
                    .agents
                    .iter()
                    .map(|agent| &agent.id)
                    .collect::<Vec<_>>(),
            )
            .finish()
    }
}

impl PluginManagementTarget for AppAgentPluginManagementTarget {
    fn inspect(
        &self,
        request: contract::InspectRequest,
    ) -> lenso_kernel::NativeRequestFuture<contract::PluginManagementTargetInspect> {
        let target = self.target(
            &request.agent_id,
            contract::InspectError::TargetNotFound,
            contract::InspectError::Unsupported,
        );
        Box::pin(async move {
            let agent = match target {
                Ok(agent) => agent,
                Err(error) => return Ok(Err(error)),
            };
            let management: ManagementResponse =
                get_json(&agent, &["control", "plugins"], "inspect").await?;
            validate_management(&management)?;
            Ok(Ok(contract::InspectResponse {
                agent_id: request.agent_id,
                authority: management.configuration_authority.into(),
                binding_count: management.binding_count,
                enabled_instance_count: bounded_count(
                    management
                        .plugins
                        .iter()
                        .flat_map(|plugin| &plugin.instances)
                        .filter(|instance| instance.selection == "enabled")
                        .count(),
                    65_536,
                ),
                plugins: management
                    .plugins
                    .into_iter()
                    .map(|plugin| contract::PluginInspection {
                        instances: plugin
                            .instances
                            .into_iter()
                            .map(|instance| contract::PluginInstanceInspection {
                                disableable: instance.disableable,
                                has_root_difference: instance.has_root_difference,
                                instance_key: instance.instance_key,
                                origin: instance.origin,
                                root_configuration_bytes: instance
                                    .root_configuration_toml
                                    .as_ref()
                                    .map_or(0, |value| bounded_count(value.len(), 262_144)),
                                root_configuration_present: instance
                                    .root_configuration_toml
                                    .is_some(),
                                selection: instance.selection,
                                source_digest: instance.source_digest,
                            })
                            .collect(),
                        package_id: plugin.package_id,
                        package_revision: plugin.package_revision,
                        source: if plugin.root_supplied {
                            "plugin-root".to_owned()
                        } else {
                            "host-build".to_owned()
                        },
                    })
                    .collect(),
                revision: management.revision,
            }))
        })
    }

    fn propose(
        &self,
        request: contract::ProposeRequest,
    ) -> lenso_kernel::NativeRequestFuture<contract::PluginManagementTargetPropose> {
        let target = self.target(
            &request.agent_id,
            contract::ProposeError::TargetNotFound,
            contract::ProposeError::Unsupported,
        );
        Box::pin(async move {
            let agent = match target {
                Ok(agent) => agent,
                Err(error) => return Ok(Err(error)),
            };
            let fence = match configuration_fence(
                &agent,
                &request.plugin_id,
                &request.instance,
                &request.expected_revision,
            )
            .await?
            {
                Ok(fence) => fence,
                Err(error) => return Ok(Err(map_propose_fence(error))),
            };
            let proposal: ProposalResponse = match send_json(
                &agent,
                Method::POST,
                &[
                    "control",
                    "plugins",
                    &request.plugin_id,
                    &request.instance,
                    "configuration",
                    "proposals",
                ],
                serde_json::json!({
                    "expectedRevision": request.expected_revision,
                    "expectedSourceDigest": fence.source_digest,
                    "expectedStreamId": fence.stream_id,
                    "toml": request.configuration_toml,
                }),
                "propose",
            )
            .await
            {
                Ok(value) => value,
                Err(TargetRequestError::Domain(status)) => {
                    return Ok(Err(map_propose_status(status)));
                }
                Err(TargetRequestError::Runtime(error)) => return Err(error),
            };
            validate_proposal(&proposal, &request, &fence)?;
            Ok(Ok(proposal.into_contract(request.agent_id)))
        })
    }

    fn publish(
        &self,
        request: contract::PublishRequest,
    ) -> lenso_kernel::NativeRequestFuture<contract::PluginManagementTargetPublish> {
        let target = self.target(
            &request.agent_id,
            contract::PublishError::TargetNotFound,
            contract::PublishError::Unsupported,
        );
        Box::pin(async move {
            let agent = match target {
                Ok(agent) => agent,
                Err(error) => return Ok(Err(error)),
            };
            let fence = match configuration_fence(
                &agent,
                &request.plugin_id,
                &request.instance,
                &request.expected_revision,
            )
            .await?
            {
                Ok(fence) => fence,
                Err(error) => return Ok(Err(map_publish_fence(error))),
            };
            let publication: PublicationResponse = match send_json(
                &agent,
                Method::PUT,
                &[
                    "control",
                    "plugins",
                    &request.plugin_id,
                    &request.instance,
                    "configuration",
                ],
                serde_json::json!({
                    "expectedRevision": request.expected_revision,
                    "expectedSourceDigest": fence.source_digest,
                    "expectedStreamId": fence.stream_id,
                    "proposalDigest": request.proposal_digest,
                    "toml": request.configuration_toml,
                }),
                "publish",
            )
            .await
            {
                Ok(value) => value,
                Err(TargetRequestError::Domain(status)) => {
                    return Ok(Err(map_publish_status(status)));
                }
                Err(TargetRequestError::Runtime(error)) => return Err(error),
            };
            validate_publication(&publication, &request, &fence)?;
            Ok(Ok(contract::PublishResponse {
                agent_id: request.agent_id,
                authority: publication.configuration_authority.into(),
                base_revision: publication.base_revision,
                base_source_digest: publication.base_source_digest,
                proposal_digest: publication.proposal_digest,
                revision: publication.revision,
                schema: publication.publication_schema,
            }))
        })
    }

    fn set_enabled(
        &self,
        request: contract::SetEnabledRequest,
    ) -> lenso_kernel::NativeRequestFuture<contract::PluginManagementTargetSetEnabled> {
        let target = self.target(
            &request.agent_id,
            contract::SetEnabledError::TargetNotFound,
            contract::SetEnabledError::Unsupported,
        );
        Box::pin(async move {
            let agent = match target {
                Ok(agent) => agent,
                Err(error) => return Ok(Err(error)),
            };
            let management: ManagementResponse =
                get_json(&agent, &["control", "plugins"], "inspect before selection").await?;
            validate_management(&management)?;
            if management.revision != request.expected_revision {
                return Ok(Err(contract::SetEnabledError::Conflict));
            }
            let Some(instance) = management
                .plugins
                .iter()
                .find(|plugin| plugin.package_id == request.plugin_id)
                .and_then(|plugin| {
                    plugin
                        .instances
                        .iter()
                        .find(|instance| instance.instance_key == request.instance)
                })
            else {
                return Ok(Err(contract::SetEnabledError::PluginNotFound));
            };
            if !request.enabled && !instance.disableable {
                return Ok(Err(contract::SetEnabledError::NotDisableable));
            }
            if (instance.selection == "enabled") == request.enabled {
                return Ok(Err(contract::SetEnabledError::AlreadySelected));
            }
            let Some(authority) = management.selection_authority else {
                return Ok(Err(contract::SetEnabledError::Unsupported));
            };
            let inventory: InventoryResponse =
                get_json(&agent, &["plugins"], "read stream").await?;
            validate_inventory(&inventory)?;
            let receipt: MutationResponse = match send_json(
                &agent,
                Method::PUT,
                &[
                    "control",
                    "plugins",
                    &request.plugin_id,
                    &request.instance,
                    "enabled",
                ],
                serde_json::json!({
                    "enabled": request.enabled,
                    "expectedRevision": request.expected_revision,
                    "expectedStreamId": inventory.stream_id,
                }),
                "set enabled",
            )
            .await
            {
                Ok(value) => value,
                Err(TargetRequestError::Domain(status)) => {
                    return Ok(Err(map_selection_status(status)));
                }
                Err(TargetRequestError::Runtime(error)) => return Err(error),
            };
            if receipt.schema != "lenso.agent.plugin-operation.v1"
                || receipt.stream_id != inventory.stream_id
                || receipt.desired.plugin_root_revision.is_empty()
            {
                return Err(protocol_failure(
                    "Agent Host returned an invalid selection receipt",
                ));
            }
            Ok(Ok(contract::SetEnabledResponse {
                agent_id: request.agent_id,
                authority: authority.into(),
                base_revision: request.expected_revision,
                enabled: request.enabled,
                instance: request.instance,
                plugin_id: request.plugin_id,
                revision: receipt.desired.plugin_root_revision,
                schema: "lenso.plugin-selection-publication.v1".to_owned(),
            }))
        })
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AuthorityResponse {
    kind: String,
    reference: String,
}

impl From<AuthorityResponse> for contract::AuthoritySource {
    fn from(value: AuthorityResponse) -> Self {
        Self {
            kind: value.kind,
            reference: value.reference,
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManagementResponse {
    binding_count: i64,
    configuration_authority: AuthorityResponse,
    plugins: Vec<ManagedPlugin>,
    revision: String,
    schema: String,
    selection_authority: Option<AuthorityResponse>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManagedPlugin {
    instances: Vec<ManagedPluginInstance>,
    package_id: String,
    package_revision: String,
    root_supplied: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManagedPluginInstance {
    disableable: bool,
    has_root_difference: bool,
    instance_key: String,
    origin: String,
    root_configuration_toml: Option<String>,
    selection: String,
    source_digest: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct InventoryResponse {
    schema: String,
    stream_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProposalResponse {
    application: String,
    base_revision: String,
    base_source_digest: String,
    candidate_revision: String,
    configuration_authority: AuthorityResponse,
    diagnostics: Vec<ProposalDiagnostic>,
    instance_key: String,
    plugin_id: String,
    proposal_digest: String,
    schema: String,
    status: String,
}

impl ProposalResponse {
    fn into_contract(self, agent_id: String) -> contract::ProposeResponse {
        contract::ProposeResponse {
            agent_id,
            application: self.application,
            authority: self.configuration_authority.into(),
            base_revision: self.base_revision,
            base_source_digest: self.base_source_digest,
            candidate_revision: self.candidate_revision,
            diagnostics: self
                .diagnostics
                .into_iter()
                .map(|diagnostic| contract::ProposalDiagnostic {
                    code: diagnostic.code,
                    detail: diagnostic.detail,
                })
                .collect(),
            instance: self.instance_key,
            plugin_id: self.plugin_id,
            proposal_digest: self.proposal_digest,
            schema: self.schema,
            status: self.status,
        }
    }
}

#[derive(Deserialize)]
struct ProposalDiagnostic {
    code: String,
    detail: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PublicationResponse {
    base_revision: String,
    base_source_digest: String,
    configuration_authority: AuthorityResponse,
    proposal_digest: String,
    publication_schema: String,
    revision: String,
    schema: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MutationResponse {
    desired: DesiredSelection,
    schema: String,
    stream_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesiredSelection {
    plugin_root_revision: String,
}

struct ConfigurationFence {
    source_digest: String,
    stream_id: String,
}

#[derive(Clone, Copy)]
enum FenceError {
    Conflict,
    PluginNotFound,
}

async fn configuration_fence(
    agent: &AppAgentAdapter,
    plugin_id: &str,
    instance: &str,
    expected_revision: &str,
) -> Result<Result<ConfigurationFence, FenceError>, RuntimeFailure> {
    let management: ManagementResponse =
        get_json(agent, &["control", "plugins"], "inspect before change").await?;
    validate_management(&management)?;
    if management.revision != expected_revision {
        return Ok(Err(FenceError::Conflict));
    }
    let Some(source_digest) = management
        .plugins
        .iter()
        .find(|plugin| plugin.package_id == plugin_id)
        .and_then(|plugin| {
            plugin
                .instances
                .iter()
                .find(|candidate| candidate.instance_key == instance)
        })
        .map(|candidate| candidate.source_digest.clone())
    else {
        return Ok(Err(FenceError::PluginNotFound));
    };
    let inventory: InventoryResponse = get_json(agent, &["plugins"], "read stream").await?;
    validate_inventory(&inventory)?;
    Ok(Ok(ConfigurationFence {
        source_digest,
        stream_id: inventory.stream_id,
    }))
}

fn validate_management(value: &ManagementResponse) -> Result<(), RuntimeFailure> {
    if value.schema != "lenso.agent.plugin-management.v1"
        || value.revision.is_empty()
        || value.configuration_authority.kind.is_empty()
        || value.configuration_authority.reference.is_empty()
    {
        return Err(protocol_failure(
            "Agent Host returned invalid Plugin management state",
        ));
    }
    Ok(())
}

fn validate_inventory(value: &InventoryResponse) -> Result<(), RuntimeFailure> {
    if value.schema != "lenso.agent.plugin-inventory.v2" || value.stream_id.is_empty() {
        return Err(protocol_failure(
            "Agent Host returned invalid Plugin inventory state",
        ));
    }
    Ok(())
}

fn validate_proposal(
    value: &ProposalResponse,
    request: &contract::ProposeRequest,
    fence: &ConfigurationFence,
) -> Result<(), RuntimeFailure> {
    if value.schema.is_empty()
        || value.plugin_id != request.plugin_id
        || value.instance_key != request.instance
        || value.base_revision != request.expected_revision
        || value.base_source_digest != fence.source_digest
        || value.proposal_digest.is_empty()
        || value.configuration_authority.kind.is_empty()
        || value.configuration_authority.reference.is_empty()
    {
        return Err(protocol_failure(
            "Agent Host returned an invalid Plugin proposal",
        ));
    }
    Ok(())
}

fn validate_publication(
    value: &PublicationResponse,
    request: &contract::PublishRequest,
    fence: &ConfigurationFence,
) -> Result<(), RuntimeFailure> {
    if value.schema != "lenso.agent.plugin-operation.v1"
        || value.publication_schema != "lenso.plugin-configuration-publication.v1"
        || value.base_revision != request.expected_revision
        || value.base_source_digest != fence.source_digest
        || value.proposal_digest != request.proposal_digest
        || value.revision.is_empty()
        || value.configuration_authority.kind.is_empty()
        || value.configuration_authority.reference.is_empty()
    {
        return Err(protocol_failure(
            "Agent Host returned an invalid Plugin publication",
        ));
    }
    Ok(())
}

async fn get_json<T: DeserializeOwned>(
    agent: &AppAgentAdapter,
    segments: &[&str],
    operation: &str,
) -> Result<T, RuntimeFailure> {
    let url = target_url(agent, segments)?;
    let response = tokio::time::timeout(REQUEST_TIMEOUT, agent.client.get(url).send())
        .await
        .map_err(|_| runtime_failure(format!("App Agent Plugin {operation} timed out")))?
        .map_err(|error| {
            runtime_failure(format!("App Agent Plugin {operation} failed: {error}"))
        })?;
    decode_success(response, operation).await
}

async fn send_json<T: DeserializeOwned>(
    agent: &AppAgentAdapter,
    method: Method,
    segments: &[&str],
    body: serde_json::Value,
    operation: &str,
) -> Result<T, TargetRequestError> {
    let url = target_url(agent, segments).map_err(TargetRequestError::Runtime)?;
    let response = tokio::time::timeout(
        REQUEST_TIMEOUT,
        agent.client.request(method, url).json(&body).send(),
    )
    .await
    .map_err(|_| {
        TargetRequestError::Runtime(runtime_failure(format!(
            "App Agent Plugin {operation} timed out"
        )))
    })?
    .map_err(|error| {
        TargetRequestError::Runtime(runtime_failure(format!(
            "App Agent Plugin {operation} failed: {error}"
        )))
    })?;
    if !response.status().is_success() {
        let status = response.status();
        return if status.is_server_error() {
            Err(TargetRequestError::Runtime(runtime_failure(format!(
                "App Agent Plugin {operation} failed with {status}"
            ))))
        } else {
            Err(TargetRequestError::Domain(status))
        };
    }
    decode_success(response, operation)
        .await
        .map_err(TargetRequestError::Runtime)
}

async fn decode_success<T: DeserializeOwned>(
    mut response: Response,
    operation: &str,
) -> Result<T, RuntimeFailure> {
    if !response.status().is_success() {
        return Err(runtime_failure(format!(
            "App Agent Plugin {operation} failed with {}",
            response.status()
        )));
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|error| {
        runtime_failure(format!(
            "App Agent Plugin {operation} response failed: {error}"
        ))
    })? {
        if body.len().saturating_add(chunk.len()) > MAX_RESPONSE_BYTES {
            return Err(runtime_failure(format!(
                "App Agent Plugin {operation} response exceeded 2 MiB"
            )));
        }
        body.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&body).map_err(|error| {
        protocol_failure(format!(
            "App Agent Plugin {operation} response was invalid: {error}"
        ))
    })
}

fn target_url(agent: &AppAgentAdapter, segments: &[&str]) -> Result<Url, RuntimeFailure> {
    let mut url = agent.origin.clone();
    url.path_segments_mut()
        .map_err(|()| protocol_failure("App Agent origin cannot be a URL base"))?
        .pop_if_empty()
        .extend(["api", "console", "v1", "agent"])
        .extend(segments.iter().copied());
    Ok(url)
}

enum TargetRequestError {
    Domain(StatusCode),
    Runtime(RuntimeFailure),
}

fn map_propose_fence(error: FenceError) -> contract::ProposeError {
    match error {
        FenceError::Conflict => contract::ProposeError::Conflict,
        FenceError::PluginNotFound => contract::ProposeError::PluginNotFound,
    }
}

fn map_publish_fence(error: FenceError) -> contract::PublishError {
    match error {
        FenceError::Conflict => contract::PublishError::Conflict,
        FenceError::PluginNotFound => contract::PublishError::PluginNotFound,
    }
}

fn map_propose_status(status: StatusCode) -> contract::ProposeError {
    match status {
        StatusCode::NOT_FOUND => contract::ProposeError::PluginNotFound,
        StatusCode::CONFLICT => contract::ProposeError::Conflict,
        StatusCode::BAD_REQUEST | StatusCode::UNPROCESSABLE_ENTITY => {
            contract::ProposeError::InvalidRequest
        }
        _ => contract::ProposeError::Unknown(unknown_status(status)),
    }
}

fn map_publish_status(status: StatusCode) -> contract::PublishError {
    match status {
        StatusCode::NOT_FOUND => contract::PublishError::PluginNotFound,
        StatusCode::CONFLICT => contract::PublishError::Conflict,
        StatusCode::BAD_REQUEST | StatusCode::UNPROCESSABLE_ENTITY => {
            contract::PublishError::InvalidRequest
        }
        _ => contract::PublishError::Unknown(unknown_status(status)),
    }
}

fn map_selection_status(status: StatusCode) -> contract::SetEnabledError {
    match status {
        StatusCode::NOT_FOUND => contract::SetEnabledError::PluginNotFound,
        StatusCode::CONFLICT => contract::SetEnabledError::Conflict,
        StatusCode::FORBIDDEN => contract::SetEnabledError::Unsupported,
        StatusCode::BAD_REQUEST | StatusCode::UNPROCESSABLE_ENTITY => {
            contract::SetEnabledError::InvalidRequest
        }
        _ => contract::SetEnabledError::Unknown(unknown_status(status)),
    }
}

fn unknown_status(status: StatusCode) -> contract::UnknownDomainError {
    contract::UnknownDomainError {
        code: status.as_u16().to_string(),
        payload: None,
        extra: std::collections::BTreeMap::new(),
    }
}

fn bounded_count(value: usize, maximum: i64) -> i64 {
    i64::try_from(value).unwrap_or(i64::MAX).min(maximum)
}

fn runtime_failure(detail: impl Into<String>) -> RuntimeFailure {
    RuntimeFailure::PluginFailure {
        detail: detail.into(),
    }
}

fn protocol_failure(detail: impl Into<String>) -> RuntimeFailure {
    runtime_failure(format!(
        "Plugin management target protocol violation: {}",
        detail.into()
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn adapter(id: &str, plugin_configuration: bool) -> AppAgentAdapter {
        let mut adapter = AppAgentAdapter::parse_as(id, "http://127.0.0.1:3031", id)
            .unwrap()
            .unwrap();
        adapter.plugin_configuration = plugin_configuration;
        adapter
    }

    #[test]
    fn target_selection_is_exact_and_fails_closed() {
        let target = AppAgentPluginManagementTarget::new(vec![
            adapter("managed", true),
            adapter("observed", false),
        ]);

        assert!(matches!(
            target.target("missing", "missing", "unsupported"),
            Err("missing")
        ));
        assert!(matches!(
            target.target("observed", "missing", "unsupported"),
            Err("unsupported")
        ));
        assert_eq!(
            target
                .target("managed", "missing", "unsupported")
                .unwrap()
                .id,
            "managed"
        );
    }
}
