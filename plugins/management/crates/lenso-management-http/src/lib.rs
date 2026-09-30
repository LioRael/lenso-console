//! Transport projection. Identity and final operation admission remain with bound owners.
#[cfg(target_arch = "wasm32")]
pub mod workers;
use futures::future::LocalBoxFuture;
use lenso_auth_sdk::{AuthOutcome, CredentialEvidence, authenticate_request, decode_auth_response};
use lenso_capability_auth as auth;
use lenso_capability_http_endpoint as http;
use lenso_capability_management as management;
use lenso_capability_management_human as human;
use lenso_kernel::{InvocationContext, NativeRequestFuture};
use serde::Serialize;
use std::rc::Rc;

/// An optional Host-selected protocol adapter receives a sealed context, never a bearer.
pub trait McpTransport: std::fmt::Debug {
    fn handle(
        &self,
        context: InvocationContext,
        request: http::HandleRequest,
        management: management::ManagementClient,
    ) -> LocalBoxFuture<'_, Result<http::HandleResponse, ()>>;
}
#[derive(Clone, Debug)]
pub struct Profile {
    pub public_origin: String,
    pub mcp_resource: Option<String>,
    pub mcp_authentication: McpAuthentication,
    pub authorization_servers: Vec<String>,
    pub allowed_origins: Vec<String>,
}
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub enum McpAuthentication {
    #[default]
    OAuth,
    PreissuedBearer,
}
impl Profile {
    pub fn validate(&self) -> Result<(), &'static str> {
        let origin = url::Url::parse(&self.public_origin).map_err(|_| "invalid public origin")?;
        if origin.origin().ascii_serialization() != self.public_origin
            || !(origin.scheme() == "https"
                || (origin.scheme() == "http"
                    && matches!(origin.host_str(), Some("localhost" | "127.0.0.1"))))
        {
            return Err("HTTP profile requires HTTPS or explicit loopback origin");
        }
        if self.authorization_servers.len() > 16
            || self.allowed_origins.len() > 16
            || self.allowed_origins.iter().any(|value| {
                url::Url::parse(value).is_err()
                    || url::Url::parse(value)
                        .is_ok_and(|url| url.origin().ascii_serialization() != *value)
            })
        {
            return Err("invalid origin profile");
        }
        if let Some(resource) = &self.mcp_resource {
            if resource != &(self.public_origin.clone() + "/mcp") {
                return Err("invalid MCP resource");
            }
            match self.mcp_authentication {
                McpAuthentication::OAuth if self.authorization_servers.is_empty() => {
                    return Err("OAuth MCP requires an authorization server");
                }
                McpAuthentication::PreissuedBearer if !self.authorization_servers.is_empty() => {
                    return Err("Preissued bearer MCP does not advertise OAuth servers");
                }
                _ => {}
            }
            if self.authorization_servers.iter().any(|value| {
                url::Url::parse(value).is_err()
                    || url::Url::parse(value).is_ok_and(|url| {
                        url.scheme() != "https"
                            || !url.username().is_empty()
                            || url.password().is_some()
                            || url.fragment().is_some()
                    })
            }) {
                return Err("invalid authorization server");
            }
        }
        Ok(())
    }
}
#[derive(Clone, Debug)]
pub struct BearerHttpProvider {
    pub profile: Profile,
    pub auth: auth::AuthClient,
    pub management: management::ManagementClient,
    pub human: human::ManagementHumanClient,
    pub mcp: Option<Rc<dyn McpTransport>>,
}
impl BearerHttpProvider {
    pub fn new(
        profile: Profile,
        auth: auth::AuthClient,
        management: management::ManagementClient,
        human: human::ManagementHumanClient,
        mcp: Option<Rc<dyn McpTransport>>,
    ) -> Result<Self, &'static str> {
        profile.validate()?;
        if mcp.is_some() != profile.mcp_resource.is_some() {
            return Err("MCP requires an explicit selected transport");
        }
        Ok(Self {
            profile,
            auth,
            management,
            human,
            mcp,
        })
    }
    async fn dispatch(
        &self,
        context: InvocationContext,
        request: http::HandleRequest,
    ) -> http::HandleResponse {
        if request.body.as_slice().len() > 262_144 || request.query.is_some() {
            return problem(400, "invalid_input");
        }
        let origins: Vec<_> = request
            .headers
            .iter()
            .filter(|header| header.name.eq_ignore_ascii_case("origin"))
            .collect();
        if origins.len() > 1
            || origins
                .first()
                .is_some_and(|origin| !self.profile.allowed_origins.contains(&origin.value))
        {
            return problem(403, "origin_rejected");
        }
        if request.route_id == "management.resource" {
            if self.profile.mcp_authentication != McpAuthentication::OAuth {
                return problem(404, "not_found");
            }
            return json_response(
                200,
                &serde_json::json!({"resource":self.profile.mcp_resource,
                "authorization_servers":self.profile.authorization_servers,"bearer_methods_supported":["header"]}),
            );
        }
        let Some(credential) = request.credential.as_ref().filter(|value| {
            value.scheme == "bearer" && !value.value.is_empty() && value.value.len() <= 8192
        }) else {
            return self.unauthorized();
        };
        let reply = match self
            .auth
            .authenticate_with_context(
                context.clone(),
                authenticate_request(Some(CredentialEvidence::new(
                    "bearer",
                    credential.value.clone(),
                ))),
            )
            .await
        {
            Ok(reply) => reply,
            Err(
                auth::AuthInvocationError::Runtime(_)
                | auth::AuthInvocationError::Domain(auth::AuthenticateError::Unknown(_)),
            ) => return problem(503, "auth_unavailable"),
            Err(auth::AuthInvocationError::Domain(_)) => return self.unauthorized(),
        };
        let assertion = match decode_auth_response(reply) {
            Ok(AuthOutcome::Authenticated(assertion)) => assertion,
            Ok(_) => return self.unauthorized(),
            Err(_) => return problem(503, "auth_unavailable"),
        };
        if context.is_cancelled() {
            return problem(503, "request_cancelled");
        }
        let expected: Vec<_> = request
            .headers
            .iter()
            .filter(|header| header.name.eq_ignore_ascii_case("x-lenso-expected-subject"))
            .collect();
        if expected.len() > 1
            || expected
                .first()
                .is_some_and(|header| header.value != assertion.subject())
        {
            return problem(412, "session_changed");
        }
        if request.route_id == "management.mcp"
            && !self.profile.mcp_resource.as_ref().is_some_and(|resource| {
                assertion
                    .audience()
                    .iter()
                    .any(|audience| audience == resource)
            })
        {
            return self.unauthorized();
        }
        let context = match assertion.attach(context) {
            Ok(context) => context,
            Err(_) => return problem(503, "auth_unavailable"),
        };
        let input = || serde_json::from_slice(request.body.as_slice());
        match request.route_id.as_str() {
            "management.catalog" => match self
                .management
                .catalog_with_context(context, management::CatalogRequest {})
                .await
            {
                Ok(reply) => json_response(200, &reply),
                Err(management::ManagementCatalogInvocationError::Domain(
                    management::CatalogError::PermissionDenied,
                )) => problem(403, "operators_required"),
                _ => problem(503, "management_unavailable"),
            },
            "management.invoke" => {
                let Ok(input) = input() else {
                    return problem(400, "invalid_input");
                };
                match self.management.invoke_with_context(context, input).await {
                    Ok(reply) => json_response(200, &reply),
                    Err(management::ManagementInvokeInvocationError::Domain(error)) => {
                        match error {
                            management::InvokeError::PermissionDenied => {
                                problem(403, "operators_required")
                            }
                            management::InvokeError::NotFound => problem(404, "entry_not_found"),
                            management::InvokeError::InvalidInput => problem(400, "invalid_input"),
                            management::InvokeError::Conflict => problem(409, "intent_changed"),
                            _ => problem(503, "management_unavailable"),
                        }
                    }
                    _ => problem(503, "management_unavailable"),
                }
            }
            "management.status" | "management.intent" => {
                let Some(id) = request
                    .path_parameters
                    .iter()
                    .find(|item| item.name == "operation_id")
                    .map(|item| item.value.clone())
                    .filter(|id| {
                        !id.is_empty()
                            && id.len() <= 128
                            && id
                                .bytes()
                                .all(|byte| byte.is_ascii_alphanumeric() || b"-_.".contains(&byte))
                    })
                else {
                    return problem(400, "invalid_reference");
                };
                if request.route_id == "management.status" {
                    match self
                        .management
                        .status_with_context(
                            context,
                            management::StatusRequest { operation_id: id },
                        )
                        .await
                    {
                        Ok(reply) => json_response(200, &reply),
                        Err(management::ManagementStatusInvocationError::Domain(error)) => {
                            match error {
                                management::StatusError::PermissionDenied => {
                                    problem(403, "operators_required")
                                }
                                management::StatusError::NotFound => {
                                    problem(404, "operation_not_found")
                                }
                                management::StatusError::Conflict => problem(409, "intent_changed"),
                                _ => problem(503, "management_unavailable"),
                            }
                        }
                        _ => problem(503, "management_unavailable"),
                    }
                } else {
                    match self
                        .human
                        .read_intent_with_context(
                            context,
                            human::ReadIntentRequest { operation_id: id },
                        )
                        .await
                    {
                        Ok(reply) => json_response(200, &reply),
                        Err(human::ManagementHumanReadIntentInvocationError::Domain(error)) => {
                            match error {
                                human::ReadIntentError::PermissionDenied => {
                                    problem(403, "human_required")
                                }
                                human::ReadIntentError::NotFound => {
                                    problem(404, "operation_not_found")
                                }
                                human::ReadIntentError::Conflict => problem(409, "intent_changed"),
                                _ => problem(503, "management_unavailable"),
                            }
                        }
                        _ => problem(503, "management_unavailable"),
                    }
                }
            }
            "management.decide" => {
                let Ok(input) = serde_json::from_slice(request.body.as_slice()) else {
                    return problem(400, "invalid_input");
                };
                match self.human.decide_with_context(context, input).await {
                    Ok(reply) => json_response(200, &reply),
                    Err(human::ManagementHumanDecideInvocationError::Domain(error)) => {
                        match error {
                            human::DecideError::PermissionDenied => problem(403, "human_required"),
                            human::DecideError::Conflict => problem(409, "intent_changed"),
                            _ => problem(503, "management_unavailable"),
                        }
                    }
                    _ => problem(503, "management_unavailable"),
                }
            }
            "management.mcp" => match &self.mcp {
                Some(transport) => transport
                    .handle(context, request, self.management.clone())
                    .await
                    .unwrap_or_else(|_| problem(503, "mcp_unavailable")),
                None => problem(404, "not_found"),
            },
            _ => problem(404, "not_found"),
        }
    }
    fn unauthorized(&self) -> http::HandleResponse {
        let mut response = problem(401, "credential_required");
        if self.profile.mcp_resource.is_some() {
            response.headers.push(http::HandleResponseHeadersItem {
                name: "www-authenticate".into(),
                value: match self.profile.mcp_authentication {
                    McpAuthentication::OAuth => format!(
                        "Bearer resource_metadata=\"{}/.well-known/oauth-protected-resource\"",
                        self.profile.public_origin
                    ),
                    McpAuthentication::PreissuedBearer => "Bearer".into(),
                },
            });
        }
        response
    }
}
impl http::EndpointProvider for BearerHttpProvider {
    fn describe(
        &self,
        _: InvocationContext,
        _: http::DescribeRequest,
    ) -> NativeRequestFuture<http::EndpointDescribe> {
        let mut routes = vec![
            ("management.catalog", "GET", "/management/catalog"),
            ("management.invoke", "POST", "/management/invoke"),
            (
                "management.status",
                "GET",
                "/management/operations/{operation_id}",
            ),
            (
                "management.intent",
                "GET",
                "/management/approval/{operation_id}",
            ),
            ("management.decide", "POST", "/management/approval"),
        ];
        if self.mcp.is_some() {
            routes.extend([
                ("management.mcp", "POST", "/mcp"),
                ("management.mcp", "GET", "/mcp"),
                ("management.mcp", "DELETE", "/mcp"),
            ]);
            if self.profile.mcp_authentication == McpAuthentication::OAuth {
                routes.push((
                    "management.resource",
                    "GET",
                    "/.well-known/oauth-protected-resource",
                ));
            }
        }
        let response = http::DescribeResponse {
            routes: routes
                .into_iter()
                .map(|(id, method, path)| http::DescribeResponseRoutesItem {
                    method: method.into(),
                    openapi: None,
                    path: path.into(),
                    route_id: id.into(),
                })
                .collect(),
        };
        Box::pin(async move { Ok(Ok(response)) })
    }
    fn handle(
        &self,
        context: InvocationContext,
        request: http::HandleRequest,
    ) -> NativeRequestFuture<http::EndpointHandle> {
        let owner = self.clone();
        Box::pin(async move { Ok(Ok(owner.dispatch(context, request).await)) })
    }
}
fn json_response(status: i64, value: &impl Serialize) -> http::HandleResponse {
    let Ok(body) = serde_json::to_vec(value) else {
        return problem(503, "invalid_owner_reply");
    };
    http::HandleResponse {
        body: body.into(),
        status,
        headers: vec![
            http::HandleResponseHeadersItem {
                name: "content-type".into(),
                value: "application/json".into(),
            },
            http::HandleResponseHeadersItem {
                name: "cache-control".into(),
                value: "no-store".into(),
            },
        ],
    }
}
fn problem(status: i64, code: &str) -> http::HandleResponse {
    json_response(status, &serde_json::json!({"code":code,"status":status}))
}

