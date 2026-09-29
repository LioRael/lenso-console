//! Host-bound operators authority. Business and identity facts remain with their owners.

mod human;
pub use human::HumanServiceProvider;
mod pat;
pub use pat::HumanPatServiceProvider;

mod legacy_import;
pub use legacy_import::LegacyImportPlan;

use futures::{FutureExt as _, future::LocalBoxFuture};
use lenso_auth_sdk::{
    ActorAssertion, ActorProjectionError, AssertionValidationError, FixedClock, TypedActor,
    credential::{CredentialBinding, ManagementCredentialCeiling},
    realm::RealmAssertionVerifier,
};
use lenso_capability_access_control as access;
use lenso_capability_audit_log as audit;
use lenso_capability_business_approval as approval;
use lenso_capability_credential_state as credentials;
use lenso_kernel::InvocationContext;
use lenso_management_core::{
    Approval, AuditEvent, Authority, Entry, Error, Intent, Management, Principal,
};
use rusqlite::{Connection, OptionalExtension, params};
use std::{cell::RefCell, collections::BTreeMap, path::Path, rc::Rc, time::Duration};
use time::{OffsetDateTime, format_description::well_known::Rfc3339};

/// The Host supplies the same wall and monotonic clocks used by its Driver.
pub trait Clock: std::fmt::Debug {
    fn monotonic(&self) -> Duration;
    fn wall(&self) -> OffsetDateTime;
}

/// Exact entry metadata accepted by the Host, never derived from invocation arguments.
#[derive(Clone, Debug)]
pub struct EntryPolicy {
    pub permission: String,
    pub scope_kind: String,
    pub scope_id: String,
}

#[derive(Debug)]
pub struct QualificationStore(RefCell<Connection>);
impl QualificationStore {
    pub fn initialize(path: &Path) -> Result<(), Error> {
        Connection::open(path).map_err(|_|Error::Unavailable)?.execute_batch("BEGIN IMMEDIATE; CREATE TABLE qualified_operators(deployment TEXT NOT NULL,subject TEXT NOT NULL,PRIMARY KEY(deployment,subject)); PRAGMA user_version=1; COMMIT;").map_err(|_|Error::Unavailable)
    }
    pub fn open(path: &Path) -> Result<Self, Error> {
        let connection =
            Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE)
                .map_err(|_| Error::Unavailable)?;
        let version: i64 = connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .map_err(|_| Error::Unavailable)?;
        if version != 1 {
            return Err(Error::Unavailable);
        }
        Ok(Self(RefCell::new(connection)))
    }
    /// Explicit local operator setup; network clients cannot bootstrap themselves.
    pub fn grant(&self, deployment: &str, subject: &str) -> Result<(), Error> {
        if deployment.is_empty()
            || subject.is_empty()
            || deployment.len() > 128
            || subject.len() > 256
        {
            return Err(Error::InvalidInput);
        }
        self.0
            .borrow()
            .execute(
                "INSERT OR IGNORE INTO qualified_operators VALUES(?1,?2)",
                params![deployment, subject],
            )
            .map(|_| ())
            .map_err(|_| Error::Unavailable)
    }
    pub fn revoke(&self, deployment: &str, subject: &str) -> Result<(), Error> {
        self.0
            .borrow()
            .execute(
                "DELETE FROM qualified_operators WHERE deployment=?1 AND subject=?2",
                params![deployment, subject],
            )
            .map(|_| ())
            .map_err(|_| Error::Unavailable)
    }
    fn contains(&self, deployment: &str, subject: &str) -> Result<bool, Error> {
        self.0
            .borrow()
            .query_row(
                "SELECT 1 FROM qualified_operators WHERE deployment=?1 AND subject=?2",
                params![deployment, subject],
                |_| Ok(true),
            )
            .optional()
            .map(|found| found.unwrap_or(false))
            .map_err(|_| Error::Unavailable)
    }
}

#[derive(Debug)]
pub struct OwnerPorts {
    pub credential_state: credentials::CredentialStateClient,
    pub access: access::AccessControlClient,
    pub approval: approval::BusinessApprovalClient,
    pub audit: audit::AuditLogClient,
}

#[derive(Debug)]
pub struct OperatorsAuthority {
    verifier: RealmAssertionVerifier,
    qualification: Rc<QualificationStore>,
    policies: BTreeMap<String, EntryPolicy>,
    ports: OwnerPorts,
    clock: Rc<dyn Clock>,
}

