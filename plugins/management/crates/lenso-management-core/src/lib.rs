//! Controlled dispatch. Host bindings own the catalog; targets retain business authority.

pub mod native;

use futures::future::LocalBoxFuture;
use lenso_capability_management as contract;
use lenso_kernel::InvocationContext;
use rusqlite::{Connection, OptionalExtension, params};
use serde_json::Value;
use sha2::{Digest as _, Sha256};
use std::{cell::RefCell, collections::BTreeMap, path::Path, rc::Rc};
use std::{
    fs::{File, OpenOptions},
    time::Duration,
};

pub use contract::{Effect, Entry, InvocationState, InvokeRequest, InvokeResponse};

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Error {
    Denied,
    NotFound,
    InvalidInput,
    Conflict,
    Unavailable,
    Cancelled,
    Expired,
}

/// Created by a trusted authority after current identity, qualification and ceiling checks.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Principal {
    pub subject: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Approval {
    Required,
    Approved,
    Denied,
}

#[derive(Clone, Debug, Eq, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct Intent {
    pub operation_id: String,
    pub subject: String,
    pub deployment: String,
    pub entry_id: String,
    pub digest: String,
    pub expires_at: String,
}

/// A Host-injected security seam, never a credential supplied in invocation JSON.
/// Implementations must revalidate credential revocation, realm, deployment membership,
/// permission and resource/operation ceilings for every call, including status reads.
pub trait Authority: std::fmt::Debug {
    /// The monotonic clock used by the Host's InvocationContext deadlines.
    fn now(&self) -> Duration;
    fn wall_now(&self) -> time::OffsetDateTime;
    fn authorize<'a>(
        &'a self,
        context: &'a InvocationContext,
        deployment: &'a str,
        entry: &'a Entry,
        admission_operation: &'a str,
    ) -> LocalBoxFuture<'a, Result<Principal, Error>>;
    fn audit<'a>(
        &'a self,
        context: &'a InvocationContext,
        event: &'a AuditEvent,
    ) -> LocalBoxFuture<'a, Result<(), Error>>;
    /// Consult the Approval owner for this exact server-created digest and original subject.
    /// Missing approval storage and client/local confirmations must never return Approved.
    fn approval<'a>(
        &'a self,
        context: &'a InvocationContext,
        intent: &'a Intent,
    ) -> LocalBoxFuture<'a, Result<Approval, Error>>;
}

#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct AuditEvent {
    pub intent: Intent,
    pub phase: String,
    pub state: InvocationState,
    pub receipt: Option<String>,
    pub occurred_at: String,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Outcome {
    Committed { result: Value, receipt: String },
    Failed,
    Unknown,
}

/// One explicit domain adapter; it invokes its bound owner Capability and retains local checks.
/// Writable targets must commit a stable receipt using operation_id, or remain Unknown.
pub trait Target: std::fmt::Debug {
    fn invoke<'a>(
        &'a self,
        context: InvocationContext,
        input: Value,
        expected_revision: Option<String>,
        operation_id: Option<String>,
    ) -> LocalBoxFuture<'a, Result<Outcome, Error>>;
    /// Recovery queries a target receipt; it never replays a potentially committed write.
    fn receipt<'a>(
        &'a self,
        context: InvocationContext,
        operation_id: &'a str,
    ) -> LocalBoxFuture<'a, Result<Option<(Value, String)>, Error>>;
}

#[derive(Debug)]
pub struct Binding {
    pub entry: Entry,
    pub target: Rc<dyn Target>,
}

#[derive(Debug)]
struct Accepted {
    entry: Entry,
    schema: jsonschema::Validator,
    target: Rc<dyn Target>,
}

#[derive(Debug)]
pub struct Management {
    deployment: String,
    revision: String,
    entries: BTreeMap<String, Accepted>,
    authority: Rc<dyn Authority>,
    journal: RefCell<Connection>,
    _lease: File,
}

/// Generated native Capability endpoint adapter; a Host explicitly supplies its owned service.
#[derive(Clone, Debug)]
pub struct ServiceProvider(pub Rc<Management>);

