//! Real security owners, exact generated ports and a durable controlled target.
use futures::{FutureExt as _, future::LocalBoxFuture};
use lenso_access_control_postgres_plugin::{AccessControlConfig, AccessControlOperator};
use lenso_app_plan::{
    AppComposition, CapabilityBinding, CapabilityEndpointPlan, CapabilityRequirementPlan,
    PluginInstancePlan, ResolvedAppPlan,
};
use lenso_audit_log_postgres_plugin::{AuditLogConfig, AuditLogOperator, AuditReadScope};
use lenso_auth_api_token_plugin::{
    ApiTokenAuthConfig, ApiTokenAuthOperator, IssueApiToken, IssuedApiToken, assertion_public_key,
};
use lenso_auth_sdk::{
    ActorAssertion, AuthOutcome, CredentialEvidence, audience, authenticate_request,
    credential::{
        CredentialBinding, MANAGEMENT_CEILING_CLAIM, ManagementCredentialCeiling,
        ManagementResourceScope,
    },
    decode_auth_response,
    realm::RealmAssertionVerifier,
};
use lenso_business_approval_postgres_plugin::{BusinessApprovalConfig, BusinessApprovalOperator};
use lenso_capability_access_control as access;
use lenso_capability_access_control_admin as admin;
use lenso_capability_access_control_directory as access_directory;
use lenso_capability_api_token_admin as token_admin;
use lenso_capability_audit_log as audit;
use lenso_capability_auth as auth;
use lenso_capability_business_approval as approval;
use lenso_capability_credential_state as credentials;
use lenso_capability_management_human::{self as human, ManagementHumanProvider as _};
use lenso_capability_secrets as secrets;
use lenso_kernel::{
    CancellationToken, InvocationContext, Kernel, NativeApp, NativeRequestEndpoint,
    NativeRequestFuture, RuntimeDriver, RuntimeFailure, ShutdownOutcome,
};
use lenso_management_authority::{
    Clock, EntryPolicy, HumanServiceProvider, OperatorsAuthority, OwnerPorts, QualificationStore,
};
use lenso_management_core::{
    Binding, Effect, Entry, Error, InvocationState, InvokeRequest, Management, Outcome, Target,
};
use lenso_native_adapter::{
    NativePluginFactory, NativePluginFactoryContext, NativePluginInstance, NativePluginRegistry,
};
use lenso_runner::TokioDriver;
use rusqlite::{Connection, OptionalExtension, params};
use serde_json::{Value, json};
use std::{
    cell::{Cell, RefCell},
    collections::BTreeMap,
    path::Path,
    rc::Rc,
    time::Duration,
};
use time::OffsetDateTime;

const CALLER: &str = "qualification.management/main";
const CALLER_PACKAGE: &str = "qualification.management";
const SECRETS_PACKAGE: &str = "qualification.secrets";
const ISSUER: &str = "qualification.operators";
const SIGNING: &str = "qualification-only-high-entropy-signing-value";
const PEPPER: &str = "qualification-only-high-entropy-pepper-value";
const DEPLOYMENT: &str = "qualification-native";
const SCOPE_KIND: &str = "management-deployment";

#[derive(Debug)]
struct CallerFactory;
impl NativePluginFactory for CallerFactory {
    fn package_id(&self) -> &'static str {
        CALLER_PACKAGE
    }
    fn instantiate(
        &self,
        _: NativePluginFactoryContext<'_>,
    ) -> Result<NativePluginInstance, RuntimeFailure> {
        Ok(NativePluginInstance::default())
    }
}

#[derive(Clone)]
struct SecretsFactory(BTreeMap<String, String>);
impl std::fmt::Debug for SecretsFactory {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_tuple("SecretsFactory")
            .field(&self.0.keys().collect::<Vec<_>>())
            .finish()
    }
}
impl NativePluginFactory for SecretsFactory {
    fn package_id(&self) -> &'static str {
        SECRETS_PACKAGE
    }
    fn instantiate(
        &self,
        _: NativePluginFactoryContext<'_>,
    ) -> Result<NativePluginInstance, RuntimeFailure> {
        Ok(NativePluginInstance::new(vec![
            Rc::new(secrets::SecretsEndpoint::new(self.clone())) as Rc<dyn NativeRequestEndpoint>,
        ]))
    }
}
impl secrets::SecretsProvider for SecretsFactory {
    fn resolve(
        &self,
        _: InvocationContext,
        request: secrets::ResolveRequest,
    ) -> NativeRequestFuture<secrets::Secrets> {
        let result = self
            .0
            .get(&request.reference)
            .cloned()
            .map(|value| secrets::ResolveResponse { value })
            .ok_or(secrets::ResolveError::UnknownReference);
        Box::pin(futures::future::ready(Ok(result)))
    }
}

#[derive(Debug)]
struct HostClock(TokioDriver);
impl Clock for HostClock {
    fn monotonic(&self) -> Duration {
        self.0.now()
    }
    fn wall(&self) -> OffsetDateTime {
        OffsetDateTime::now_utc()
    }
}

