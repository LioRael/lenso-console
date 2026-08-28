use std::time::Duration;

use axum::http::StatusCode;
use lenso::host::http::{
    ApiErrorResponse, ApiOpenApiRouter, AppContext, AppError, ErrorCode, ErrorResponse,
    HttpRequestContext, Json, ModuleHttpMethod, ModuleHttpRoute, OpenApiRouter, RequestContext,
    State, UserActor, json, routes,
};
use lenso::host::prelude::*;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use utoipa::ToSchema;

use crate::modules::console_access;

pub const MODULE_NAME: &str = "lenso/console-agent-control";
pub const TOOL_POLICY_READ: &str = "console.agent.tool-policy.read";
pub const TOOL_POLICY_MANAGE: &str = "console.agent.tool-policy.manage";

const CONTROL_URL_ENV: &str = "LENSO_CONSOLE_AGENT_CONTROL_URL";
const CONTROL_TOKEN_ENV: &str = "LENSO_CONSOLE_AGENT_CONTROL_TOKEN";
const TOOL_POLICY_PATH: &str = "/api/console/v1/agent/control/tool-policy";
const RESPONSE_BODY_LIMIT: usize = 64 * 1024;

#[derive(Debug, Deserialize, Serialize, ToSchema)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct ToolPolicyUpdate {
    allowed: Vec<String>,
    expected_revision: u64,
}

pub fn linked_module() -> HostLinkedModule {
    HostLinkedModule::manifest_only(MODULE_NAME, manifest, &[]).with_http_binding(http_binding)
}

fn manifest() -> ModuleManifest {
    ModuleManifest::builder(MODULE_NAME)
        .capabilities(vec![
            TOOL_POLICY_MANAGE.to_owned(),
            TOOL_POLICY_READ.to_owned(),
        ])
        .http_routes(vec![
            route(
                ModuleHttpMethod::Get,
                TOOL_POLICY_READ,
                "Read Agent Tool Policy",
            ),
            route(
                ModuleHttpMethod::Put,
                TOOL_POLICY_MANAGE,
                "Update Agent Tool Policy",
            ),
        ])
        .build()
}

fn route(method: ModuleHttpMethod, capability: &str, display_name: &str) -> ModuleHttpRoute {
    ModuleHttpRoute {
        method,
        path: TOOL_POLICY_PATH.to_owned(),
        capability: Some(capability.to_owned()),
        display_name: Some(display_name.to_owned()),
        story_title: Some("Agent Tool Policy".to_owned()),
        operation: None,
    }
}

fn http_binding() -> LinkedBinding {
    LinkedBinding::builder()
        .http(LinkedHttpContribution {
            public_prefixes: &["/api/console/v1/agent/control"],
            merge: merge_http,
        })
        .build()
}

fn merge_http(base: ApiOpenApiRouter) -> ApiOpenApiRouter {
    base.merge(
        OpenApiRouter::new()
            .routes(routes!(read_tool_policy))
            .routes(routes!(update_tool_policy)),
    )
}

#[utoipa::path(
    get,
    path = "/api/console/v1/agent/control/tool-policy",
    operation_id = "console_read_agent_tool_policy",
    tag = "console-agent-control",
    responses(
        (status = 200, body = Value, content_type = "application/json"),
        (status = 401, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 403, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 502, body = ErrorResponse, content_type = "application/problem+json")
    )
)]
async fn read_tool_policy(
    State(ctx): State<AppContext>,
    actor: UserActor,
    HttpRequestContext(request_ctx): HttpRequestContext,
) -> Result<Json<Value>, ApiErrorResponse> {
    console_access::require_console_capability(&ctx, &actor, TOOL_POLICY_READ, &request_ctx)
        .await?;
    forward_policy(None, &request_ctx).await.map(json)
}

