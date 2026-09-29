use super::*;
use futures::{FutureExt as _, executor::block_on};
use lenso_kernel::CancellationToken;
use std::cell::Cell;

#[derive(Debug)]
struct Policy {
    allowed: Cell<bool>,
    subject: RefCell<String>,
    approved: RefCell<Option<Intent>>,
    seen: RefCell<Option<Intent>>,
    switch_subject_on_approval: Cell<bool>,
    now: Cell<Duration>,
    audit_failure: RefCell<Option<String>>,
    audit_events: RefCell<Vec<AuditEvent>>,
    revoke_on_dispatch_audit: Cell<bool>,
}

impl Authority for Policy {
    fn wall_now(&self) -> time::OffsetDateTime {
        time::OffsetDateTime::from_unix_timestamp(1_800_000_000).unwrap()
    }
    fn audit<'a>(
        &'a self,
        _: &'a InvocationContext,
        event: &'a AuditEvent,
    ) -> LocalBoxFuture<'a, Result<(), Error>> {
        async move {
            if self.audit_failure.borrow().as_deref() == Some(&event.phase) {
                return Err(Error::Unavailable);
            }
            if self.revoke_on_dispatch_audit.get() && event.phase == "dispatch" {
                self.allowed.set(false);
            }
            self.audit_events.borrow_mut().push(event.clone());
            Ok(())
        }
        .boxed_local()
    }
    fn now(&self) -> Duration {
        self.now.get()
    }
    fn authorize<'a>(
        &'a self,
        _: &'a InvocationContext,
        _: &'a str,
        _: &'a Entry,
        _: &'a str,
    ) -> LocalBoxFuture<'a, Result<Principal, Error>> {
        async move {
            if !self.allowed.get() {
                return Err(Error::Denied);
            }
            Ok(Principal {
                subject: self.subject.borrow().clone(),
            })
        }
        .boxed_local()
    }
    fn approval<'a>(
        &'a self,
        _: &'a InvocationContext,
        intent: &'a Intent,
    ) -> LocalBoxFuture<'a, Result<Approval, Error>> {
        async move {
            self.seen.replace(Some(intent.clone()));
            if self.switch_subject_on_approval.get() {
                self.subject.replace("bob".to_owned());
            }
            Ok(if self.approved.borrow().as_ref() == Some(intent) {
                Approval::Approved
            } else {
                Approval::Required
            })
        }
        .boxed_local()
    }
}

#[derive(Debug, Default)]
struct Notes {
    calls: Cell<usize>,
    lose_response: Cell<bool>,
    hang_after_commit: Cell<bool>,
    cancel_after_read: Cell<bool>,
    cancel_after_receipt: Cell<bool>,
    value: RefCell<Value>,
    receipts: RefCell<BTreeMap<String, (Value, String)>>,
}

impl Target for Notes {
    fn invoke<'a>(
        &'a self,
        context: InvocationContext,
        input: Value,
        _: Option<String>,
        id: Option<String>,
    ) -> LocalBoxFuture<'a, Result<Outcome, Error>> {
        async move {
            self.calls.set(self.calls.get() + 1);
            self.value.replace(input.clone());
            let receipt = id
                .as_ref()
                .map_or_else(|| "read-receipt".to_owned(), |id| format!("notes:{id}"));
            if let Some(id) = id {
                self.receipts
                    .borrow_mut()
                    .insert(id, (input.clone(), receipt.clone()));
            }
            if self.hang_after_commit.get() {
                futures::future::pending::<()>().await;
            }
            if self.lose_response.get() {
                return Err(Error::Unavailable);
            }
            if self.cancel_after_read.get() {
                context.cancellation().cancel();
            }
            Ok(Outcome::Committed {
                result: input,
                receipt,
            })
        }
        .boxed_local()
    }
    fn receipt<'a>(
        &'a self,
        context: InvocationContext,
        id: &'a str,
    ) -> LocalBoxFuture<'a, Result<Option<(Value, String)>, Error>> {
        async move {
            if self.cancel_after_receipt.get() {
                context.cancellation().cancel();
            }
            Ok(self.receipts.borrow().get(id).cloned())
        }
        .boxed_local()
    }
}