#[derive(Debug)]
struct Notes {
    connection: RefCell<Connection>,
    lose_response: Cell<bool>,
}
impl Notes {
    fn initialize(path: &Path) -> Self {
        let connection = Connection::open(path).unwrap();
        connection.execute_batch("CREATE TABLE notes(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL,revision INTEGER NOT NULL); INSERT INTO notes VALUES(1,'',0); CREATE TABLE receipts(operation_id TEXT PRIMARY KEY,result TEXT NOT NULL,receipt TEXT NOT NULL);").unwrap();
        Self {
            connection: RefCell::new(connection),
            lose_response: Cell::new(false),
        }
    }
    fn revision(&self) -> i64 {
        self.connection
            .borrow()
            .query_row("SELECT revision FROM notes WHERE id=1", [], |row| {
                row.get(0)
            })
            .unwrap()
    }
}
impl Target for Notes {
    fn invoke<'a>(
        &'a self,
        _: InvocationContext,
        input: Value,
        expected: Option<String>,
        id: Option<String>,
    ) -> LocalBoxFuture<'a, Result<Outcome, Error>> {
        async move {
            let id = id.ok_or(Error::InvalidInput)?;
            let mut connection = self.connection.borrow_mut();
            let transaction = connection.transaction().map_err(|_| Error::Unavailable)?;
            let revision: i64 = transaction
                .query_row("SELECT revision FROM notes WHERE id=1", [], |row| {
                    row.get(0)
                })
                .map_err(|_| Error::Unavailable)?;
            if expected.as_deref() != Some(revision.to_string().as_str()) {
                return Ok(Outcome::Failed);
            }
            let result = json!({"text":input["text"],"revision":revision+1});
            let receipt = format!("notes:{id}");
            transaction
                .execute(
                    "UPDATE notes SET value=?1,revision=revision+1 WHERE id=1",
                    [input["text"].as_str().ok_or(Error::InvalidInput)?],
                )
                .map_err(|_| Error::Unavailable)?;
            transaction
                .execute(
                    "INSERT INTO receipts VALUES(?1,?2,?3)",
                    params![id, result.to_string(), receipt],
                )
                .map_err(|_| Error::Unavailable)?;
            transaction.commit().map_err(|_| Error::Unavailable)?;
            if self.lose_response.replace(false) {
                return Err(Error::Unavailable);
            }
            Ok(Outcome::Committed { result, receipt })
        }
        .boxed_local()
    }
    fn receipt<'a>(
        &'a self,
        _: InvocationContext,
        id: &'a str,
    ) -> LocalBoxFuture<'a, Result<Option<(Value, String)>, Error>> {
        async move {
            let stored: Option<(String, String)> = self
                .connection
                .borrow()
                .query_row(
                    "SELECT result,receipt FROM receipts WHERE operation_id=?1",
                    [id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .optional()
                .map_err(|_| Error::Unavailable)?;
            stored
                .map(|(result, receipt)| {
                    serde_json::from_str(&result)
                        .map(|result| (result, receipt))
                        .map_err(|_| Error::Unavailable)
                })
                .transpose()
        }
        .boxed_local()
    }
}