#[cfg(test)]
mod profile_tests {
    use super::{McpAuthentication, Profile};

    fn profile(authentication: McpAuthentication) -> Profile {
        Profile {
            public_origin: "https://management.example.test".into(),
            mcp_resource: Some("https://management.example.test/mcp".into()),
            mcp_authentication: authentication,
            authorization_servers: Vec::new(),
            allowed_origins: Vec::new(),
        }
    }

    #[test]
    fn default_oauth_requires_an_explicit_authorization_server() {
        let mut selected = profile(McpAuthentication::default());
        assert!(selected.validate().is_err());
        selected.authorization_servers = vec!["https://authorization.example.test".into()];
        assert!(selected.validate().is_ok());
        selected.authorization_servers = vec!["http://authorization.example.test".into()];
        assert!(selected.validate().is_err());
    }

    #[test]
    fn explicit_preissued_bearer_keeps_resource_binding_and_excludes_oauth() {
        let mut selected = profile(McpAuthentication::PreissuedBearer);
        assert!(selected.validate().is_ok());
        selected.authorization_servers = vec!["https://authorization.example.test".into()];
        assert!(selected.validate().is_err());
        selected.authorization_servers.clear();
        selected.mcp_resource = Some("https://other.example.test/mcp".into());
        assert!(selected.validate().is_err());
    }
}