struct User(String, CredentialBinding, ManagementCredentialCeiling);
impl TypedActor for User {
    fn from_assertion(assertion: &ActorAssertion) -> Result<Self, ActorProjectionError> {
        if assertion.actor_kind() != "user" {
            return Err(ActorProjectionError::UnexpectedActorKind {
                expected: "user".into(),
                actual: assertion.actor_kind().into(),
            });
        }
        let binding = CredentialBinding::from_assertion(assertion)
            .map_err(|_| AssertionValidationError::InvalidProof)?;
        let ceiling = ManagementCredentialCeiling::from_assertion(assertion)
            .map_err(|_| AssertionValidationError::InvalidProof)?;
        Ok(Self(assertion.subject().into(), binding, ceiling))
    }
}
impl OperatorsAuthority {
    pub fn new(
        verifier: RealmAssertionVerifier,
        qualification: Rc<QualificationStore>,
        policies: BTreeMap<String, EntryPolicy>,
        ports: OwnerPorts,
        clock: Rc<dyn Clock>,
    ) -> Result<Self, Error> {
        if verifier.realm() != "operators"
            || policies.is_empty()
            || policies.len() > 256
            || policies.values().any(|policy| {
                [&policy.permission, &policy.scope_kind, &policy.scope_id]
                    .iter()
                    .any(|label| label.is_empty() || label.len() > 256 || label.contains('*'))
            })
        {
            return Err(Error::InvalidInput);
        }
        Ok(Self {
            verifier,
            qualification,
            policies,
            ports,
            clock,
        })
    }
    async fn current_user(
        &self,
        context: &InvocationContext,
        deployment: &str,
        policy: &EntryPolicy,
        capability: &str,
        operation: &str,
    ) -> Result<User, Error> {
        let now = self.clock.wall();
        let user = self
            .verifier
            .project_context::<User>(context, capability, operation, &FixedClock::new(now))
            .map_err(|_| Error::Denied)?;
        if !self.qualification.contains(deployment, &user.0)? {
            return Err(Error::Denied);
        }
        let binding = &user.1;
        let signed = &user.2;
        let live = self
            .ports
            .credential_state
            .inspect_with_context(
                context.clone(),
                credentials::InspectRequest {
                    credential_id: binding.credential_id.clone(),
                    session_id: binding.session_id.clone(),
                },
            )
            .await
            .map_err(|_| Error::Denied)?;
        if !live.active
            || live.subject != user.0
            || live.actor_kind != "user"
            || live.credential_id != binding.credential_id
            || live.session_id != binding.session_id
            || OffsetDateTime::parse(&live.expires_at, &Rfc3339).map_err(|_| Error::Denied)? <= now
            || !live
                .audience
                .iter()
                .any(|audience| audience == &lenso_auth_sdk::audience(capability, operation))
        {
            return Err(Error::Denied);
        }
        let current =
            ManagementCredentialCeiling::from_claims(&live.claims).map_err(|_| Error::Denied)?;
        if !signed.allows(
            deployment,
            &policy.permission,
            &policy.scope_kind,
            &policy.scope_id,
        ) || !current.allows(
            deployment,
            &policy.permission,
            &policy.scope_kind,
            &policy.scope_id,
        ) {
            return Err(Error::Denied);
        }
        let permission = self
            .ports
            .access
            .check_permission_with_context(
                context.clone(),
                access::CheckPermissionRequest {
                    subject: user.0.clone(),
                    scope: access::CheckPermissionRequestScope {
                        kind: policy.scope_kind.clone(),
                        id: policy.scope_id.clone(),
                    },
                    permission: policy.permission.clone(),
                },
            )
            .await
            .map_err(|_| Error::Denied)?;
        if !permission.allowed {
            return Err(Error::Denied);
        }
        Ok(user)
    }
    /// A human route/CLI calls this server guard; Agent tools never expose it.
    pub async fn decide(
        &self,
        context: InvocationContext,
        management: &Management,
        operation_id: &str,
        decision: approval::DecideRequestDecision,
    ) -> Result<approval::DecideResponse, Error> {
        self.decide_with_admission(
            context,
            management,
            operation_id,
            decision,
            ("lenso.business-approval@1", "decide"),
        )
        .await
    }
    async fn decide_with_admission(
        &self,
        context: InvocationContext,
        management: &Management,
        operation_id: &str,
        decision: approval::DecideRequestDecision,
        admission: (&str, &str),
    ) -> Result<approval::DecideResponse, Error> {
        let (intent, entry) = management.pending_approval_intent(operation_id)?;
        let entry_policy = self.policies.get(&entry.id).ok_or(Error::Denied)?;
        let policy = EntryPolicy {
            permission: "management.approval.decide".into(),
            scope_kind: entry_policy.scope_kind.clone(),
            scope_id: entry_policy.scope_id.clone(),
        };
        let human = self
            .current_user(
                &context,
                &intent.deployment,
                &policy,
                admission.0,
                admission.1,
            )
            .await?;
        if human.0 == intent.subject
            || self.clock.wall()
                >= OffsetDateTime::parse(&intent.expires_at, &Rfc3339).map_err(|_| Error::Denied)?
        {
            return Err(Error::Denied);
        }
        let stored = self
            .ports
            .approval
            .read_with_context(
                context.clone(),
                approval::ReadRequest {
                    request_id: operation_id.into(),
                },
            )
            .await
            .map_err(|_| Error::Denied)?;
        if stored.intent_digest.as_deref() != Some(&intent.digest)
            || stored.requested_by != intent.subject
            || stored.subject.kind != "management-operation"
            || stored.subject.id != operation_id
            || stored.status != approval::ReadResponseStatus::Pending
        {
            return Err(Error::Denied);
        }
        let current = self
            .current_user(
                &context,
                &intent.deployment,
                &policy,
                admission.0,
                admission.1,
            )
            .await?;
        if current.0 != human.0 {
            return Err(Error::Denied);
        }
        let approval_user = self
            .current_user(
                &context,
                &intent.deployment,
                &policy,
                "lenso.business-approval@1",
                "decide",
            )
            .await?;
        if approval_user.0 != human.0 {
            return Err(Error::Denied);
        }
        self.check_human_context(&context)?;
        self.ports
            .approval
            .decide_with_context(
                context,
                approval::DecideRequest {
                    decided_by: human.0,
                    decision,
                    evidence_ref: format!("management-intent:{}:{}", operation_id, intent.digest),
                    reason: None,
                    request_id: operation_id.into(),
                },
            )
            .await
            .map_err(|_| Error::Denied)
    }
}
impl Authority for OperatorsAuthority {
    fn now(&self) -> Duration {
        self.clock.monotonic()
    }
    fn wall_now(&self) -> OffsetDateTime {
        self.clock.wall()
    }
    fn authorize<'a>(
        &'a self,
        context: &'a InvocationContext,
        deployment: &'a str,
        entry: &'a Entry,
        operation: &'a str,
    ) -> LocalBoxFuture<'a, Result<Principal, Error>> {
        async move {
            if !matches!(operation, "catalog" | "invoke" | "status") {
                return Err(Error::Denied);
            }
            let policy = self.policies.get(&entry.id).ok_or(Error::Denied)?;
            let user = self
                .current_user(context, deployment, policy, "lenso.management@1", operation)
                .await?;
            Ok(Principal { subject: user.0 })
        }
        .boxed_local()
    }
    fn approval<'a>(
        &'a self,
        context: &'a InvocationContext,
        intent: &'a Intent,
    ) -> LocalBoxFuture<'a, Result<Approval, Error>> {
        async move {
            let existing = match self
                .ports
                .approval
                .read_with_context(
                    context.clone(),
                    approval::ReadRequest {
                        request_id: intent.operation_id.clone(),
                    },
                )
                .await
            {
                Ok(request) => request,
                Err(approval::BusinessApprovalReadInvocationError::Domain(
                    approval::ReadError::RequestNotFound,
                )) => {
                    self.ports
                        .approval
                        .request_with_context(
                            context.clone(),
                            approval::RequestRequest {
                                approval_kind: "management-operation".into(),
                                expires_at: intent
                                    .expires_at
                                    .parse()
                                    .map_err(|_| Error::Unavailable)?,
                                idempotency_key: intent.operation_id.clone(),
                                intent_digest: Some(intent.digest.clone()),
                                request_id: intent.operation_id.clone(),
                                requested_by: intent.subject.clone(),
                                subject: approval::RequestRequestSubject {
                                    kind: "management-operation".into(),
                                    id: intent.operation_id.clone(),
                                },
                            },
                        )
                        .await
                        .map_err(|_| Error::Unavailable)?;
                    return Ok(Approval::Required);
                }
                Err(_) => return Err(Error::Unavailable),
            };
            if existing.intent_digest.as_deref() != Some(&intent.digest)
                || existing.subject.kind != "management-operation"
                || existing.subject.id != intent.operation_id
                || existing.requested_by != intent.subject
                || existing.approval_kind != "management-operation"
                || OffsetDateTime::parse(&existing.expires_at, &Rfc3339)
                    .map_err(|_| Error::Denied)?
                    != OffsetDateTime::parse(&intent.expires_at, &Rfc3339)
                        .map_err(|_| Error::Denied)?
                || existing.idempotency_key != intent.operation_id
            {
                return Err(Error::Denied);
            }
            Ok(match existing.status {
                approval::ReadResponseStatus::Pending => Approval::Required,
                approval::ReadResponseStatus::Approved
                    if existing.terminal_caller_instance.as_deref()
                        == Some(existing.requester_instance.as_str())
                        && existing
                            .terminal_actor
                            .as_deref()
                            .is_some_and(|actor| actor != intent.subject)
                        && self.clock.wall()
                            < OffsetDateTime::parse(&intent.expires_at, &Rfc3339)
                                .map_err(|_| Error::Denied)? =>
                {
                    Approval::Approved
                }
                _ => Approval::Denied,
            })
        }
        .boxed_local()
    }
    fn audit<'a>(
        &'a self,
        context: &'a InvocationContext,
        event: &'a AuditEvent,
    ) -> LocalBoxFuture<'a, Result<(), Error>> {
        async move {
            let metadata = BTreeMap::from([
                ("decision".into(), serde_json::json!(event.decision)),
                (
                    "intent_digest".into(),
                    serde_json::json!(event.intent.digest),
                ),
                ("entry_id".into(), serde_json::json!(event.intent.entry_id)),
                (
                    "state".into(),
                    serde_json::to_value(&event.state).map_err(|_| Error::Unavailable)?,
                ),
                ("receipt".into(), serde_json::json!(event.receipt)),
            ]);
            self.ports
                .audit
                .append_event_with_context(
                    context.clone(),
                    audit::AppendEventRequest {
                        action: format!(
                            "management.{}",
                            event.phase.split(':').next().ok_or(Error::Unavailable)?
                        ),
                        actor: audit::AppendEventRequestActor {
                            id: Some(
                                event
                                    .actor
                                    .clone()
                                    .unwrap_or_else(|| event.intent.subject.clone()),
                            ),
                            kind: "user".into(),
                            display: None,
                        },
                        event_name: "management-operation".into(),
                        idempotency_key: Some(format!(
                            "{}:{}",
                            event.intent.operation_id, event.phase
                        )),
                        metadata,
                        occurred_at: event.occurred_at.parse().map_err(|_| Error::Unavailable)?,
                        outcome: if event.phase.starts_with("human_decided:")
                            && event.decision.as_deref() == Some("rejected")
                        {
                            audit::AppendEventRequestOutcome::Denied
                        } else if matches!(
                            event.state,
                            lenso_management_core::InvocationState::Unknown
                                | lenso_management_core::InvocationState::Failed
                                | lenso_management_core::InvocationState::Cancelled
                        ) {
                            audit::AppendEventRequestOutcome::Failure
                        } else {
                            audit::AppendEventRequestOutcome::Success
                        },
                        reason: None,
                        request_context: Some(audit::AppendEventRequestRequestContext {
                            causation_id: None,
                            correlation_id: Some(event.intent.operation_id.clone()),
                            request_id: Some(event.intent.operation_id.clone()),
                            story_id: None,
                        }),
                        resource: Some(audit::AppendEventRequestResource {
                            display: None,
                            id: event.intent.operation_id.clone(),
                            resource_type: "management-operation".into(),
                        }),
                        scope: Some(audit::AppendEventRequestScope {
                            display: None,
                            id: event.intent.deployment.clone(),
                            module: None,
                            scope_type: "deployment".into(),
                        }),
                        severity: audit::AppendEventRequestSeverity::Info,
                    },
                )
                .await
                .map_err(|_| Error::Unavailable)?;
            Ok(())
        }
        .boxed_local()
    }
}

#[cfg(test)]
mod tests;