impl contract::ManagementProvider for ServiceProvider {
    fn catalog(
        &self,
        context: InvocationContext,
        _: contract::CatalogRequest,
    ) -> lenso_kernel::NativeRequestFuture<contract::ManagementCatalog> {
        let service = self.0.clone();
        Box::pin(async move {
            Ok(service
                .catalog(&context)
                .await
                .map_err(|error| match error {
                    Error::Denied => contract::CatalogError::PermissionDenied,
                    _ => contract::CatalogError::Unavailable,
                }))
        })
    }

    fn invoke(
        &self,
        context: InvocationContext,
        request: contract::InvokeRequest,
    ) -> lenso_kernel::NativeRequestFuture<contract::ManagementInvoke> {
        let service = self.0.clone();
        Box::pin(async move {
            Ok(service
                .invoke(context, request)
                .await
                .map_err(|error| match error {
                    Error::Denied => contract::InvokeError::PermissionDenied,
                    Error::NotFound => contract::InvokeError::NotFound,
                    Error::InvalidInput => contract::InvokeError::InvalidInput,
                    Error::Conflict => contract::InvokeError::Conflict,
                    Error::Unavailable => contract::InvokeError::Unavailable,
                    Error::Cancelled => contract::InvokeError::Cancelled,
                    Error::Expired => contract::InvokeError::DeadlineExceeded,
                }))
        })
    }

    fn status(
        &self,
        context: InvocationContext,
        request: contract::StatusRequest,
    ) -> lenso_kernel::NativeRequestFuture<contract::ManagementStatus> {
        let service = self.0.clone();
        Box::pin(async move {
            Ok(service
                .status(context, &request.operation_id)
                .await
                .map_err(|error| match error {
                    Error::Denied => contract::StatusError::PermissionDenied,
                    Error::NotFound => contract::StatusError::NotFound,
                    Error::Conflict => contract::StatusError::Conflict,
                    _ => contract::StatusError::Unavailable,
                }))
        })
    }
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct IntentParameters {
    pub input: Value,
    pub expected_revision: Option<String>,
}

struct IntentSeal<'a> {
    digest: &'a str,
    binding_digest: &'a str,
    expires_at: &'a str,
}

#[derive(Debug)]
struct Record {
    subject: String,
    entry_id: String,
    digest: String,
    binding_digest: String,
    expires_at: String,
    parameters: IntentParameters,
    response: InvokeResponse,
}

impl Management {
    /// Explicit operator setup; opening a configured deployment never silently creates storage.
    pub fn initialize_journal(path: &Path) -> Result<(), Error> {
        let _lease = journal_lease(path)?;
        let connection = Connection::open(path).map_err(|_| Error::Unavailable)?;
        connection
            .execute_batch(
                "BEGIN IMMEDIATE;
            CREATE TABLE management_invocations (
                operation_id TEXT PRIMARY KEY,
                subject TEXT NOT NULL,
                deployment TEXT NOT NULL,
                entry_id TEXT NOT NULL,
                idempotency_key TEXT NOT NULL,
                intent_digest TEXT NOT NULL,
                binding_digest TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                parameters_json TEXT NOT NULL,
                response_json TEXT NOT NULL,
                UNIQUE(subject, deployment, entry_id, idempotency_key)
            );
            CREATE TABLE management_audit_outbox(operation_id TEXT NOT NULL, phase TEXT NOT NULL, event_json TEXT NOT NULL, sent INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(operation_id,phase));
            PRAGMA user_version = 3;
            COMMIT;",
            )
            .map_err(|_| Error::Unavailable)
    }