#[utoipa::path(
    put,
    path = "/api/console/v1/agent/control/tool-policy",
    operation_id = "console_update_agent_tool_policy",
    tag = "console-agent-control",
    request_body = ToolPolicyUpdate,
    responses(
        (status = 200, body = Value, content_type = "application/json"),
        (status = 400, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 401, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 403, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 409, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 502, body = ErrorResponse, content_type = "application/problem+json")
    )
)]
async fn update_tool_policy(
    State(ctx): State<AppContext>,
    actor: UserActor,
    HttpRequestContext(request_ctx): HttpRequestContext,
    Json(input): Json<ToolPolicyUpdate>,
) -> Result<Json<Value>, ApiErrorResponse> {
    console_access::require_console_capability(&ctx, &actor, TOOL_POLICY_MANAGE, &request_ctx)
        .await?;
    forward_policy(Some(input), &request_ctx).await.map(json)
}

async fn forward_policy(
    input: Option<ToolPolicyUpdate>,
    request_ctx: &RequestContext,
) -> Result<Value, ApiErrorResponse> {
    let (url, token) = control_target().map_err(|message| external_error(message, request_ctx))?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .map_err(|error| external_error(error.to_string(), request_ctx))?;
    let request = match input {
        Some(input) => client.put(url).bearer_auth(token).json(&input),
        None => client.get(url).bearer_auth(token),
    };
    let response = request
        .send()
        .await
        .map_err(|error| external_error(error.to_string(), request_ctx))?;
    let status = response.status();
    let bytes = response
        .bytes()
        .await
        .map_err(|error| external_error(error.to_string(), request_ctx))?;
    if bytes.len() > RESPONSE_BODY_LIMIT {
        return Err(external_error(
            "Agent Tool policy response exceeded the configured limit",
            request_ctx,
        ));
    }
    if status.is_success() {
        return serde_json::from_slice(&bytes)
            .map_err(|error| external_error(error.to_string(), request_ctx));
    }
    let detail = serde_json::from_slice::<Value>(&bytes)
        .ok()
        .and_then(|body| {
            body.get("detail")
                .and_then(Value::as_str)
                .map(str::to_owned)
        })
        .unwrap_or_else(|| "Agent Tool policy authority rejected the request".to_owned());
    let code = match status {
        StatusCode::BAD_REQUEST => ErrorCode::Validation,
        StatusCode::CONFLICT => ErrorCode::Conflict,
        _ => ErrorCode::ExternalDependency,
    };
    Err(ApiErrorResponse::with_context(
        AppError::new(code, detail),
        request_ctx,
    ))
}

fn control_target() -> Result<(reqwest::Url, String), String> {
    let base = std::env::var(CONTROL_URL_ENV)
        .map_err(|_| format!("{CONTROL_URL_ENV} is not configured"))?;
    let token = std::env::var(CONTROL_TOKEN_ENV)
        .ok()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| format!("{CONTROL_TOKEN_ENV} is not configured"))?;
    let mut url =
        reqwest::Url::parse(&base).map_err(|_| format!("{CONTROL_URL_ENV} is invalid"))?;
    let loopback = url.host_str().is_some_and(|host| {
        host == "localhost"
            || host
                .parse::<std::net::IpAddr>()
                .is_ok_and(|address| address.is_loopback())
    });
    if url.scheme() != "http"
        || !loopback
        || !url.username().is_empty()
        || url.password().is_some()
        || !matches!(url.path(), "" | "/")
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(format!(
            "{CONTROL_URL_ENV} must be a clean loopback HTTP origin"
        ));
    }
    url.set_path(TOOL_POLICY_PATH);
    Ok((url, token))
}

fn external_error(message: impl Into<String>, request_ctx: &RequestContext) -> ApiErrorResponse {
    ApiErrorResponse::with_context(
        AppError::new(ErrorCode::ExternalDependency, message.into()).retryable(),
        request_ctx,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn module_exposes_only_scoped_agent_policy_routes() {
        let module = linked_module();
        let manifest = (module.manifest)();
        assert_eq!(
            manifest.capabilities,
            [TOOL_POLICY_MANAGE, TOOL_POLICY_READ]
        );
        assert_eq!(manifest.http_routes.len(), 2);
        assert!(
            manifest
                .http_routes
                .iter()
                .all(|route| route.path == TOOL_POLICY_PATH)
        );
    }
}