fn entry() -> Entry {
    Entry{id:"notes.set".into(),target_instance:"qualification.notes/main".into(),capability:"qualification.notes@1".into(),version:"1.0.0".into(),operation:"set".into(),description:"Set a bounded qualification note".into(),effect:Effect::Write,requires_approval:true,input_schema_json:r#"{"type":"object","additionalProperties":false,"properties":{"text":{"type":"string","maxLength":128}},"required":["text"]}"#.parse().unwrap()}
}
fn request(key: &str, text: &str, revision: i64) -> InvokeRequest {
    InvokeRequest {
        entry_id: "notes.set".into(),
        version: "1.0.0".into(),
        input_json: json!({"text":text}).to_string().parse().unwrap(),
        idempotency_key: Some(key.into()),
        expected_revision: Some(revision.to_string()),
    }
}
fn ceiling() -> ManagementCredentialCeiling {
    ManagementCredentialCeiling {
        deployment: DEPLOYMENT.into(),
        permissions: vec![
            "notes.write".into(),
            "management.approval.read".into(),
            "management.approval.decide".into(),
        ],
        resource_scopes: vec![ManagementResourceScope {
            kind: SCOPE_KIND.into(),
            id: DEPLOYMENT.into(),
        }],
    }
}
async fn issue(
    operator: &ApiTokenAuthOperator,
    subject: &str,
    kind: &str,
    ceiling: ManagementCredentialCeiling,
) -> IssuedApiToken {
    let audiences = [
        ("lenso.management@1", "catalog"),
        ("lenso.management@1", "invoke"),
        ("lenso.management@1", "status"),
        ("lenso.business-approval@1", "decide"),
        (human::CAPABILITY_ID, human::READ_INTENT_OPERATION),
        (human::CAPABILITY_ID, human::DECIDE_OPERATION),
        (admin::CAPABILITY_ID, admin::CREATE_ROLE_OPERATION),
        (admin::CAPABILITY_ID, admin::SET_ROLE_PERMISSIONS_OPERATION),
        (admin::CAPABILITY_ID, admin::ASSIGN_ROLE_OPERATION),
        (admin::CAPABILITY_ID, admin::REVOKE_ROLE_OPERATION),
    ]
    .map(|(cap, op)| audience(cap, op))
    .to_vec();
    operator
        .issue(
            PEPPER.as_bytes(),
            IssueApiToken {
                subject: subject.into(),
                actor_kind: kind.into(),
                assurance: "api-token".into(),
                audience: audiences,
                claims: BTreeMap::from([(MANAGEMENT_CEILING_CLAIM.into(), json!(ceiling))]),
                expires_at: OffsetDateTime::now_utc() + time::Duration::hours(1),
            },
        )
        .await
        .unwrap()
}
async fn authenticate(app: &NativeApp, token: &IssuedApiToken) -> ActorAssertion {
    let response = app
        .invoke::<auth::Auth>(
            CALLER,
            auth::AUTHENTICATE_OPERATION,
            authenticate_request(Some(CredentialEvidence::new(
                "bearer",
                token.expose_secret(),
            ))),
        )
        .await
        .unwrap()
        .unwrap();
    let AuthOutcome::Authenticated(assertion) = decode_auth_response(response).unwrap() else {
        panic!("issued PAT authenticates")
    };
    assertion
}
fn context(app: &NativeApp, assertion: &ActorAssertion) -> InvocationContext {
    assertion
        .attach(app.invocation_context_after(Duration::from_secs(30), CancellationToken::new()))
        .unwrap()
}

fn plan(
    auth_schema: &str,
    access_schema: &str,
    approval_schema: &str,
    audit_writer: bool,
) -> ResolvedAppPlan {
    let mut caller = PluginInstancePlan::new(CALLER, CALLER_PACKAGE);
    let required = [
        (auth::CAPABILITY_ID, auth::DESCRIPTOR_VERSION),
        (credentials::CAPABILITY_ID, credentials::DESCRIPTOR_VERSION),
        (access::CAPABILITY_ID, access::DESCRIPTOR_VERSION),
        (admin::CAPABILITY_ID, admin::DESCRIPTOR_VERSION),
        (approval::CAPABILITY_ID, approval::DESCRIPTOR_VERSION),
        (audit::CAPABILITY_ID, audit::DESCRIPTOR_VERSION),
    ];
    for (cap, version) in required {
        caller = caller.with_requirement(CapabilityRequirementPlan::one(cap, version));
    }
    let secret = PluginInstancePlan::new("secrets", SECRETS_PACKAGE).with_capability(
        CapabilityEndpointPlan::new(
            secrets::CAPABILITY_ID,
            secrets::DESCRIPTOR_VERSION,
            [secrets::RESOLVE_OPERATION],
        ),
    );
    let auth_config = ApiTokenAuthConfig::new(
        auth_schema,
        ISSUER,
        assertion_public_key(SIGNING),
        "auth/database",
        "auth/signing",
        "auth/pepper",
        60,
    )
    .unwrap()
    .with_credential_state_callers(vec![CALLER.into()])
    .unwrap();
    let access_config = AccessControlConfig::new(
        access_schema,
        "access/database",
        ISSUER,
        assertion_public_key(SIGNING),
        vec![CALLER.into()],
    )
    .unwrap();
    let approval_config = BusinessApprovalConfig::new(
        approval_schema,
        "approval/database",
        vec![CALLER.into()],
        vec![CALLER.into()],
        vec![CALLER.into()],
    )
    .unwrap();
    let audit_config = AuditLogConfig::new(
        "audit/database",
        vec![if audit_writer {
            CALLER.into()
        } else {
            "qualification.denied/main".into()
        }],
        vec![CALLER.into()],
    )
    .unwrap()
    .with_reader_scopes(
        CALLER,
        vec![AuditReadScope {
            kind: "deployment".into(),
            id: DEPLOYMENT.into(),
        }],
    )
    .unwrap();
    let owner = |key: &str, package: &str, config: String| {
        PluginInstancePlan::new(key, package)
            .with_configuration(config)
            .with_requirement(CapabilityRequirementPlan::one(
                secrets::CAPABILITY_ID,
                secrets::DESCRIPTOR_VERSION,
            ))
    };
    let auth = owner(
        "auth",
        lenso_auth_api_token_plugin::PACKAGE_ID,
        serde_json::to_string(&auth_config).unwrap(),
    )
    .with_capability(CapabilityEndpointPlan::new(
        auth::CAPABILITY_ID,
        auth::DESCRIPTOR_VERSION,
        [auth::AUTHENTICATE_OPERATION],
    ))
    .with_capability(CapabilityEndpointPlan::new(
        credentials::CAPABILITY_ID,
        credentials::DESCRIPTOR_VERSION,
        [credentials::INSPECT_OPERATION],
    ))
    .with_capability(CapabilityEndpointPlan::new(
        token_admin::CAPABILITY_ID,
        token_admin::DESCRIPTOR_VERSION,
        [
            token_admin::ISSUE_OPERATION,
            token_admin::LIST_OPERATION,
            token_admin::RECEIPT_OPERATION,
            token_admin::REVOKE_OPERATION,
        ],
    ));
    let access = owner(
        "access",
        lenso_access_control_postgres_plugin::PACKAGE_ID,
        serde_json::to_string(&access_config).unwrap(),
    )
    .with_capability(CapabilityEndpointPlan::new(
        access::CAPABILITY_ID,
        access::DESCRIPTOR_VERSION,
        [access::CHECK_PERMISSION_OPERATION],
    ))
    .with_capability(CapabilityEndpointPlan::new(
        admin::CAPABILITY_ID,
        admin::DESCRIPTOR_VERSION,
        [
            admin::ASSIGN_ROLE_OPERATION,
            admin::BOOTSTRAP_SCOPE_OPERATION,
            admin::CREATE_ROLE_OPERATION,
            admin::DELETE_ROLE_OPERATION,
            admin::REVOKE_ROLE_OPERATION,
            admin::SET_ROLE_PERMISSIONS_OPERATION,
        ],
    ));
    let access = access.with_capability(CapabilityEndpointPlan::new(
        access_directory::CAPABILITY_ID,
        access_directory::DESCRIPTOR_VERSION,
        [
            access_directory::GET_ROLE_OPERATION,
            access_directory::LIST_ROLES_OPERATION,
            access_directory::LIST_SUBJECT_ROLES_OPERATION,
        ],
    ));
    let approval = owner(
        "approval",
        lenso_business_approval_postgres_plugin::PACKAGE_ID,
        serde_json::to_string(&approval_config).unwrap(),
    )
    .with_capability(CapabilityEndpointPlan::new(
        approval::CAPABILITY_ID,
        approval::DESCRIPTOR_VERSION,
        [
            approval::CANCEL_OPERATION,
            approval::DECIDE_OPERATION,
            approval::EXPIRE_OPERATION,
            approval::READ_OPERATION,
            approval::REQUEST_OPERATION,
        ],
    ));
    let audit = owner(
        "audit",
        lenso_audit_log_postgres_plugin::PACKAGE_ID,
        serde_json::to_string(&audit_config).unwrap(),
    )
    .with_capability(CapabilityEndpointPlan::new(
        audit::CAPABILITY_ID,
        audit::DESCRIPTOR_VERSION,
        [
            audit::APPEND_EVENT_OPERATION,
            audit::GET_EVENT_OPERATION,
            audit::LIST_EVENTS_OPERATION,
        ],
    ));
    let mut bindings = Vec::new();
    for (cap, version) in required {
        let target = if cap == auth::CAPABILITY_ID || cap == credentials::CAPABILITY_ID {
            "auth"
        } else if cap == access::CAPABILITY_ID || cap == admin::CAPABILITY_ID {
            "access"
        } else if cap == approval::CAPABILITY_ID {
            "approval"
        } else {
            "audit"
        };
        bindings.push(CapabilityBinding::new(CALLER, cap, version, target));
    }
    for key in ["auth", "access", "approval", "audit"] {
        bindings.push(CapabilityBinding::new(
            key,
            secrets::CAPABILITY_ID,
            secrets::DESCRIPTOR_VERSION,
            "secrets",
        ));
    }
    AppComposition::new(
        vec![caller, secret, auth, access, approval, audit],
        bindings,
    )
    .resolve()
    .unwrap()
}
async fn start(
    database: &str,
    audit_database: &str,
    schemas: &[String; 3],
    audit_writer: bool,
    driver: TokioDriver,
) -> NativeApp {
    let values = BTreeMap::from([
        ("auth/database".into(), database.into()),
        ("access/database".into(), database.into()),
        ("approval/database".into(), database.into()),
        ("audit/database".into(), audit_database.into()),
        ("auth/signing".into(), SIGNING.into()),
        ("auth/pepper".into(), PEPPER.into()),
    ]);
    Kernel::start_native(
        plan(&schemas[0], &schemas[1], &schemas[2], audit_writer),
        driver,
        NativePluginRegistry::new()
            .with_linked_factories()
            .with_factory(CallerFactory)
            .with_factory(SecretsFactory(values)),
    )
    .await
    .unwrap()
}
fn authority(
    app: &NativeApp,
    qualification: Rc<QualificationStore>,
    driver: TokioDriver,
) -> Rc<OperatorsAuthority> {
    let deps = app.dependencies(CALLER).unwrap();
    Rc::new(
        OperatorsAuthority::new(
            RealmAssertionVerifier::new(
                "operators",
                ISSUER,
                &assertion_public_key(SIGNING),
                60,
                None,
            )
            .unwrap(),
            qualification,
            BTreeMap::from([(
                "notes.set".into(),
                EntryPolicy {
                    permission: "notes.write".into(),
                    scope_kind: SCOPE_KIND.into(),
                    scope_id: DEPLOYMENT.into(),
                },
            )]),
            OwnerPorts {
                credential_state: credentials::CredentialStateClient::from_dependencies(&deps)
                    .unwrap(),
                access: access::AccessControlClient::from_dependencies(&deps).unwrap(),
                approval: approval::BusinessApprovalClient::from_dependencies(&deps).unwrap(),
                audit: audit::AuditLogClient::from_dependencies(&deps).unwrap(),
            },
            Rc::new(HostClock(driver)),
        )
        .unwrap(),
    )
}
fn management(path: &Path, authority: Rc<OperatorsAuthority>, notes: Rc<Notes>) -> Management {
    Management::open(
        path,
        DEPLOYMENT.into(),
        "qualification-1".into(),
        vec![Binding {
            entry: entry(),
            target: notes,
        }],
        authority,
    )
    .unwrap()
}

async fn assign(admin: &admin::AccessControlAdminClient, ctx: InvocationContext, subject: &str) {
    admin
        .assign_role_with_context(
            ctx,
            admin::AssignRoleRequest {
                role_id: "operators".into(),
                subject: subject.into(),
                scope: admin::AssignRoleRequestScope {
                    kind: SCOPE_KIND.into(),
                    id: DEPLOYMENT.into(),
                },
            },
        )
        .await
        .unwrap();
}
async fn audit_events(app: &NativeApp, id: &str) -> Vec<audit::ListEventsResponseEventsItem> {
    let port =
        audit::AuditLogClient::from_dependencies(&app.dependencies(CALLER).unwrap()).unwrap();
    port.list_events(audit::ListEventsRequest {
        actor_id: None,
        actor_kind: None,
        correlation_id: Some(id.into()),
        cursor: None,
        event_name: None,
        limit: 100,
        occurred_after: None,
        occurred_before: None,
        outcome: None,
        resource_id: None,
        resource_type: None,
        scope_id: Some(DEPLOYMENT.into()),
        scope_module: None,
        scope_type: Some("deployment".into()),
        severity: None,
        source_instance: Some(CALLER.into()),
    })
    .await
    .unwrap()
    .events
}

#[tokio::test(flavor = "current_thread")]
#[ignore = "requires disposable LENSO_MANAGEMENT_TEST_DATABASE_URL and LENSO_MANAGEMENT_AUDIT_TEST_DATABASE_URL"]
async fn real_owners_enforce_current_authority_exact_human_approval_and_durable_audit() {
    let database =
        std::env::var("LENSO_MANAGEMENT_TEST_DATABASE_URL").expect("explicit disposable database");
    let audit_database = std::env::var("LENSO_MANAGEMENT_AUDIT_TEST_DATABASE_URL")
        .expect("separate disposable Audit database");
    assert!(database.ends_with("/lenso_management_test"));
    assert!(audit_database.ends_with("/lenso_management_audit_test"));
    let schemas = [
        format!("management_auth_{}", std::process::id()),
        format!("management_access_{}", std::process::id()),
        format!("management_approval_{}", std::process::id()),
    ];
    ApiTokenAuthOperator::setup(&database, &schemas[0])
        .await
        .unwrap();
    AccessControlOperator::setup(&database, &schemas[1])
        .await
        .unwrap();
    BusinessApprovalOperator::setup(&database, &schemas[2])
        .await
        .unwrap();
    AuditLogOperator::setup(&audit_database).await.unwrap();
    let operator = ApiTokenAuthOperator::connect(&database, &schemas[0])
        .await
        .unwrap();
    let alice = issue(&operator, "alice", "user", ceiling()).await;
    let bob = issue(&operator, "bob", "user", ceiling()).await;
    let bootstrap = issue(&operator, "bootstrap-human", "user", ceiling()).await;
    let machine = issue(&operator, "alice", "service-account", ceiling()).await;
    let scoped = issue(
        &operator,
        "alice",
        "user",
        ManagementCredentialCeiling {
            deployment: "other-deployment".into(),
            ..ceiling()
        },
    )
    .await;
    let local = tokio::task::LocalSet::new();
    local
        .run_until(async {
            let directory = tempfile::tempdir().unwrap();
            let eligibility_path = directory.path().join("eligibility.sqlite");
            QualificationStore::initialize(&eligibility_path).unwrap();
            let qualification = Rc::new(QualificationStore::open(&eligibility_path).unwrap());
            qualification.grant(DEPLOYMENT, "alice").unwrap();
            qualification.grant(DEPLOYMENT, "bob").unwrap();
            let journal = directory.path().join("management.sqlite");
            Management::initialize_journal(&journal).unwrap();
            let notes = Rc::new(Notes::initialize(&directory.path().join("notes.sqlite")));
            let driver = TokioDriver::new();
            let app = start(&database, &audit_database, &schemas, true, driver.clone()).await;
            let auth = authority(&app, qualification.clone(), driver);
            let service = management(&journal, auth.clone(), notes.clone());
            let alice_assertion = authenticate(&app, &alice).await;
            let bob_assertion = authenticate(&app, &bob).await;
            let bootstrap_assertion = authenticate(&app, &bootstrap).await;
            let acl = admin::AccessControlAdminClient::from_dependencies(
                &app.dependencies(CALLER).unwrap(),
            )
            .unwrap();
            acl.bootstrap_scope(admin::BootstrapScopeRequest {
                subject: "bootstrap-human".into(),
                scope: admin::BootstrapScopeRequestScope {
                    kind: SCOPE_KIND.into(),
                    id: DEPLOYMENT.into(),
                },
            })
            .await
            .unwrap();
            acl.create_role_with_context(
                context(&app, &bootstrap_assertion),
                admin::CreateRoleRequest {
                    role_id: "operators".into(),
                    name: "Qualified operators".into(),
                    scope: admin::CreateRoleRequestScope {
                        kind: SCOPE_KIND.into(),
                        id: DEPLOYMENT.into(),
                    },
                },
            )
            .await
            .unwrap();
            acl.set_role_permissions_with_context(
                context(&app, &bootstrap_assertion),
                admin::SetRolePermissionsRequest {
                    role_id: "operators".into(),
                    permissions: ceiling().permissions,
                    scope: admin::SetRolePermissionsRequestScope {
                        kind: SCOPE_KIND.into(),
                        id: DEPLOYMENT.into(),
                    },
                },
            )
            .await
            .unwrap();
            for subject in ["alice", "bob"] {
                assign(&acl, context(&app, &bootstrap_assertion), subject).await;
            }
            assert_eq!(
                service
                    .catalog(&context(&app, &alice_assertion))
                    .await
                    .unwrap()
                    .entries
                    .len(),
                1
            );
            let machine_assertion = authenticate(&app, &machine).await;
            assert!(
                service
                    .catalog(&context(&app, &machine_assertion))
                    .await
                    .unwrap()
                    .entries
                    .is_empty()
            );
            let scoped_assertion = authenticate(&app, &scoped).await;
            assert_eq!(
                service
                    .invoke(
                        context(&app, &scoped_assertion),
                        request("wrong-deployment", "denied", 0)
                    )
                    .await
                    .unwrap_err(),
                Error::Denied
            );
            qualification.revoke(DEPLOYMENT, "alice").unwrap();
            assert_eq!(
                service
                    .invoke(
                        context(&app, &alice_assertion),
                        request("unqualified", "denied", 0)
                    )
                    .await
                    .unwrap_err(),
                Error::Denied
            );
            qualification.grant(DEPLOYMENT, "alice").unwrap();
            let pending = service
                .invoke(
                    context(&app, &alice_assertion),
                    request("approved-note", "first", 0),
                )
                .await
                .unwrap();
            assert_eq!(pending.state, InvocationState::PendingApproval);
            assert_eq!(notes.revision(), 0);
            let id = pending.operation_id.clone().unwrap();
            assert_eq!(
                auth.decide(
                    context(&app, &alice_assertion),
                    &service,
                    &id,
                    approval::DecideRequestDecision::Approved
                )
                .await
                .unwrap_err(),
                Error::Denied
            );
            let approval_port = approval::BusinessApprovalClient::from_dependencies(
                &app.dependencies(CALLER).unwrap(),
            )
            .unwrap();
            let before = approval_port
                .read(approval::ReadRequest {
                    request_id: id.clone(),
                })
                .await
                .unwrap();
            assert_eq!(before.requested_by, "alice");
            assert_eq!(before.requester_instance, CALLER);
            assert_eq!(before.subject.id, id);
            assert_eq!(before.intent_digest.as_ref().unwrap().len(), 64);
            auth.decide(
                context(&app, &bob_assertion),
                &service,
                &id,
                approval::DecideRequestDecision::Approved,
            )
            .await
            .unwrap();
            assert_eq!(
                service
                    .invoke(
                        context(&app, &alice_assertion),
                        request("approved-note", "changed", 0)
                    )
                    .await
                    .unwrap_err(),
                Error::Conflict
            );
            acl.revoke_role_with_context(
                context(&app, &bootstrap_assertion),
                admin::RevokeRoleRequest {
                    role_id: "operators".into(),
                    subject: "alice".into(),
                    scope: admin::RevokeRoleRequestScope {
                        kind: SCOPE_KIND.into(),
                        id: DEPLOYMENT.into(),
                    },
                },
            )
            .await
            .unwrap();
            assert_eq!(
                service
                    .invoke(
                        context(&app, &alice_assertion),
                        request("approved-note", "first", 0)
                    )
                    .await
                    .unwrap_err(),
                Error::Denied
            );
            assert_eq!(notes.revision(), 0);
            assign(&acl, context(&app, &bootstrap_assertion), "alice").await;
            let committed = service
                .invoke(
                    context(&app, &alice_assertion),
                    request("approved-note", "first", 0),
                )
                .await
                .unwrap();
            assert_eq!(committed.state, InvocationState::Succeeded);
            assert!(!committed.audit_pending);
            assert_eq!(notes.revision(), 1);
            assert_eq!(
                service
                    .invoke(
                        context(&app, &alice_assertion),
                        request("approved-note", "first", 0)
                    )
                    .await
                    .unwrap(),
                committed
            );
            assert_eq!(notes.revision(), 1);
            let events = audit_events(&app, &id).await;
            assert_eq!(events.len(), 3);
            for event in &events {
                assert_eq!(event.source_instance, CALLER);
                assert_eq!(event.actor_id.as_deref(), Some("alice"));
                assert!(
                    !serde_json::to_string(event)
                        .unwrap()
                        .contains(alice.expose_secret())
                );
            }
            let done = approval_port
                .read(approval::ReadRequest {
                    request_id: id.clone(),
                })
                .await
                .unwrap();
            assert_eq!(done.intent_digest, before.intent_digest);
            assert_eq!(done.terminal_actor.as_deref(), Some("bob"));
            assert_eq!(done.terminal_caller_instance.as_deref(), Some(CALLER));
            let pending = service
                .invoke(
                    context(&app, &alice_assertion),
                    request("lost-response", "second", 1),
                )
                .await
                .unwrap();
            let unknown_id = pending.operation_id.unwrap();
            auth.decide(
                context(&app, &bob_assertion),
                &service,
                &unknown_id,
                approval::DecideRequestDecision::Approved,
            )
            .await
            .unwrap();
            notes.lose_response.set(true);
            assert_eq!(
                service
                    .invoke(
                        context(&app, &alice_assertion),
                        request("lost-response", "second", 1)
                    )
                    .await
                    .unwrap()
                    .state,
                InvocationState::Unknown
            );
            assert_eq!(notes.revision(), 2);
            assert_eq!(
                service
                    .status(context(&app, &alice_assertion), &unknown_id)
                    .await
                    .unwrap()
                    .state,
                InvocationState::Succeeded
            );
            assert_eq!(notes.revision(), 2);
            let binding = CredentialBinding::from_assertion(&alice_assertion).unwrap();
            operator
                .attenuate_management_credential(
                    &binding,
                    &ManagementCredentialCeiling {
                        permissions: vec!["management.approval.decide".into()],
                        ..ceiling()
                    },
                )
                .await
                .unwrap();
            assert_eq!(
                service
                    .invoke(
                        context(&app, &alice_assertion),
                        request("attenuated", "denied", 2)
                    )
                    .await
                    .unwrap_err(),
                Error::Denied
            );
            operator.revoke_session(bob.session_id()).await.unwrap();
            assert!(
                service
                    .catalog(&context(&app, &bob_assertion))
                    .await
                    .unwrap()
                    .entries
                    .is_empty()
            );
            assert_eq!(notes.revision(), 2);
            drop(service);
            drop(auth);
            drop(acl);
            drop(approval_port);
            assert_eq!(
                app.shutdown(Duration::from_secs(2)).await,
                ShutdownOutcome::Clean
            );

            // A real Audit owner denial keeps the durable attempt pending; repairing
            // its exact caller configuration lets a restart flush it once.
            let carol = issue(&operator, "carol", "user", ceiling()).await;
            let dave = issue(&operator, "dave", "user", ceiling()).await;
            qualification.grant(DEPLOYMENT, "carol").unwrap();
            qualification.grant(DEPLOYMENT, "dave").unwrap();
            let driver = TokioDriver::new();
            let app = start(&database, &audit_database, &schemas, false, driver.clone()).await;
            let auth = authority(&app, qualification.clone(), driver);
            let service = management(&journal, auth.clone(), notes.clone());
            let carol_assertion = authenticate(&app, &carol).await;
            let dave_assertion = authenticate(&app, &dave).await;
            let bootstrap_assertion = authenticate(&app, &bootstrap).await;
            let acl = admin::AccessControlAdminClient::from_dependencies(
                &app.dependencies(CALLER).unwrap(),
            )
            .unwrap();
            for subject in ["carol", "dave"] {
                assign(&acl, context(&app, &bootstrap_assertion), subject).await;
            }
            assert_eq!(
                service
                    .invoke(
                        context(&app, &carol_assertion),
                        request("audit-outbox", "third", 2)
                    )
                    .await
                    .unwrap_err(),
                Error::Unavailable
            );
            assert_eq!(notes.revision(), 2);
            drop(service);
            drop(auth);
            drop(acl);
            assert_eq!(
                app.shutdown(Duration::from_secs(2)).await,
                ShutdownOutcome::Clean
            );
            let driver = TokioDriver::new();
            let app = start(&database, &audit_database, &schemas, true, driver.clone()).await;
            let auth = authority(&app, qualification.clone(), driver);
            let service = management(&journal, auth.clone(), notes.clone());
            let pending = service
                .invoke(
                    context(&app, &carol_assertion),
                    request("audit-outbox", "third", 2),
                )
                .await
                .unwrap();
            let outbox_id = pending.operation_id.unwrap();
            assert_eq!(pending.state, InvocationState::PendingApproval);
            assert!(!pending.audit_pending);
            auth.decide(
                context(&app, &dave_assertion),
                &service,
                &outbox_id,
                approval::DecideRequestDecision::Approved,
            )
            .await
            .unwrap();
            assert_eq!(
                service
                    .invoke(
                        context(&app, &carol_assertion),
                        request("audit-outbox", "third", 2)
                    )
                    .await
                    .unwrap()
                    .state,
                InvocationState::Succeeded
            );
            assert_eq!(notes.revision(), 3);
            assert_eq!(audit_events(&app, &outbox_id).await.len(), 3);

            let service = Rc::new(service);
            let human = HumanServiceProvider {
                management: service.clone(),
                authority: auth.clone(),
            };
            let pending = service
                .invoke(
                    context(&app, &carol_assertion),
                    request("human-review", "reviewed fourth", 3),
                )
                .await
                .unwrap();
            let human_id = pending.operation_id.unwrap();
            let review = human
                .read_intent(
                    context(&app, &dave_assertion),
                    human::ReadIntentRequest {
                        operation_id: human_id.clone(),
                    },
                )
                .await
                .unwrap()
                .unwrap();
            assert_eq!(review.requester, "carol");
            assert_eq!(review.status, human::IntentStatus::Pending);
            assert_eq!(review.deployment, DEPLOYMENT);
            assert_eq!(review.entry_id, "notes.set");
            assert_eq!(
                serde_json::from_str::<Value>(review.parameters_json.as_str()).unwrap(),
                json!({"input":{"text":"reviewed fourth"},"expected_revision":"3"})
            );
            assert_eq!(
                human
                    .read_intent(
                        context(&app, &machine_assertion),
                        human::ReadIntentRequest {
                            operation_id: human_id.clone(),
                        },
                    )
                    .await
                    .unwrap()
                    .unwrap_err(),
                human::ReadIntentError::PermissionDenied
            );
            assert_eq!(
                human
                    .decide(
                        context(&app, &dave_assertion),
                        human::DecideRequest {
                            operation_id: human_id.clone(),
                            intent_digest: "0".repeat(64),
                            decision: human::Decision::Approved,
                        },
                    )
                    .await
                    .unwrap()
                    .unwrap_err(),
                human::DecideError::Conflict
            );
            let human_request = human::DecideRequest {
                operation_id: human_id.clone(),
                intent_digest: review.intent_digest.clone(),
                decision: human::Decision::Approved,
            };
            assert_eq!(
                human
                    .decide(context(&app, &carol_assertion), human_request.clone())
                    .await
                    .unwrap()
                    .unwrap_err(),
                human::DecideError::PermissionDenied
            );

            // Stop at a real, sent predecision audit boundary, then remove the
            // selected Audit's writer admission before the owner decision.
            let deciding_context = context(&app, &dave_assertion);
            let deciding_human = auth
                .authorize_human(
                    &deciding_context,
                    DEPLOYMENT,
                    &EntryPolicy {
                        permission: "management.approval.decide".into(),
                        scope_kind: SCOPE_KIND.into(),
                        scope_id: DEPLOYMENT.into(),
                    },
                    human::CAPABILITY_ID,
                    human::DECIDE_OPERATION,
                )
                .await
                .unwrap();
            service
                .audit_human(
                    &deciding_context,
                    &human_id,
                    "human_attempt",
                    &deciding_human,
                    "approved",
                )
                .await
                .unwrap();
            drop(human);
            drop(service);
            drop(auth);
            assert_eq!(
                app.shutdown(Duration::from_secs(2)).await,
                ShutdownOutcome::Clean
            );

            let driver = TokioDriver::new();
            let app = start(&database, &audit_database, &schemas, false, driver.clone()).await;
            let auth = authority(&app, qualification.clone(), driver);
            let service = Rc::new(management(&journal, auth.clone(), notes.clone()));
            let human = HumanServiceProvider {
                management: service.clone(),
                authority: auth.clone(),
            };
            let decided = human
                .decide(context(&app, &dave_assertion), human_request.clone())
                .await
                .unwrap()
                .unwrap();
            assert_eq!(decided.status, human::IntentStatus::Approved);
            assert!(decided.audit_pending);
            assert_eq!(notes.revision(), 3);
            let approval_port = approval::BusinessApprovalClient::from_dependencies(
                &app.dependencies(CALLER).unwrap(),
            )
            .unwrap();
            let committed_decision = approval_port
                .read(approval::ReadRequest {
                    request_id: human_id.clone(),
                })
                .await
                .unwrap();
            assert_eq!(
                committed_decision.status,
                approval::ReadResponseStatus::Approved
            );
            assert_eq!(committed_decision.requested_by, "carol");
            assert_eq!(committed_decision.terminal_actor.as_deref(), Some("dave"));
            assert_eq!(
                committed_decision.intent_digest.as_deref(),
                Some(review.intent_digest.as_str())
            );
            assert_eq!(
                human
                    .decide(context(&app, &dave_assertion), human_request.clone())
                    .await
                    .unwrap()
                    .unwrap_err(),
                human::DecideError::Unavailable
            );
            assert_eq!(
                approval_port
                    .read(approval::ReadRequest {
                        request_id: human_id.clone(),
                    })
                    .await
                    .unwrap(),
                committed_decision
            );
            drop(approval_port);
            drop(human);
            drop(service);
            drop(auth);
            assert_eq!(
                app.shutdown(Duration::from_secs(2)).await,
                ShutdownOutcome::Clean
            );

            let driver = TokioDriver::new();
            let app = start(&database, &audit_database, &schemas, true, driver.clone()).await;
            let auth = authority(&app, qualification, driver);
            let service = management(&journal, auth.clone(), notes.clone());
            let recovered = service
                .status(context(&app, &carol_assertion), &human_id)
                .await
                .unwrap();
            assert!(!recovered.audit_pending);
            assert_eq!(recovered.state, InvocationState::PendingApproval);
            let events = audit_events(&app, &human_id).await;
            let decided_events: Vec<_> = events
                .iter()
                .filter(|event| event.action == "management.human_decided")
                .collect();
            assert_eq!(decided_events.len(), 1);
            assert_eq!(decided_events[0].actor_id.as_deref(), Some("dave"));
            assert_eq!(decided_events[0].metadata["decision"], "approved");
            assert_eq!(
                decided_events[0].metadata["intent_digest"],
                review.intent_digest
            );
            assert_eq!(notes.revision(), 3);
            assert_eq!(
                service
                    .status(context(&app, &carol_assertion), &human_id)
                    .await
                    .unwrap(),
                recovered
            );
            assert_eq!(audit_events(&app, &human_id).await, events);
            assert!(
                !serde_json::to_string(&events)
                    .unwrap()
                    .contains(dave.expose_secret())
            );
            operator.revoke_token(carol.token_id()).await.unwrap();
            assert_eq!(
                service
                    .status(context(&app, &carol_assertion), &outbox_id)
                    .await
                    .unwrap_err(),
                Error::Denied
            );
            drop(service);
            drop(auth);
            assert_eq!(
                app.shutdown(Duration::from_secs(2)).await,
                ShutdownOutcome::Clean
            );
        })
        .await;
}