fn context() -> InvocationContext {
    InvocationContext::new(1, None, CancellationToken::new())
}

fn entry(approval: bool) -> Entry {
    Entry {
        id: "notes.set".to_owned(), target_instance: "example.notes/default".to_owned(), capability: "example.notes@1".to_owned(), version: "1.0.0".to_owned(), operation: "set".to_owned(),
        input_schema_json: r#"{"type":"object","additionalProperties":false,"properties":{"text":{"type":"string","maxLength":128}},"required":["text"]}"#.parse().unwrap(),
        description: "Set the reference note".to_owned(), effect: Effect::Write, requires_approval: approval,
    }
}

fn request(text: &str) -> InvokeRequest {
    InvokeRequest {
        entry_id: "notes.set".to_owned(),
        version: "1.0.0".to_owned(),
        input_json: serde_json::json!({"text":text})
            .to_string()
            .parse()
            .unwrap(),
        idempotency_key: Some("test-request".to_owned()),
        expected_revision: Some("0".to_owned()),
    }
}

fn setup(approval: bool) -> (tempfile::TempDir, Management, Rc<Policy>, Rc<Notes>) {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("operations.sqlite");
    Management::initialize_journal(&path).unwrap();
    let policy = Rc::new(Policy {
        allowed: Cell::new(true),
        subject: RefCell::new("alice".to_owned()),
        approved: RefCell::new(None),
        seen: RefCell::new(None),
        switch_subject_on_approval: Cell::new(false),
        now: Cell::new(Duration::ZERO),
        audit_failure: RefCell::new(None),
        audit_events: RefCell::new(Vec::new()),
        revoke_on_dispatch_audit: Cell::new(false),
    });
    let notes = Rc::new(Notes::default());
    let service = Management::open(
        &path,
        "test".to_owned(),
        "catalog-1".to_owned(),
        vec![Binding {
            entry: entry(approval),
            target: notes.clone(),
        }],
        policy.clone(),
    )
    .unwrap();
    (directory, service, policy, notes)
}

#[test]
fn principal_switch_while_approval_waits_cannot_execute_the_original_subjects_intent() {
    block_on(async {
        let (_directory, service, policy, notes) = setup(true);
        service
            .invoke(context(), request("bound to alice"))
            .await
            .unwrap();
        policy.approved.replace(policy.seen.borrow().clone());
        policy.switch_subject_on_approval.set(true);
        assert_eq!(
            service
                .invoke(context(), request("bound to alice"))
                .await
                .unwrap_err(),
            Error::Denied
        );
        assert_eq!(notes.calls.get(), 0);
    });
}

#[test]
fn cancelled_or_expired_context_does_not_dispatch() {
    block_on(async {
        let (_directory, service, _, notes) = setup(false);
        let cancelled = context();
        cancelled.cancellation().cancel();
        assert_eq!(
            service
                .invoke(cancelled, request("cancelled"))
                .await
                .unwrap_err(),
            Error::Cancelled
        );
        let expired = InvocationContext::new(2, Some(Duration::ZERO), CancellationToken::new());
        assert_eq!(
            service
                .invoke(expired, request("expired"))
                .await
                .unwrap_err(),
            Error::Expired
        );
        assert_eq!(notes.calls.get(), 0);
    });
}