    pub fn open(
        path: &Path,
        deployment: String,
        revision: String,
        bindings: Vec<Binding>,
        authority: Rc<dyn Authority>,
    ) -> Result<Self, Error> {
        if deployment.is_empty()
            || deployment.len() > 128
            || revision.is_empty()
            || revision.len() > 128
            || bindings.len() > 256
        {
            return Err(Error::InvalidInput);
        }
        let _lease = journal_lease(&path.canonicalize().map_err(|_| Error::Unavailable)?)?;
        let journal =
            Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE)
                .map_err(|_| Error::Unavailable)?;
        let version: i64 = journal
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .map_err(|_| Error::Unavailable)?;
        if version != 3 {
            return Err(Error::Unavailable);
        }
        let mut entries = BTreeMap::new();
        for binding in bindings {
            let entry = binding.entry;
            if [
                &entry.id,
                &entry.target_instance,
                &entry.capability,
                &entry.version,
                &entry.operation,
            ]
            .iter()
            .any(|id| id.is_empty() || id.len() > 128)
                || entry.description.len() > 4096
                || entry.input_schema_json.as_str().len() > 65536
            {
                return Err(Error::InvalidInput);
            }
            let schema_value: Value = serde_json::from_str(entry.input_schema_json.as_str())
                .map_err(|_| Error::InvalidInput)?;
            if schema_value.get("type").and_then(Value::as_str) != Some("object")
                || schema_value.get("additionalProperties") != Some(&Value::Bool(false))
            {
                return Err(Error::InvalidInput);
            }
            let schema =
                jsonschema::validator_for(&schema_value).map_err(|_| Error::InvalidInput)?;
            let id = entry.id.clone();
            if entries
                .insert(
                    id,
                    Accepted {
                        entry,
                        schema,
                        target: binding.target,
                    },
                )
                .is_some()
            {
                return Err(Error::Conflict);
            }
        }
        // A process can have lost its response after dispatch. Recovery must query the target.
        let executing =
            serde_json::to_string(&InvocationState::Executing).map_err(|_| Error::Unavailable)?;
        let mut statement = journal.prepare("SELECT operation_id, response_json FROM management_invocations WHERE deployment=?1").map_err(|_| Error::Unavailable)?;
        let rows = statement
            .query_map([&deployment], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|_| Error::Unavailable)?;
        let mut recovered = Vec::new();
        for row in rows {
            let (id, wire) = row.map_err(|_| Error::Unavailable)?;
            let mut response: InvokeResponse =
                serde_json::from_str(&wire).map_err(|_| Error::Unavailable)?;
            if serde_json::to_string(&response.state).map_err(|_| Error::Unavailable)? == executing
            {
                response.state = InvocationState::Unknown;
                recovered.push((
                    id,
                    serde_json::to_string(&response).map_err(|_| Error::Unavailable)?,
                ));
            }
        }
        drop(statement);
        let service = Self {
            deployment,
            revision,
            entries,
            authority,
            journal: RefCell::new(journal),
            _lease,
        };
        for (id, wire) in recovered {
            let response = serde_json::from_str(&wire).map_err(|_| Error::Unavailable)?;
            service.save_with_audit(&id, &response, "interrupted")?;
        }
        Ok(service)
    }

    pub async fn catalog(
        &self,
        context: &InvocationContext,
    ) -> Result<contract::CatalogResponse, Error> {
        self.check_context(context)?;
        let mut entries = Vec::new();
        for accepted in self.entries.values() {
            match self
                .authority
                .authorize(context, &self.deployment, &accepted.entry, "catalog")
                .await
            {
                Ok(_) => entries.push(accepted.entry.clone()),
                Err(Error::Denied) => {}
                Err(error) => return Err(error),
            }
        }
        self.check_context(context)?;
        Ok(contract::CatalogResponse {
            deployment: self.deployment.clone(),
            revision: self.revision.clone(),
            entries,
        })
    }

    pub async fn invoke(
        &self,
        context: InvocationContext,
        request: InvokeRequest,
    ) -> Result<InvokeResponse, Error> {
        self.check_context(&context)?;
        let accepted = self.entries.get(&request.entry_id).ok_or(Error::NotFound)?;
        let principal = self
            .authority
            .authorize(&context, &self.deployment, &accepted.entry, "invoke")
            .await?;
        self.check_context(&context)?;
        if principal.subject.is_empty() {
            return Err(Error::Denied);
        }
        if request.version != accepted.entry.version {
            return Err(Error::Conflict);
        }
        if request.input_json.as_str().len() > 262144 {
            return Err(Error::InvalidInput);
        }
        let input: Value =
            serde_json::from_str(request.input_json.as_str()).map_err(|_| Error::InvalidInput)?;
        if !accepted.schema.is_valid(&input) {
            return Err(Error::InvalidInput);
        }
        if accepted.entry.effect == Effect::Read {
            let outcome = accepted
                .target
                .invoke(context.clone(), input, request.expected_revision, None)
                .await?;
            self.check_context(&context)?;
            return response(None, outcome);
        }
        let key = request
            .idempotency_key
            .as_deref()
            .filter(|key| !key.is_empty() && key.len() <= 128)
            .ok_or(Error::InvalidInput)?;
        let expires_at = self.intent_expiration(&principal.subject, &request.entry_id, key)?;
        let digest = intent_digest(
            &self.deployment,
            &accepted.entry,
            &principal.subject,
            &input,
            request.expected_revision.as_deref(),
            &expires_at,
        )?;
        let binding_digest = binding_digest(&accepted.entry)?;
        let mut record = self.reserve(
            &principal.subject,
            &accepted.entry,
            key,
            IntentSeal {
                digest: &digest,
                binding_digest: &binding_digest,
                expires_at: &expires_at,
            },
            &IntentParameters {
                input: canonicalize(input.clone()),
                expected_revision: request.expected_revision.clone(),
            },
        )?;
        if record.digest != digest {
            return Err(Error::Conflict);
        }
        let intent = self.intent(&record)?;
        self.queue_audit(
            &intent,
            "attempt",
            if accepted.entry.requires_approval {
                InvocationState::PendingApproval
            } else {
                InvocationState::Ready
            },
            None,
        )?;
        self.flush_audit(&context, &id_from_record(&record)?)
            .await?;
        self.check_context(&context)?;
        record = self.load(&id_from_record(&record)?)?;
        match record.response.state {
            InvocationState::Succeeded
            | InvocationState::Failed
            | InvocationState::Unknown
            | InvocationState::Cancelled
            | InvocationState::Executing => return Ok(record.response),
            InvocationState::PendingApproval | InvocationState::Ready => {}
        }
        let id = record
            .response
            .operation_id
            .clone()
            .ok_or(Error::Unavailable)?;
        if accepted.entry.requires_approval {
            let approval = self.authority.approval(&context, &intent).await?;
            self.check_context(&context)?;
            match approval {
                Approval::Required => return Ok(record.response),
                Approval::Denied => return Err(Error::Denied),
                Approval::Approved => {}
            }
            // Approval does not preserve authorization; current grants are checked again.
            let current_principal = self
                .authority
                .authorize(&context, &self.deployment, &accepted.entry, "invoke")
                .await?;
            if current_principal.subject != record.subject {
                return Err(Error::Denied);
            }
        }
        self.check_context(&context)?;
        if self.authority.wall_now() >= parse_time(&record.expires_at)? {
            return Err(Error::Denied);
        }
        self.queue_audit(&intent, "dispatch", InvocationState::Executing, None)?;
        self.flush_audit(&context, &id).await?;
        let current = self
            .authority
            .authorize(&context, &self.deployment, &accepted.entry, "invoke")
            .await?;
        if current.subject != record.subject {
            return Err(Error::Denied);
        }
        self.check_context(&context)?;
        if self.authority.wall_now() >= parse_time(&record.expires_at)? {
            return Err(Error::Denied);
        }
        record.response.state = InvocationState::Executing;
        if !self.claim_execution(&id, &record.response)? {
            return self.load(&id).map(|record| record.response);
        }
        let mut dispatch = DispatchGuard {
            management: self,
            operation_id: id.clone(),
            finished: false,
        };
        let outcome = accepted
            .target
            .invoke(
                context.clone(),
                input,
                request.expected_revision,
                Some(id.clone()),
            )
            .await;
        let result = match if self.check_context(&context).is_err() {
            Err(Error::Cancelled)
        } else {
            outcome
        } {
            Ok(outcome) => response(Some(id.clone()), outcome)
                .unwrap_or(response(Some(id.clone()), Outcome::Unknown)?),
            // A target-side error can follow a commit. Treat it as uncertain until a receipt proves it.
            Err(_) => response(Some(id.clone()), Outcome::Unknown)?,
        };
        self.save_with_audit(&id, &result, "completed")?;
        dispatch.finished = true;
        let _ = self.flush_audit(&context, &id).await;
        self.check_context(&context)?;
        self.load(&id).map(|record| record.response)
    }

    pub async fn status(
        &self,
        context: InvocationContext,
        operation_id: &str,
    ) -> Result<InvokeResponse, Error> {
        self.check_context(&context)?;
        let record = self.load(operation_id)?;
        let accepted = self.entries.get(&record.entry_id).ok_or(Error::NotFound)?;
        let principal = self
            .authority
            .authorize(&context, &self.deployment, &accepted.entry, "status")
            .await?;
        if principal.subject != record.subject {
            return Err(Error::Denied);
        }
        if binding_digest(&accepted.entry)? != record.binding_digest {
            return Err(Error::Conflict);
        }
        let _ = self.flush_audit(&context, operation_id).await;
        self.check_context(&context)?;
        if record.response.state != InvocationState::Unknown {
            return self.load(operation_id).map(|record| record.response);
        }
        let receipt = accepted
            .target
            .receipt(context.clone(), operation_id)
            .await?;
        self.check_context(&context)?;
        let Some((result, receipt)) = receipt else {
            return Ok(record.response);
        };
        let response = response(
            Some(operation_id.to_owned()),
            Outcome::Committed { result, receipt },
        )?;
        self.save_with_audit(operation_id, &response, "reconciled")?;
        let _ = self.flush_audit(&context, operation_id).await;
        self.check_context(&context)?;
        self.load(operation_id).map(|record| record.response)
    }

    /// Host-only handoff to the separately guarded human Approval adapter.
    /// This is not exposed by the catalog/invoke/status Capability or tool projection.
    pub fn pending_approval_intent(&self, operation_id: &str) -> Result<(Intent, Entry), Error> {
        let record = self.load(operation_id)?;
        let accepted = self.entries.get(&record.entry_id).ok_or(Error::NotFound)?;
        if !accepted.entry.requires_approval
            || record.response.state != InvocationState::PendingApproval
            || binding_digest(&accepted.entry)? != record.binding_digest
        {
            return Err(Error::Conflict);
        }
        Ok((self.intent(&record)?, accepted.entry.clone()))
    }

    /// The separately authorized human adapter reads the immutable server snapshot.
    pub fn pending_approval_parameters(
        &self,
        operation_id: &str,
    ) -> Result<IntentParameters, Error> {
        let (intent, entry) = self.pending_approval_intent(operation_id)?;
        let parameters = self.load(operation_id)?.parameters;
        if intent_digest(
            &intent.deployment,
            &entry,
            &intent.subject,
            &parameters.input,
            parameters.expected_revision.as_deref(),
            &intent.expires_at,
        )? != intent.digest
        {
            return Err(Error::Conflict);
        }
        Ok(parameters)
    }

    fn reserve(
        &self,
        subject: &str,
        entry: &Entry,
        key: &str,
        seal: IntentSeal<'_>,
        parameters: &IntentParameters,
    ) -> Result<Record, Error> {
        let IntentSeal {
            digest,
            binding_digest,
            expires_at,
        } = seal;
        let entry_id = &entry.id;
        let approval = entry.requires_approval;
        let mut connection = self.journal.borrow_mut();
        let transaction = connection
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .map_err(|_| Error::Unavailable)?;
        let previous: Option<String> = transaction.query_row("SELECT operation_id FROM management_invocations WHERE subject=?1 AND deployment=?2 AND entry_id=?3 AND idempotency_key=?4", params![subject, self.deployment, entry_id, key], |row| row.get(0)).optional().map_err(|_| Error::Unavailable)?;
        if let Some(id) = previous {
            drop(transaction);
            drop(connection);
            return self.load(&id);
        }
        let id = uuid::Uuid::new_v4().to_string();
        let response = InvokeResponse {
            operation_id: Some(id.clone()),
            state: if approval {
                InvocationState::PendingApproval
            } else {
                InvocationState::Ready
            },
            result_json: None,
            receipt: None,
            audit_pending: true,
        };
        transaction
            .execute(
                "INSERT INTO management_invocations VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
                params![
                    id,
                    subject,
                    self.deployment,
                    entry_id,
                    key,
                    digest,
                    binding_digest,
                    expires_at,
                    serde_json::to_string(parameters).map_err(|_| Error::Unavailable)?,
                    serde_json::to_string(&response).map_err(|_| Error::Unavailable)?
                ],
            )
            .map_err(|_| Error::Unavailable)?;
        transaction.commit().map_err(|_| Error::Unavailable)?;
        Ok(Record {
            subject: subject.to_owned(),
            entry_id: entry_id.clone(),
            digest: digest.to_owned(),
            binding_digest: binding_digest.to_owned(),
            expires_at: expires_at.to_owned(),
            parameters: parameters.clone(),
            response,
        })
    }

    fn check_context(&self, context: &InvocationContext) -> Result<(), Error> {
        if context.is_cancelled() {
            return Err(Error::Cancelled);
        }
        if context.is_expired(self.authority.now()) {
            return Err(Error::Expired);
        }
        Ok(())
    }

    fn load(&self, id: &str) -> Result<Record, Error> {
        let wire: Option<(String, String, String, String, String, String, String)> = self.journal.borrow().query_row("SELECT subject,entry_id,intent_digest,binding_digest,expires_at,parameters_json,response_json FROM management_invocations WHERE operation_id=?1 AND deployment=?2", params![id, self.deployment], |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?,row.get(4)?,row.get(5)?,row.get(6)?))).optional().map_err(|_| Error::Unavailable)?;
        let (subject, entry_id, digest, binding_digest, expires_at, parameters, response) =
            wire.ok_or(Error::NotFound)?;
        Ok(Record {
            subject,
            entry_id,
            digest,
            binding_digest,
            expires_at,
            parameters: serde_json::from_str(&parameters).map_err(|_| Error::Unavailable)?,
            response: serde_json::from_str(&response).map_err(|_| Error::Unavailable)?,
        })
    }

    fn claim_execution(&self, id: &str, response: &InvokeResponse) -> Result<bool, Error> {
        let ready =
            serde_json::to_string(&InvocationState::Ready).map_err(|_| Error::Unavailable)?;
        let pending = serde_json::to_string(&InvocationState::PendingApproval)
            .map_err(|_| Error::Unavailable)?;
        self.journal.borrow().execute("UPDATE management_invocations SET response_json=?2 WHERE operation_id=?1 AND json_extract(response_json,'$.state') IN (json_extract(?3,'$'), json_extract(?4,'$'))", params![id, serde_json::to_string(response).map_err(|_| Error::Unavailable)?, ready, pending]).map(|count| count == 1).map_err(|_| Error::Unavailable)
    }

    fn intent_expiration(&self, subject: &str, entry: &str, key: &str) -> Result<String, Error> {
        let prior: Option<String> = self.journal.borrow().query_row("SELECT expires_at FROM management_invocations WHERE subject=?1 AND deployment=?2 AND entry_id=?3 AND idempotency_key=?4", params![subject,self.deployment,entry,key], |row| row.get(0)).optional().map_err(|_| Error::Unavailable)?;
        prior.map_or_else(
            || format_time(self.authority.wall_now() + time::Duration::seconds(300)),
            Ok,
        )
    }
    fn intent(&self, record: &Record) -> Result<Intent, Error> {
        Ok(Intent {
            operation_id: id_from_record(record)?,
            subject: record.subject.clone(),
            deployment: self.deployment.clone(),
            entry_id: record.entry_id.clone(),
            digest: record.digest.clone(),
            expires_at: record.expires_at.clone(),
        })
    }
    fn queue_audit(
        &self,
        intent: &Intent,
        phase: &str,
        state: InvocationState,
        receipt: Option<String>,
    ) -> Result<(), Error> {
        let event = AuditEvent {
            intent: intent.clone(),
            phase: phase.into(),
            state,
            receipt,
            occurred_at: format_time(self.authority.wall_now())?,
        };
        self.journal.borrow().execute("INSERT OR IGNORE INTO management_audit_outbox(operation_id,phase,event_json) VALUES(?1,?2,?3)",params![intent.operation_id,phase,serde_json::to_string(&event).map_err(|_|Error::Unavailable)?]).map_err(|_|Error::Unavailable)?;
        Ok(())
    }
    fn save_with_audit(
        &self,
        id: &str,
        response: &InvokeResponse,
        phase: &str,
    ) -> Result<(), Error> {
        let record = self.load(id)?;
        let intent = self.intent(&record)?;
        let event = AuditEvent {
            intent,
            phase: phase.into(),
            state: response.state.clone(),
            receipt: response.receipt.clone(),
            occurred_at: format_time(self.authority.wall_now())?,
        };
        let mut saved = response.clone();
        saved.audit_pending = true;
        let mut journal = self.journal.borrow_mut();
        let transaction = journal.transaction().map_err(|_| Error::Unavailable)?;
        transaction
            .execute(
                "UPDATE management_invocations SET response_json=?2 WHERE operation_id=?1",
                params![
                    id,
                    serde_json::to_string(&saved).map_err(|_| Error::Unavailable)?
                ],
            )
            .map_err(|_| Error::Unavailable)?;
        transaction.execute("INSERT OR IGNORE INTO management_audit_outbox(operation_id,phase,event_json) VALUES(?1,?2,?3)",params![id,phase,serde_json::to_string(&event).map_err(|_|Error::Unavailable)?]).map_err(|_|Error::Unavailable)?;
        transaction.commit().map_err(|_| Error::Unavailable)
    }
    async fn flush_audit(&self, context: &InvocationContext, id: &str) -> Result<(), Error> {
        let events: Vec<(String, String)> = {
            let journal = self.journal.borrow();
            let mut statement=journal.prepare("SELECT phase,event_json FROM management_audit_outbox WHERE operation_id=?1 AND sent=0 ORDER BY rowid").map_err(|_|Error::Unavailable)?;
            statement
                .query_map([id], |row| Ok((row.get(0)?, row.get(1)?)))
                .map_err(|_| Error::Unavailable)?
                .collect::<Result<_, _>>()
                .map_err(|_| Error::Unavailable)?
        };
        for (phase, wire) in events {
            self.check_context(context)?;
            let event = serde_json::from_str(&wire).map_err(|_| Error::Unavailable)?;
            self.authority.audit(context, &event).await?;
            self.journal
                .borrow()
                .execute(
                    "UPDATE management_audit_outbox SET sent=1 WHERE operation_id=?1 AND phase=?2",
                    params![id, phase],
                )
                .map_err(|_| Error::Unavailable)?;
        }
        let mut response = self.load(id)?.response;
        response.audit_pending = false;
        self.save(id, &response)
    }

    fn save(&self, id: &str, response: &InvokeResponse) -> Result<(), Error> {
        self.journal.borrow().execute("UPDATE management_invocations SET response_json=?2 WHERE operation_id=?1 AND deployment=?3", params![id, serde_json::to_string(response).map_err(|_| Error::Unavailable)?, self.deployment]).map(|_| ()).map_err(|_| Error::Unavailable)
    }
}

