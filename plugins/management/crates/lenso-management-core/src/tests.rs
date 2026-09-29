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
}

impl Authority for Policy {
    fn authorize<'a>(
        &'a self,
        _: &'a InvocationContext,
        _: &'a str,
        _: &'a Entry,
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
    value: RefCell<Value>,
    receipts: RefCell<BTreeMap<String, (Value, String)>>,
}

impl Target for Notes {
    fn invoke<'a>(
        &'a self,
        _: InvocationContext,
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
            if self.lose_response.get() {
                return Err(Error::Unavailable);
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
        _: InvocationContext,
        id: &'a str,
    ) -> LocalBoxFuture<'a, Result<Option<(Value, String)>, Error>> {
        async move { Ok(self.receipts.borrow().get(id).cloned()) }.boxed_local()
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
        let result = contract::ManagementInvoke::invoke_native(&endpoint,contract::INVOKE_OPERATION,request("bound"),context()).await.unwrap().unwrap();
        assert_eq!(result.state,InvocationState::Succeeded);
        let wire = contract::encode_invoke_response(&result).unwrap();
        assert_eq!(contract::decode_invoke_response(&wire).unwrap(),result);
        policy.allowed.set(false);
        assert_eq!(contract::ManagementInvoke::invoke_native(&endpoint,contract::INVOKE_OPERATION,request("bound"),context()).await.unwrap().unwrap_err(),contract::InvokeError::PermissionDenied);
        assert_eq!(notes.calls.get(),1);
    });
}