#[test]
fn exclusive_journal_owner_prevents_recovery_of_active_dispatch_and_abort_is_scoped() {
    block_on(async {
        let (directory, service, policy, notes) = setup(false);
        notes.hang_after_commit.set(true);
        let caller = context();
        let mut pending = Box::pin(service.invoke(caller.clone(), request("a")));
        assert!(pending.as_mut().now_or_never().is_none());
        let id = notes.receipts.borrow().keys().next().unwrap().clone();
        let second = Management::open(
            &directory.path().join("operations.sqlite"),
            "test".to_owned(),
            "catalog-1".to_owned(),
            vec![Binding {
                entry: entry(false),
                target: notes.clone(),
            }],
            policy.clone(),
        );
        assert_eq!(second.unwrap_err(), Error::Unavailable);
        assert_eq!(
            service.status(context(), &id).await.unwrap().state,
            InvocationState::Executing
        );
        caller.cancellation().cancel();
        notes.hang_after_commit.set(false);
        let mut other = request("b");
        other.idempotency_key = Some("request-b".to_owned());
        assert_eq!(
            service.invoke(context(), other).await.unwrap().state,
            InvocationState::Succeeded
        );
        drop(pending);
        assert_eq!(
            service.invoke(context(), request("a")).await.unwrap().state,
            InvocationState::Unknown
        );
        assert_eq!(notes.calls.get(), 2);
        drop(service);
        let reopened = Management::open(
            &directory.path().join("operations.sqlite"),
            "test".to_owned(),
            "catalog-1".to_owned(),
            vec![Binding {
                entry: entry(false),
                target: notes.clone(),
            }],
            policy,
        )
        .unwrap();
        assert_eq!(
            reopened.status(context(), &id).await.unwrap().state,
            InvocationState::Succeeded
        );
        assert_eq!(notes.calls.get(), 2);
    });
}

#[test]
fn approval_binds_original_input_and_revoked_permissions_remain_denied() {
    block_on(async {
        let (_directory, service, policy, notes) = setup(true);
        let pending = service.invoke(context(), request("first")).await.unwrap();
        assert_eq!(pending.state, InvocationState::PendingApproval);
        assert_eq!(notes.calls.get(), 0);
        policy.approved.replace(policy.seen.borrow().clone());
        assert_eq!(
            service
                .invoke(context(), request("changed"))
                .await
                .unwrap_err(),
            Error::Conflict
        );
        policy.allowed.set(false);
        assert_eq!(
            service
                .invoke(context(), request("first"))
                .await
                .unwrap_err(),
            Error::Denied
        );
        assert!(
            service
                .catalog(&context())
                .await
                .unwrap()
                .entries
                .is_empty()
        );
        policy.allowed.set(true);
        let result = service.invoke(context(), request("first")).await.unwrap();
        assert_eq!(result.state, InvocationState::Succeeded);
        assert_eq!(notes.calls.get(), 1);
        assert_eq!(
            service.invoke(context(), request("first")).await.unwrap(),
            result
        );
        assert_eq!(notes.calls.get(), 1);
    });
}

#[test]
fn lost_commit_response_is_unknown_and_receipt_recovery_does_not_replay() {
    block_on(async {
        let (_directory, service, _, notes) = setup(false);
        notes.lose_response.set(true);
        let unknown = service
            .invoke(context(), request("committed"))
            .await
            .unwrap();
        assert_eq!(unknown.state, InvocationState::Unknown);
        assert_eq!(
            service
                .invoke(context(), request("committed"))
                .await
                .unwrap()
                .state,
            InvocationState::Unknown
        );
        assert_eq!(notes.calls.get(), 1);
        let result = service
            .status(context(), unknown.operation_id.as_deref().unwrap())
            .await
            .unwrap();
        assert_eq!(result.state, InvocationState::Succeeded);
        assert!(result.receipt.unwrap().starts_with("notes:"));
        assert_eq!(notes.calls.get(), 1);
    });
}

#[test]
fn target_commit_survives_manager_restart_and_cannot_be_queried_by_another_subject() {
    block_on(async {
        let (directory, service, policy, notes) = setup(false);
        notes.lose_response.set(true);
        let unknown = service.invoke(context(), request("durable")).await.unwrap();
        let id = unknown.operation_id.as_deref().unwrap();
        drop(service);
        let restarted = Management::open(
            &directory.path().join("operations.sqlite"),
            "test".to_owned(),
            "catalog-1".to_owned(),
            vec![Binding {
                entry: entry(false),
                target: notes.clone(),
            }],
            policy.clone(),
        )
        .unwrap();
        policy.subject.replace("bob".to_owned());
        assert_eq!(
            restarted.status(context(), id).await.unwrap_err(),
            Error::Denied
        );
        policy.subject.replace("alice".to_owned());
        assert_eq!(
            restarted.status(context(), id).await.unwrap().state,
            InvocationState::Succeeded
        );
        assert_eq!(notes.calls.get(), 1);
    });
}

