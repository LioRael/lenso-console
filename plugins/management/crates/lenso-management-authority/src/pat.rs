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
    async fn receipt_current(
        &self,
        context: &InvocationContext,
        request: &pat::ReceiptRequest,
    ) -> Result<pat::ReceiptResponse, lenso_kernel::RuntimeFailure> {
        let human = self
            .authorize_receipt(context, &request.deployment)
            .await
            .map_err(|_| unavailable())?;
        let mutation = self
            .management
            .external_lookup(&human, "auth.pat.issue", &request.idempotency_key)
            .map_err(|_| unavailable())?;
        let result = self
            .owner
            .receipt_with_context(context.clone(), request.clone())
            .await
            .map_err(|_| unavailable())?;
        let current = self
            .authorize_receipt(context, &request.deployment)
            .await
            .map_err(|_| unavailable())?;
        if current != human {
            return Err(unavailable());
        }
        if result.found {
            let credential = result
                .credential
                .as_ref()
                .and_then(Option::as_ref)
                .ok_or_else(unavailable)?;
            let original: pat::IssueRequest =
                serde_json::from_value(mutation.parameters.clone()).map_err(|_| unavailable())?;
            let mut requested_permissions = original.permissions.clone();
            requested_permissions.sort();
            let mut actual_permissions = credential.permissions.clone();
            actual_permissions.sort();
            let mut requested_scopes: Vec<_> = original
                .resource_scopes
                .iter()
                .map(|scope| (&scope.kind, &scope.id))
                .collect();
            requested_scopes.sort();
            let mut actual_scopes: Vec<_> = credential
                .resource_scopes
                .iter()
                .map(|scope| (&scope.kind, &scope.id))
                .collect();
            actual_scopes.sort();
            let original_expiry = time::OffsetDateTime::parse(
                &original.expires_at,
                &time::format_description::well_known::Rfc3339,
            )
            .map_err(|_| unavailable())?;
            let original_expiry = original_expiry
                .replace_nanosecond(original_expiry.nanosecond() / 1_000 * 1_000)
                .map_err(|_| unavailable())?;
            if credential.deployment != self.deployment
                || credential.name != original.name
                || requested_permissions != actual_permissions
                || requested_scopes != actual_scopes
                || time::OffsetDateTime::parse(
                    &credential.expires_at,
                    &time::format_description::well_known::Rfc3339,
                )
                .map_err(|_| unavailable())?
                    != original_expiry
            {
                return Err(unavailable());
            }
            if matches!(
                mutation.state,
                InvocationState::Unknown | InvocationState::Executing | InvocationState::Succeeded
            ) {
                self.management
                    .external_record(
                        &mutation,
                        InvocationState::Succeeded,
                        Some(serde_json::to_value(credential).map_err(|_| unavailable())?),
                    )
                    .map_err(|_| unavailable())?;
            } else {
                return Err(unavailable());
            }
        }
        self.management
            .external_flush(context, &mutation)
            .await
            .map_err(|_| unavailable())?;
        if self
            .authorize_receipt(context, &request.deployment)
            .await
            .map_err(|_| unavailable())?
            != human
        {
            return Err(unavailable());
        }
        Ok(result)
    }
    async fn authorize_receipt(
        &self,
        context: &InvocationContext,
        deployment: &str,
    ) -> Result<Principal, Error> {
        if deployment != self.deployment {
            return Err(Error::Denied);
        }
        self.authority
            .authorize_human(
                context,
                deployment,
                &EntryPolicy {
                    permission: "auth.pat.list".into(),
                    scope_kind: "management-deployment".into(),
                    scope_id: deployment.into(),
                },
                pat::CAPABILITY_ID,
                pat::RECEIPT_OPERATION,
            )
            .await
    }
    async fn reconcile_revocations(
        &self,
        context: &InvocationContext,
        human: &Principal,
        credentials: &[pat::CredentialMetadata],
    ) -> Result<(), lenso_kernel::RuntimeFailure> {
        for credential in credentials {
            if credential.deployment != self.deployment {
                return Err(unavailable());
            }
            if credential
                .revoked_at
                .as_ref()
                .and_then(Option::as_ref)
                .is_none()
            {
                continue;
            }
            let mutation = match self.management.external_lookup(
                human,
                "auth.pat.revoke",
                &credential.credential_id,
            ) {
                Ok(mutation) => mutation,
                Err(Error::NotFound) => continue,
                Err(_) => return Err(unavailable()),
            };
            if !matches!(
                mutation.state,
                InvocationState::Unknown | InvocationState::Executing | InvocationState::Succeeded
            ) {
                continue;
            }
            if self
                .authorize(context, &self.deployment, "list")
                .await
                .map_err(|_| unavailable())?
                != *human
            {
                return Err(unavailable());
            }
            let receipt =
                revocation_receipt(&mutation.parameters, credential)?.ok_or_else(unavailable)?;
            if mutation.state != InvocationState::Succeeded {
                self.management
                    .external_record(&mutation, InvocationState::Succeeded, Some(receipt))
                    .map_err(|_| unavailable())?;
            }
            self.management
                .external_flush(context, &mutation)
                .await
                .map_err(|_| unavailable())?;
        }
        if self
            .authorize(context, &self.deployment, "list")
            .await
            .map_err(|_| unavailable())?
            != *human
        {
            return Err(unavailable());
        }
        Ok(())
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

fn revocation_receipt(
    parameters: &serde_json::Value,
    credential: &pat::CredentialMetadata,
) -> Result<Option<serde_json::Value>, lenso_kernel::RuntimeFailure> {
    let Some(revoked_at) = credential.revoked_at.as_ref().and_then(Option::as_ref) else {
        return Ok(None);
    };
    time::OffsetDateTime::parse(revoked_at, &time::format_description::well_known::Rfc3339)
        .map_err(|_| unavailable())?;
    let original: pat::RevokeRequest =
        serde_json::from_value(parameters.clone()).map_err(|_| unavailable())?;
    if credential.active
        || original.deployment != credential.deployment
        || original.credential_id != credential.credential_id
    {
        return Err(unavailable());
    }
    Ok(Some(serde_json::json!({
        "credential_id": credential.credential_id,
        "revoked": true,
        "confirmed_revoked_at": revoked_at,
        "confirmation": "owner_token_revocation_postcondition"
    })))
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
            let mutation = match this.management.external_reserve(
                &context,
                &human,
                "auth.pat.issue",
                &request.idempotency_key,
                &parameters,
            ) {
                Ok(mutation) => mutation,
                Err(Error::Conflict) => return Ok(Err(pat::IssueError::Conflict)),
                Err(Error::InvalidInput) => return Ok(Err(pat::IssueError::InvalidRequest)),
                Err(_) => return Err(unavailable()),
            };
            if mutation.state == InvocationState::Succeeded {
                let receipt = this
                    .receipt_current(
                        &context,
                        &pat::ReceiptRequest {
                            deployment: request.deployment.clone(),
                            idempotency_key: request.idempotency_key.clone(),
                        },
                    )
                    .await?;
                return Ok(Ok(pat::IssueResponse {
                    credential: receipt.credential.flatten().ok_or_else(unavailable)?,
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
    fn receipt(
        &self,
        context: InvocationContext,
        request: pat::ReceiptRequest,
    ) -> NativeRequestFuture<pat::HumanApiTokenReceipt> {
        let this = self.clone();
        Box::pin(async move {
            if let Err(error) = this.authorize_receipt(&context, &request.deployment).await {
                return rejection(
                    error,
                    pat::ReceiptError::PermissionDenied,
                    pat::ReceiptError::InvalidRequest,
                );
            }
            this.receipt_current(&context, &request).await.map(Ok)
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
                Ok(current) if current == human => {
                    this.reconcile_revocations(&context, &human, &result.credentials)
                        .await?;
                    Ok(Ok(result))
                }
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
                if this
                    .authorize(&context, &request.deployment, "revoke")
                    .await
                    .map_err(|_| unavailable())?
                    != human
                {
                    return Ok(Err(pat::RevokeError::PermissionDenied));
                }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn revocation_recovery_requires_the_exact_token_owner_postcondition() {
        let parameters = serde_json::json!({"deployment":"alpha","credential_id":"pat-1"});
        let mut credential: pat::CredentialMetadata = serde_json::from_value(serde_json::json!({
            "credential_id":"pat-1","name":"review","deployment":"alpha",
            "permissions":["ops.read"],"resource_scopes":[{"kind":"ops","id":"primary"}],
            "expires_at":"2020-01-01T00:00:00Z","active":false
        }))
        .unwrap();
        // Expiry or a revoked parent session can make a token inactive without revoking the token.
        assert!(
            revocation_receipt(&parameters, &credential)
                .unwrap()
                .is_none()
        );
        credential.revoked_at = Some(Some("2020-01-02T00:00:00Z".into()));
        let receipt = revocation_receipt(&parameters, &credential)
            .unwrap()
            .unwrap();
        assert_eq!(receipt["credential_id"], "pat-1");
        assert_eq!(
            receipt["confirmation"],
            "owner_token_revocation_postcondition"
        );
        assert!(receipt.get("token").is_none());
        credential.credential_id = "pat-2".into();
        assert!(revocation_receipt(&parameters, &credential).is_err());
        credential.credential_id = "pat-1".into();
        credential.deployment = "beta".into();
        assert!(revocation_receipt(&parameters, &credential).is_err());
        credential.deployment = "alpha".into();
        credential.active = true;
        assert!(revocation_receipt(&parameters, &credential).is_err());
        credential.active = false;
        credential.revoked_at = Some(Some("invalid".into()));
        assert!(revocation_receipt(&parameters, &credential).is_err());
    }
}
