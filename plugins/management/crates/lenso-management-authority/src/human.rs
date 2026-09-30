//! A separately bound human capability. Tool providers receive only Management@1.
use crate::{EntryPolicy, OperatorsAuthority, approval_read_error};
use lenso_capability_business_approval as approval;
use lenso_capability_management_human as human;
use lenso_kernel::{InvocationContext, NativeRequestFuture};
use lenso_management_core::{Error, Management, Principal};
use std::rc::Rc;
use time::{OffsetDateTime, format_description::well_known::Rfc3339};

impl OperatorsAuthority {
    /// Additional fixed human entry guard, used before forwarding a human-only owner port.
    pub async fn authorize_human(
        &self,
        context: &InvocationContext,
        deployment: &str,
        policy: &EntryPolicy,
        capability: &str,
        operation: &str,
    ) -> Result<Principal, Error> {
        self.check_human_context(context)?;
        let user = self
            .current_user(context, deployment, policy, capability, operation)
            .await?;
        self.check_human_context(context)?;
        if user.delegated {
            return Err(Error::Denied);
        }
        Ok(Principal {
            subject: user.subject,
        })
    }
    pub(crate) fn check_human_context(&self, context: &InvocationContext) -> Result<(), Error> {
        if context.is_cancelled() {
            return Err(Error::Cancelled);
        }
        if context
            .deadline()
            .is_some_and(|deadline| self.clock.monotonic() >= deadline)
        {
            return Err(Error::Expired);
        }
        Ok(())
    }
    pub async fn read_approval_intent(
        &self,
        context: InvocationContext,
        management: &Management,
        operation_id: &str,
    ) -> Result<human::ReadIntentResponse, Error> {
        let approval_port = self.approval_port()?;
        let (intent, entry) = management
            .pending_approval_intent_async(operation_id)
            .await?;
        let fixed = self.policies.get(&entry.id).ok_or(Error::Denied)?;
        let policy = EntryPolicy {
            permission: "management.approval.read".into(),
            scope_kind: fixed.scope_kind.clone(),
            scope_id: fixed.scope_id.clone(),
        };
        let principal = self
            .authorize_human(
                &context,
                &intent.deployment,
                &policy,
                human::CAPABILITY_ID,
                "read_intent",
            )
            .await?;
        let stored = approval_port
            .read_with_context(
                context.clone(),
                approval::ReadRequest {
                    request_id: operation_id.into(),
                },
            )
            .await
            .map_err(|error| approval_read_error(&error))?;
        if stored.intent_digest.as_deref() != Some(&intent.digest)
            || stored.requested_by != intent.subject
            || stored.subject.kind != "management-operation"
            || stored.subject.id != operation_id
            || OffsetDateTime::parse(&stored.expires_at, &Rfc3339).map_err(|_| Error::Denied)?
                != OffsetDateTime::parse(&intent.expires_at, &Rfc3339).map_err(|_| Error::Denied)?
        {
            return Err(Error::Denied);
        }
        let current = self
            .authorize_human(
                &context,
                &intent.deployment,
                &policy,
                human::CAPABILITY_ID,
                "read_intent",
            )
            .await?;
        if current != principal {
            return Err(Error::Denied);
        }
        let parameters = management
            .pending_approval_parameters_async(operation_id)
            .await?;
        let status = match stored.status {
            approval::ReadResponseStatus::Pending => human::IntentStatus::Pending,
            approval::ReadResponseStatus::Approved => human::IntentStatus::Approved,
            approval::ReadResponseStatus::Rejected => human::IntentStatus::Rejected,
            approval::ReadResponseStatus::Cancelled => human::IntentStatus::Cancelled,
            approval::ReadResponseStatus::Expired => human::IntentStatus::Expired,
        };
        Ok(human::ReadIntentResponse {
            audit_pending: management.audit_pending_async(operation_id).await?,
            operation_id: intent.operation_id,
            requester: intent.subject,
            deployment: intent.deployment,
            entry_id: entry.id,
            target_instance: entry.target_instance,
            capability: entry.capability,
            version: entry.version,
            operation: entry.operation,
            description: entry.description,
            intent_digest: intent.digest,
            expires_at: intent.expires_at,
            parameters_json: serde_json::to_string(&parameters)
                .map_err(|_| Error::Unavailable)?
                .parse()
                .map_err(|_| Error::Unavailable)?,
            status,
        })
    }
}
#[derive(Clone, Debug)]
pub struct HumanServiceProvider {
    pub management: Rc<Management>,
    pub authority: Rc<OperatorsAuthority>,
}
impl human::ManagementHumanProvider for HumanServiceProvider {
    fn read_intent(
        &self,
        context: InvocationContext,
        request: human::ReadIntentRequest,
    ) -> NativeRequestFuture<human::ManagementHumanReadIntent> {
        let this = self.clone();
        Box::pin(async move {
            Ok(this
                .authority
                .read_approval_intent(context, &this.management, &request.operation_id)
                .await
                .map_err(|error| match error {
                    Error::Denied => human::ReadIntentError::PermissionDenied,
                    Error::NotFound => human::ReadIntentError::NotFound,
                    Error::Conflict => human::ReadIntentError::Conflict,
                    _ => human::ReadIntentError::Unavailable,
                }))
        })
    }
    fn decide(
        &self,
        context: InvocationContext,
        request: human::DecideRequest,
    ) -> NativeRequestFuture<human::ManagementHumanDecide> {
        let this = self.clone();
        Box::pin(async move {
            Ok(async {
                this.authority.approval_port()?;
                let (intent, entry) = this
                    .management
                    .pending_approval_intent_async(&request.operation_id)
                    .await?;
                let fixed = this
                    .authority
                    .policies
                    .get(&entry.id)
                    .ok_or(Error::Denied)?;
                let policy = EntryPolicy {
                    permission: "management.approval.decide".into(),
                    scope_kind: fixed.scope_kind.clone(),
                    scope_id: fixed.scope_id.clone(),
                };
                let human = this
                    .authority
                    .authorize_human(
                        &context,
                        &intent.deployment,
                        &policy,
                        human::CAPABILITY_ID,
                        "decide",
                    )
                    .await?;
                if intent.digest != request.intent_digest {
                    return Err(Error::Conflict);
                }
                let (decision, decision_name) = match request.decision {
                    human::Decision::Approved => {
                        (approval::DecideRequestDecision::Approved, "approved")
                    }
                    human::Decision::Rejected => {
                        (approval::DecideRequestDecision::Rejected, "rejected")
                    }
                };
                this.management
                    .audit_human(
                        &context,
                        &request.operation_id,
                        "human_attempt",
                        &human,
                        decision_name,
                    )
                    .await?;
                let decided = this
                    .authority
                    .decide_with_admission(
                        context.clone(),
                        &this.management,
                        &request.operation_id,
                        decision,
                        (human::CAPABILITY_ID, "decide"),
                    )
                    .await?;
                let _ = this
                    .management
                    .audit_human(
                        &context,
                        &request.operation_id,
                        "human_decided",
                        &human,
                        decision_name,
                    )
                    .await;
                this.authority.check_human_context(&context)?;
                let status = match decided.status {
                    approval::DecideResponseStatus::Approved => human::IntentStatus::Approved,
                    approval::DecideResponseStatus::Rejected => human::IntentStatus::Rejected,
                    approval::DecideResponseStatus::Cancelled => human::IntentStatus::Cancelled,
                    approval::DecideResponseStatus::Expired => human::IntentStatus::Expired,
                };
                Ok(human::DecideResponse {
                    audit_pending: this
                        .management
                        .audit_pending_async(&request.operation_id)
                        .await?,
                    operation_id: request.operation_id,
                    status,
                })
            }
            .await
            .map_err(|error| match error {
                Error::Denied => human::DecideError::PermissionDenied,
                Error::NotFound => human::DecideError::NotFound,
                Error::Conflict => human::DecideError::Conflict,
                _ => human::DecideError::Unavailable,
            }))
        })
    }
}