fn id_from_record(record: &Record) -> Result<String, Error> {
    record
        .response
        .operation_id
        .clone()
        .ok_or(Error::Unavailable)
}
fn format_time(time: time::OffsetDateTime) -> Result<String, Error> {
    let time = time
        .replace_nanosecond(time.nanosecond() / 1_000 * 1_000)
        .map_err(|_| Error::Unavailable)?;
    time.format(&time::format_description::well_known::Rfc3339)
        .map_err(|_| Error::Unavailable)
}
fn parse_time(value: &str) -> Result<time::OffsetDateTime, Error> {
    time::OffsetDateTime::parse(value, &time::format_description::well_known::Rfc3339)
        .map_err(|_| Error::Unavailable)
}

fn response(operation_id: Option<String>, outcome: Outcome) -> Result<InvokeResponse, Error> {
    let (state, result_json, receipt) = match outcome {
        Outcome::Committed { result, receipt } => {
            if receipt.is_empty() || receipt.len() > 256 {
                return Err(Error::Unavailable);
            }
            let wire = serde_json::to_string(&result).map_err(|_| Error::Unavailable)?;
            if wire.len() > 1048576 {
                return Err(Error::Unavailable);
            }
            (
                InvocationState::Succeeded,
                Some(wire.parse().map_err(|_| Error::Unavailable)?),
                Some(receipt),
            )
        }
        Outcome::Failed => (InvocationState::Failed, None, None),
        Outcome::Unknown => (InvocationState::Unknown, None, None),
    };
    Ok(InvokeResponse {
        operation_id,
        state,
        result_json,
        receipt,
        audit_pending: false,
    })
}

