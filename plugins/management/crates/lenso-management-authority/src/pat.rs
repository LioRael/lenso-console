//! A human-only PAT wrapper. Credential facts and raw secrets remain with the Auth owner.
use crate::{EntryPolicy, OperatorsAuthority};
use lenso_capability_human_api_token as pat;
use lenso_kernel::{InvocationContext, NativeRequestFuture};
use lenso_management_core::{Error, InvocationState, Management, Principal};
use std::rc::Rc;

#[derive(Clone, Debug)]
pub struct HumanPatServiceProvider {
    authority: Rc<OperatorsAuthority>,
    deployment: String,
    owner: pat::HumanApiTokenClient,
    management: Rc<Management>,
}
impl HumanPatServiceProvider {
    pub fn new(
        authority: Rc<OperatorsAuthority>,
        deployment: String,
        owner: pat::HumanApiTokenClient,
        management: Rc<Management>,
    ) -> Result<Self, Error> {
        if deployment.is_empty() || deployment.len() > 128 {
            return Err(Error::InvalidInput);
        }
        Ok(Self {
            authority,
            deployment,
            owner,
            management,
        })
    }
    async fn authorize(
        &self,
        context: &InvocationContext,
        deployment: &str,
        operation: &str,
    ) -> Result<Principal, Error> {
        if deployment != self.deployment {
            return Err(Error::Denied);
        }
        self.authority
            .authorize_human(
                context,
                deployment,
                &EntryPolicy {
                    permission: format!("auth.pat.{operation}"),
                    scope_kind: "management-deployment".into(),
                    scope_id: deployment.into(),
                },
                pat::CAPABILITY_ID,
                operation,
            )
            .await
    }
    async fn authorize_issue(
        &self,
        context: &InvocationContext,
        request: &pat::IssueRequest,
    ) -> Result<Principal, Error> {
        let human = self
            .authorize(context, &request.deployment, "issue")
            .await?;
        let ceiling = lenso_auth_sdk::credential::ManagementCredentialCeiling {
            deployment: request.deployment.clone(),
            permissions: request.permissions.clone(),
            resource_scopes: request
                .resource_scopes
                .iter()
                .map(
                    |scope| lenso_auth_sdk::credential::ManagementResourceScope {
                        kind: scope.kind.clone(),
                        id: scope.id.clone(),
                    },
                )
                .collect(),
        };
        ceiling.validate().map_err(|_| Error::InvalidInput)?;
        if request
            .permissions
            .len()
            .saturating_mul(request.resource_scopes.len())
            > 256
        {
            return Err(Error::InvalidInput);
        }
        for scope in &request.resource_scopes {
            for permission in &request.permissions {
                let admitted = self
                    .authority
                    .policies
                    .values()
                    .find(|policy| {
                        policy.permission == *permission
                            && policy.scope_kind == scope.kind
                            && policy.scope_id == scope.id
                    })
                    .ok_or(Error::Denied)?;
                let current = self
                    .authority
                    .authorize_human(
                        context,
                        &request.deployment,
                        admitted,
                        pat::CAPABILITY_ID,
                        "issue",
                    )
                    .await?;
                if current != human {
                    return Err(Error::Denied);
                }
            }
        }
        if self
            .authorize(context, &request.deployment, "issue")
            .await?
            != human
        {
            return Err(Error::Denied);
        }
        Ok(human)
    }
}
fn rejection<T, D>(
    error: Error,
    denied: D,
    invalid: D,
) -> Result<Result<T, D>, lenso_kernel::RuntimeFailure> {
    match error {
        Error::Denied => Ok(Err(denied)),
        Error::InvalidInput => Ok(Err(invalid)),
        _ => Err(lenso_kernel::RuntimeFailure::PluginFailure {
            detail: "Human token authority is unavailable".into(),
        }),
    }
}
impl pat::HumanApiTokenProvider for HumanPatServiceProvider {
    fn issue(
        &self,
        context: InvocationContext,
        request: pat::IssueRequest,
    ) -> NativeRequestFuture<pat::HumanApiTokenIssue> {
        let this = self.clone();
        Box::pin(async move {
            let human = match this.authorize_issue(&context, &request).await {
                Ok(human) => human,
                Err(error) => {
                    return rejection(
                        error,
                        pat::IssueError::PermissionDenied,
                        pat::IssueError::InvalidRequest,
                    );
                }
            };
            let parameters = serde_json::to_value(&request).map_err(|_| unavailable())?;
            let mutation = this
                .management
                .external_reserve(
                    &context,
                    &human,
                    "auth.pat.issue",
                    &request.idempotency_key,
                    &parameters,
                )
                .map_err(|_| unavailable())?;
            if mutation.state == InvocationState::Succeeded {
                this.management
                    .external_flush(&context, &mutation)
                    .await
                    .map_err(|_| unavailable())?;
                let credential = serde_json::from_value(mutation.receipt.ok_or_else(unavailable)?)
                    .map_err(|_| unavailable())?;
                return Ok(Ok(pat::IssueResponse {
                    credential,
                    token: None,
                    replayed: true,
                }));
            }
            if mutation.state != InvocationState::Ready {
                return Err(unavailable());
            }
            this.management
                .external_attempt(&context, &mutation)
                .await
                .map_err(|_| unavailable())?;
            if this
                .authorize_issue(&context, &request)
                .await
                .map_err(|_| unavailable())?
                != human
            {
                return Ok(Err(pat::IssueError::PermissionDenied));
            }
            let guard = this
                .management
                .external_claim(&context, &mutation)
                .map_err(|_| unavailable())?;
            let result = match this
                .owner
                .issue_with_context(context.clone(), request.clone())
                .await
            {
                Ok(result) => result,
                Err(pat::HumanApiTokenIssueInvocationError::Domain(error)) => {
                    guard
                        .complete(InvocationState::Failed, None)
                        .map_err(|_| unavailable())?;
                    this.management
                        .external_flush(&context, &mutation)
                        .await
                        .map_err(|_| unavailable())?;
                    return Ok(Err(error));
                }
                Err(pat::HumanApiTokenIssueInvocationError::Runtime(error)) => return Err(error),
            };
            // Only credential metadata enters the journal; the one-time secret stays in this stack frame.
            guard
                .complete(
                    InvocationState::Succeeded,
                    Some(serde_json::to_value(&result.credential).map_err(|_| unavailable())?),
                )
                .map_err(|_| unavailable())?;
            this.management
                .external_flush(&context, &mutation)
                .await
                .map_err(|_| unavailable())?;
            if this
                .authorize_issue(&context, &request)
                .await
                .map_err(|_| unavailable())?
                != human
            {
                return Ok(Err(pat::IssueError::PermissionDenied));
            }
            Ok(Ok(result))
        })
    }
    fn list(
        &self,
        context: InvocationContext,
        request: pat::ListRequest,
    ) -> NativeRequestFuture<pat::HumanApiTokenList> {
        let this = self.clone();
        Box::pin(async move {
            let human = match this.authorize(&context, &request.deployment, "list").await {
                Ok(human) => human,
                Err(error) => {
                    return rejection(
                        error,
                        pat::ListError::PermissionDenied,
                        pat::ListError::InvalidRequest,
                    );
                }
            };
            let result = match this
                .owner
                .list_with_context(context.clone(), request.clone())
                .await
            {
                Ok(result) => result,
                Err(pat::HumanApiTokenListInvocationError::Domain(error)) => return Ok(Err(error)),
                Err(pat::HumanApiTokenListInvocationError::Runtime(error)) => return Err(error),
            };
            match this.authorize(&context, &request.deployment, "list").await {
                Ok(current) if current == human => Ok(Ok(result)),
                Ok(_) => Ok(Err(pat::ListError::PermissionDenied)),
                Err(error) => rejection(
                    error,
                    pat::ListError::PermissionDenied,
                    pat::ListError::InvalidRequest,
                ),
            }
        })
    }
    fn revoke(
        &self,
        context: InvocationContext,
        request: pat::RevokeRequest,
    ) -> NativeRequestFuture<pat::HumanApiTokenRevoke> {
        let this = self.clone();
        Box::pin(async move {
            let human = match this
                .authorize(&context, &request.deployment, "revoke")
                .await
            {
                Ok(human) => human,
                Err(error) => {
                    return rejection(
                        error,
                        pat::RevokeError::PermissionDenied,
                        pat::RevokeError::InvalidRequest,
                    );
                }
            };
            let parameters = serde_json::to_value(&request).map_err(|_| unavailable())?;
            let mutation = this
                .management
                .external_reserve(
                    &context,
                    &human,
                    "auth.pat.revoke",
                    &request.credential_id,
                    &parameters,
                )
                .map_err(|_| unavailable())?;
            if mutation.state == InvocationState::Succeeded {
                this.management
                    .external_flush(&context, &mutation)
                    .await
                    .map_err(|_| unavailable())?;
                return Ok(Ok(pat::RevokeResponse {
                    revoked: mutation
                        .receipt
                        .as_ref()
                        .and_then(|value| value.get("revoked"))
                        .and_then(serde_json::Value::as_bool)
                        .ok_or_else(unavailable)?,
                }));
            }
            if mutation.state != InvocationState::Ready {
                return Err(unavailable());
            }
            this.management
                .external_attempt(&context, &mutation)
                .await
                .map_err(|_| unavailable())?;
            if this
                .authorize(&context, &request.deployment, "revoke")
                .await
                .map_err(|_| unavailable())?
                != human
            {
                return Ok(Err(pat::RevokeError::PermissionDenied));
            }
            let guard = this
                .management
                .external_claim(&context, &mutation)
                .map_err(|_| unavailable())?;
            let result = match this
                .owner
                .revoke_with_context(context.clone(), request.clone())
                .await
            {
                Ok(result) => result,
                Err(pat::HumanApiTokenRevokeInvocationError::Domain(error)) => {
                    guard
                        .complete(InvocationState::Failed, None)
                        .map_err(|_| unavailable())?;
                    this.management
                        .external_flush(&context, &mutation)
                        .await
                        .map_err(|_| unavailable())?;
                    return Ok(Err(error));
                }
                Err(pat::HumanApiTokenRevokeInvocationError::Runtime(error)) => return Err(error),
            };
            guard.complete(InvocationState::Succeeded, Some(serde_json::json!({"credential_id":request.credential_id,"revoked":result.revoked}))).map_err(|_| unavailable())?;
            this.management
                .external_flush(&context, &mutation)
                .await
                .map_err(|_| unavailable())?;
            if this
                .authorize(&context, &request.deployment, "revoke")
                .await
                .map_err(|_| unavailable())?
                != human
            {
                return Ok(Err(pat::RevokeError::PermissionDenied));
            }
            Ok(Ok(result))
        })
    }
}

fn unavailable() -> lenso_kernel::RuntimeFailure {
    lenso_kernel::RuntimeFailure::PluginFailure {
        detail: "Human token operation requires an owner receipt or audit recovery".into(),
    }
}