#[test]
fn invalid_or_hidden_operations_never_reach_the_target_and_storage_never_falls_back() {
    block_on(async {
        let (directory, service, policy, notes) = setup(false);
        let mut malformed = request("valid");
        malformed.input_json = r#"{"text":"valid","approved":true}"#.parse().unwrap();
        assert_eq!(
            service.invoke(context(), malformed).await.unwrap_err(),
            Error::InvalidInput
        );
        let mut hidden = request("valid");
        hidden.entry_id = "arbitrary.sql".to_owned();
        assert_eq!(
            service.invoke(context(), hidden).await.unwrap_err(),
            Error::NotFound
        );
        assert_eq!(notes.calls.get(), 0);
        assert_eq!(
            Management::open(
                &directory.path().join("missing.sqlite"),
                "test".to_owned(),
                "1".to_owned(),
                vec![],
                policy
            )
            .unwrap_err(),
            Error::Unavailable
        );
    });
}

#[test]
fn schema_or_target_changes_invalidate_receipt_recovery_for_the_old_entry() {
    block_on(async {
        let (directory, service, policy, notes) = setup(false);
        notes.lose_response.set(true);
        let unknown = service.invoke(context(), request("first")).await.unwrap();
        drop(service);
        let mut moved = entry(false);
        moved.target_instance = "example.notes/second".to_owned();
        let changed = Management::open(
            &directory.path().join("operations.sqlite"),
            "test".to_owned(),
            "catalog-2".to_owned(),
            vec![Binding {
                entry: moved,
                target: notes,
            }],
            policy,
        )
        .unwrap();
        assert_eq!(
            changed
                .status(context(), unknown.operation_id.as_deref().unwrap())
                .await
                .unwrap_err(),
            Error::Conflict
        );
    });
}

#[test]
fn generated_capability_endpoint_preserves_structured_denial_and_operation_state() {
    use lenso_kernel::RequestCapability as _;
    block_on(async {
        let (_directory, service, policy, notes) = setup(false);
        let endpoint = contract::ManagementEndpoint::new(ServiceProvider(Rc::new(service)));
        let result = contract::ManagementInvoke::invoke_native(
            &endpoint,
            contract::INVOKE_OPERATION,
            request("bound"),
            context(),
        )
        .await
        .unwrap()
        .unwrap();
        assert_eq!(result.state, InvocationState::Succeeded);
        let wire = contract::encode_invoke_response(&result).unwrap();
        assert_eq!(contract::decode_invoke_response(&wire).unwrap(), result);
        policy.allowed.set(false);
        assert_eq!(
            contract::ManagementInvoke::invoke_native(
                &endpoint,
                contract::INVOKE_OPERATION,
                request("bound"),
                context()
            )
            .await
            .unwrap()
            .unwrap_err(),
            contract::InvokeError::PermissionDenied
        );
        assert_eq!(notes.calls.get(), 1);
    });
}

#[test]
fn audit_outbox_blocks_before_dispatch_and_recovers_after_commit_without_replay() {
    block_on(async {
        let (directory, service, policy, notes) = setup(false);
        policy.audit_failure.replace(Some("dispatch".into()));
        assert_eq!(
            service
                .invoke(context(), request("audited"))
                .await
                .unwrap_err(),
            Error::Unavailable
        );
        assert_eq!(notes.calls.get(), 0);
        policy.audit_failure.replace(Some("completed".into()));
        let result = service.invoke(context(), request("audited")).await.unwrap();
        assert_eq!(result.state, InvocationState::Succeeded);
        assert!(result.audit_pending);
        let id = result.operation_id.unwrap();
        assert_eq!(notes.calls.get(), 1);
        drop(service);
        policy.audit_failure.replace(None);
        let reopened = Management::open(
            &directory.path().join("operations.sqlite"),
            "test".into(),
            "catalog-1".into(),
            vec![Binding {
                entry: entry(false),
                target: notes.clone(),
            }],
            policy.clone(),
        )
        .unwrap();
        let recovered = reopened.status(context(), &id).await.unwrap();
        assert_eq!(recovered.state, InvocationState::Succeeded);
        assert!(!recovered.audit_pending);
        reopened
            .invoke(context(), request("audited"))
            .await
            .unwrap();
        assert_eq!(notes.calls.get(), 1);
        let events = policy.audit_events.borrow();
        assert_eq!(
            events
                .iter()
                .filter(|event| event.phase == "attempt")
                .count(),
            1
        );
        assert_eq!(
            events
                .iter()
                .filter(|event| event.phase == "completed")
                .count(),
            1
        );
        assert!(
            events
                .iter()
                .all(|event| !serde_json::to_string(event).unwrap().contains("audited"))
        );
    });
}