struct DispatchGuard<'a> {
    management: &'a Management,
    operation_id: String,
    finished: bool,
}

impl Drop for DispatchGuard<'_> {
    fn drop(&mut self) {
        if !self.finished
            && let Ok(response) = response(Some(self.operation_id.clone()), Outcome::Unknown)
        {
            // Failed journal persistence leaves Executing for the next exclusive owner.
            let _ = self
                .management
                .save_with_audit(&self.operation_id, &response, "interrupted");
        }
    }
}

fn journal_lease(path: &Path) -> Result<File, Error> {
    let parent = path
        .parent()
        .ok_or(Error::InvalidInput)?
        .canonicalize()
        .map_err(|_| Error::Unavailable)?;
    let mut name = path.file_name().ok_or(Error::InvalidInput)?.to_os_string();
    name.push(".management-lock");
    let lock_path = parent.join(name);
    if let Ok(metadata) = std::fs::symlink_metadata(&lock_path)
        && !metadata.file_type().is_file()
    {
        return Err(Error::Unavailable);
    }
    let lock = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(lock_path)
        .map_err(|_| Error::Unavailable)?;
    fs2::FileExt::try_lock_exclusive(&lock).map_err(|_| Error::Unavailable)?;
    Ok(lock)
}

fn intent_digest(
    deployment: &str,
    entry: &Entry,
    subject: &str,
    input: &Value,
    expected_revision: Option<&str>,
    expires_at: &str,
) -> Result<String, Error> {
    let canonical = serde_json::json!({"canonicalization":1,"deployment":deployment,"entry":entry,"subject":subject,"input":input,"expected_revision":expected_revision,"expires_at":expires_at});
    let bytes = serde_json::to_vec(&canonicalize(canonical)).map_err(|_| Error::InvalidInput)?;
    Ok(format!("{:x}", Sha256::digest(bytes)))
}

fn binding_digest(entry: &Entry) -> Result<String, Error> {
    let bytes = serde_json::to_vec(&canonicalize(
        serde_json::to_value(entry).map_err(|_| Error::InvalidInput)?,
    ))
    .map_err(|_| Error::InvalidInput)?;
    Ok(format!("{:x}", Sha256::digest(bytes)))
}

fn canonicalize(value: Value) -> Value {
    match value {
        Value::Object(object) => Value::Object(
            object
                .into_iter()
                .map(|(key, value)| (key, canonicalize(value)))
                .collect::<BTreeMap<_, _>>()
                .into_iter()
                .collect(),
        ),
        Value::Array(values) => Value::Array(values.into_iter().map(canonicalize).collect()),
        value => value,
    }
}

#[cfg(test)]
mod tests;