#[test]
fn revocation_during_dispatch_audit_blocks_target() {
    block_on(async {
        let (_directory, service, policy, notes) = setup(false);
        policy.revoke_on_dispatch_audit.set(true);
        assert_eq!(
            service
                .invoke(context(), request("revoked while recording"))
                .await
                .unwrap_err(),
            Error::Denied
        );
        assert_eq!(notes.calls.get(), 0);
    });
}

#[test]
fn late_read_and_receipt_do_not_escape_the_original_cancellation_scope() {
    block_on(async {
        let (directory, service, policy, notes) = setup(false);
        drop(service);
        let mut read = entry(false);
        read.effect = Effect::Read;
        let service = Management::open(
            &directory.path().join("operations.sqlite"),
            "test".into(),
            "catalog-1".into(),
            vec![Binding {
                entry: read,
                target: notes.clone(),
            }],
            policy.clone(),
        )
        .unwrap();
        notes.cancel_after_read.set(true);
        assert_eq!(
            service
                .invoke(context(), request("read"))
                .await
                .unwrap_err(),
            Error::Cancelled
        );
        drop(service);
        notes.cancel_after_read.set(false);
        notes.lose_response.set(true);
        let service = Management::open(
            &directory.path().join("operations.sqlite"),
            "test".into(),
            "catalog-1".into(),
            vec![Binding {
                entry: entry(false),
                target: notes.clone(),
            }],
            policy,
        )
        .unwrap();
        let result = service.invoke(context(), request("write")).await.unwrap();
        let id = result.operation_id.unwrap();
        assert_eq!(result.state, InvocationState::Unknown);
        notes.cancel_after_receipt.set(true);
        assert_eq!(
            service.status(context(), &id).await.unwrap_err(),
            Error::Cancelled
        );
        assert_eq!(
            service.load(&id).unwrap().response.state,
            InvocationState::Unknown
        );
        notes.cancel_after_receipt.set(false);
        assert_eq!(
            service.status(context(), &id).await.unwrap().state,
            InvocationState::Succeeded
        );
    });
}

#[test]
fn intent_times_use_owner_storage_precision_before_digesting() {
    let nanoseconds =
        time::OffsetDateTime::from_unix_timestamp_nanos(1_800_000_000_123_456_789).unwrap();
    let normalized = parse_time(&format_time(nanoseconds).unwrap()).unwrap();
    assert_eq!(normalized.nanosecond(), 123_456_000);
    assert_eq!(
        format_time(normalized).unwrap(),
        format_time(nanoseconds).unwrap()
    );
    assert_eq!(normalized.unix_timestamp(), nanoseconds.unix_timestamp());
}

#[test]
fn pending_approval_retains_the_reviewed_parameters_across_restart() {
    block_on(async {
        let (directory, service, policy, notes) = setup(true);
        let pending = service
            .invoke(context(), request("reviewed text"))
            .await
            .unwrap();
        let operation_id = pending.operation_id.unwrap();
        drop(service);
        let reopened = Management::open(
            &directory.path().join("operations.sqlite"),
            "test".into(),
            "catalog-1".into(),
            vec![Binding {
                entry: entry(true),
                target: notes,
            }],
            policy,
        )
        .unwrap();
        let parameters = reopened.pending_approval_parameters(&operation_id).unwrap();
        assert_eq!(
            parameters.input,
            serde_json::json!({"text":"reviewed text"})
        );
        assert_eq!(parameters.expected_revision.as_deref(), Some("0"));
        let wrong = native::ProviderSlot::new("other-deployment".into()).unwrap();
        assert_eq!(wrong.install(Rc::new(reopened)), Err(Error::Conflict));
    });
}
