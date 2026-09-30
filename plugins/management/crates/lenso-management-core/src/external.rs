//! Durable audit plans for explicitly bound human mutations outside the domain catalog.
use super::{
    AuditEvent, Error, Intent, InvocationState, Management, Principal, canonicalize, format_time,
};
use lenso_kernel::InvocationContext;
use rusqlite::{OptionalExtension, params};
use serde_json::Value;
use sha2::{Digest as _, Sha256};
use std::rc::Rc;

#[derive(Clone, Debug)]
pub struct ExternalMutation {
    pub intent: Intent,
    pub state: InvocationState,
    pub parameters: Value,
    /// A non-secret owner receipt. Raw credentials must never be passed here.
    pub receipt: Option<Value>,
}

impl Management {
    /// Explicit operator migration. Runtime open continues to reject an older journal.
    pub fn upgrade_journal(path: &std::path::Path) -> Result<(), Error> {
        let _lease = super::journal_lease(path)?;
        let connection = rusqlite::Connection::open_with_flags(
            path,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE,
        )
        .map_err(|_| Error::Unavailable)?;
        let version: i64 = connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .map_err(|_| Error::Unavailable)?;
        if version == 5 {
            return Ok(());
        }
        if !matches!(version, 3 | 4) {
            return Err(Error::Unavailable);
        }
        let migration = if version == 3 {
            "BEGIN IMMEDIATE; CREATE TABLE management_external_mutations(operation_id TEXT PRIMARY KEY, deployment TEXT NOT NULL, subject TEXT NOT NULL, kind TEXT NOT NULL, idempotency_key TEXT NOT NULL, intent_json TEXT NOT NULL, parameters_digest TEXT NOT NULL, parameters_json TEXT NOT NULL, state_json TEXT NOT NULL, receipt_json TEXT, UNIQUE(deployment,subject,kind,idempotency_key)); PRAGMA user_version = 5; COMMIT;"
        } else {
            "BEGIN IMMEDIATE; ALTER TABLE management_external_mutations ADD COLUMN parameters_json TEXT NOT NULL DEFAULT 'null'; PRAGMA user_version=5; COMMIT;"
        };
        connection
            .execute_batch(migration)
            .map_err(|_| Error::Unavailable)
    }

    /// Explicit operator recovery with the runtime stopped. This never erases a possible dispatch.
    pub fn abandon_rejected_external(
        path: &std::path::Path,
        deployment: &str,
        subject: &str,
        key: &str,
    ) -> Result<(), Error> {
        let _lease = super::journal_lease(&path.canonicalize().map_err(|_| Error::Unavailable)?)?;
        let connection = rusqlite::Connection::open_with_flags(
            path,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE,
        )
        .map_err(|_| Error::Unavailable)?;
        let version: i64 = connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .map_err(|_| Error::Unavailable)?;
        if version != 5
            || [deployment, subject, key]
                .iter()
                .any(|value| value.is_empty() || value.len() > 256)
        {
            return Err(Error::InvalidInput);
        }
        let wire: Option<String> = connection.query_row("SELECT state_json FROM management_external_mutations WHERE deployment=?1 AND subject=?2 AND kind='auth.pat.issue' AND idempotency_key=?3", params![deployment,subject,key], |row| row.get(0)).optional().map_err(|_| Error::Unavailable)?;
        if let Some(wire) = wire {
            let state: InvocationState =
                serde_json::from_str(&wire).map_err(|_| Error::Unavailable)?;
            if !matches!(
                state,
                InvocationState::Ready | InvocationState::Cancelled | InvocationState::Failed
            ) {
                return Err(Error::Conflict);
            }
            connection.execute("UPDATE management_external_mutations SET state_json=?4 WHERE deployment=?1 AND subject=?2 AND kind='auth.pat.issue' AND idempotency_key=?3", params![deployment,subject,key,serde_json::to_string(&InvocationState::Cancelled).map_err(|_|Error::Unavailable)?]).map_err(|_|Error::Unavailable)?;
        }
        Ok(())
    }

    pub(super) fn recover_external(&self) -> Result<(), Error> {
        let mutations: Vec<(String, String, String)> = {
            let journal = self.native_connection()?.borrow();
            let mut statement = journal.prepare("SELECT intent_json,state_json,parameters_json FROM management_external_mutations WHERE deployment=?1 AND state_json=?2").map_err(|_|Error::Unavailable)?;
            statement
                .query_map(
                    params![
                        self.deployment,
                        serde_json::to_string(&InvocationState::Executing)
                            .map_err(|_| Error::Unavailable)?
                    ],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .map_err(|_| Error::Unavailable)?
                .collect::<Result<_, _>>()
                .map_err(|_| Error::Unavailable)?
        };
        for (intent, state, parameters) in mutations {
            self.external_record(
                &ExternalMutation {
                    intent: serde_json::from_str(&intent).map_err(|_| Error::Unavailable)?,
                    state: serde_json::from_str(&state).map_err(|_| Error::Unavailable)?,
                    parameters: serde_json::from_str(&parameters)
                        .map_err(|_| Error::Unavailable)?,
                    receipt: None,
                },
                InvocationState::Unknown,
                None,
            )?;
        }
        Ok(())
    }

    /// Host-only reservation; this API is absent from Management tools and external JSON.
    pub fn external_reserve(
        &self,
        context: &InvocationContext,
        human: &Principal,
        kind: &str,
        key: &str,
        parameters: &Value,
    ) -> Result<ExternalMutation, Error> {
        self.check_context(context)?;
        if !matches!(kind, "auth.pat.issue" | "auth.pat.revoke")
            || key.is_empty()
            || key.len() > 256
            || human.subject.is_empty()
            || human.subject.len() > 256
        {
            return Err(Error::InvalidInput);
        }
        let bytes = serde_json::to_vec(&canonicalize(parameters.clone()))
            .map_err(|_| Error::InvalidInput)?;
        if bytes.len() > 32768 {
            return Err(Error::InvalidInput);
        }
        let digest = format!("{:x}", Sha256::digest(bytes));
        let mut journal = self.native_connection()?.borrow_mut();
        let transaction = journal
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .map_err(|_| Error::Unavailable)?;
        let prior: Option<(String,String,String,Option<String>,String)> = transaction.query_row("SELECT intent_json,parameters_digest,state_json,receipt_json,parameters_json FROM management_external_mutations WHERE deployment=?1 AND subject=?2 AND kind=?3 AND idempotency_key=?4", params![self.deployment,human.subject,kind,key], |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?,row.get(4)?))).optional().map_err(|_| Error::Unavailable)?;
        if let Some((intent, previous, state, receipt, parameters)) = prior {
            if previous != digest {
                return Err(Error::Conflict);
            }
            return Ok(ExternalMutation {
                intent: serde_json::from_str(&intent).map_err(|_| Error::Unavailable)?,
                state: serde_json::from_str(&state).map_err(|_| Error::Unavailable)?,
                parameters: serde_json::from_str(&parameters).map_err(|_| Error::Unavailable)?,
                receipt: receipt
                    .map(|wire| serde_json::from_str(&wire))
                    .transpose()
                    .map_err(|_| Error::Unavailable)?,
            });
        }
        if kind == "auth.pat.issue" {
            let unfinished: bool = transaction.query_row("SELECT EXISTS(SELECT 1 FROM management_external_mutations WHERE deployment=?1 AND subject=?2 AND kind=?3 AND json_extract(state_json,'$') IN ('ready','executing','unknown'))", params![self.deployment,human.subject,kind], |row| row.get(0)).map_err(|_| Error::Unavailable)?;
            if unfinished {
                return Err(Error::Conflict);
            }
        }
        let intent = Intent {
            operation_id: uuid::Uuid::new_v4().to_string(),
            subject: human.subject.clone(),
            deployment: self.deployment.clone(),
            entry_id: kind.into(),
            digest,
            expires_at: format_time(self.authority.wall_now() + time::Duration::seconds(300))?,
        };
        transaction
            .execute(
                "INSERT INTO management_external_mutations(operation_id,deployment,subject,kind,idempotency_key,intent_json,parameters_digest,state_json,parameters_json) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)",
                params![
                    intent.operation_id,
                    self.deployment,
                    human.subject,
                    kind,
                    key,
                    serde_json::to_string(&intent).map_err(|_| Error::Unavailable)?,
                    intent.digest,
                    serde_json::to_string(&InvocationState::Ready)
                        .map_err(|_| Error::Unavailable)?,
                    serde_json::to_string(parameters).map_err(|_| Error::Unavailable)?
                ],
            )
            .map_err(|_| Error::Unavailable)?;
        transaction.commit().map_err(|_| Error::Unavailable)?;
        Ok(ExternalMutation {
            intent,
            state: InvocationState::Ready,
            parameters: parameters.clone(),
            receipt: None,
        })
    }

    /// Receipt lookup is scoped to the currently authorized human and exact original key.
    pub fn external_lookup(
        &self,
        human: &Principal,
        kind: &str,
        key: &str,
    ) -> Result<ExternalMutation, Error> {
        let wire: Option<(String, String, Option<String>, String)> = self.native_connection()?.borrow().query_row("SELECT intent_json,state_json,receipt_json,parameters_json FROM management_external_mutations WHERE deployment=?1 AND subject=?2 AND kind=?3 AND idempotency_key=?4", params![self.deployment,human.subject,kind,key], |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?))).optional().map_err(|_| Error::Unavailable)?;
        let (intent, state, receipt, parameters) = wire.ok_or(Error::NotFound)?;
        let intent: Intent = serde_json::from_str(&intent).map_err(|_| Error::Unavailable)?;
        let parameters: Value =
            serde_json::from_str(&parameters).map_err(|_| Error::Unavailable)?;
        let digest = format!(
            "{:x}",
            Sha256::digest(
                serde_json::to_vec(&canonicalize(parameters.clone()))
                    .map_err(|_| Error::Unavailable)?
            )
        );
        if intent.digest != digest {
            return Err(Error::Unavailable);
        }
        Ok(ExternalMutation {
            intent,
            state: serde_json::from_str(&state).map_err(|_| Error::Unavailable)?,
            parameters,
            receipt: receipt
                .map(|wire| serde_json::from_str(&wire))
                .transpose()
                .map_err(|_| Error::Unavailable)?,
        })
    }

    pub async fn external_attempt(
        &self,
        context: &InvocationContext,
        mutation: &ExternalMutation,
    ) -> Result<(), Error> {
        self.external_event(mutation, "external_attempt")?;
        self.flush_audit_events(context, &mutation.intent.operation_id)
            .await
    }

    pub fn external_claim(
        self: &Rc<Self>,
        context: &InvocationContext,
        mutation: &ExternalMutation,
    ) -> Result<ExternalDispatchGuard, Error> {
        self.check_context(context)?;
        if super::parse_time(&mutation.intent.expires_at)? <= self.authority.wall_now() {
            return Err(Error::Expired);
        }
        let count = self.native_connection()?.borrow().execute("UPDATE management_external_mutations SET state_json=?2 WHERE operation_id=?1 AND state_json=?3", params![mutation.intent.operation_id,serde_json::to_string(&InvocationState::Executing).map_err(|_| Error::Unavailable)?,serde_json::to_string(&InvocationState::Ready).map_err(|_| Error::Unavailable)?]).map_err(|_| Error::Unavailable)?;
        if count != 1 {
            return Err(Error::Conflict);
        }
        Ok(ExternalDispatchGuard {
            management: self.clone(),
            mutation: mutation.clone(),
            armed: true,
        })
    }

    fn external_event(&self, mutation: &ExternalMutation, phase: &str) -> Result<(), Error> {
        let event = AuditEvent {
            intent: mutation.intent.clone(),
            actor: Some(mutation.intent.subject.clone()),
            decision: None,
            phase: phase.into(),
            state: mutation.state.clone(),
            receipt: mutation
                .receipt
                .as_ref()
                .and_then(|value| value.get("credential_id"))
                .and_then(Value::as_str)
                .map(str::to_owned),
            occurred_at: format_time(self.authority.wall_now())?,
        };
        self.native_connection()?.borrow().execute("INSERT OR IGNORE INTO management_audit_outbox(operation_id,phase,event_json) VALUES(?1,?2,?3)", params![mutation.intent.operation_id,phase,serde_json::to_string(&event).map_err(|_| Error::Unavailable)?]).map_err(|_| Error::Unavailable)?;
        Ok(())
    }

    pub fn external_record(
        &self,
        mutation: &ExternalMutation,
        state: InvocationState,
        receipt: Option<Value>,
    ) -> Result<(), Error> {
        self.external_record_guarded(mutation, state, receipt, false)
    }
    fn external_record_guarded(
        &self,
        mutation: &ExternalMutation,
        state: InvocationState,
        receipt: Option<Value>,
        executing_only: bool,
    ) -> Result<(), Error> {
        let updated = ExternalMutation {
            intent: mutation.intent.clone(),
            parameters: mutation.parameters.clone(),
            state,
            receipt,
        };
        let mut journal = self.native_connection()?.borrow_mut();
        let transaction = journal.transaction().map_err(|_| Error::Unavailable)?;
        let prior: String = transaction
            .query_row(
                "SELECT state_json FROM management_external_mutations WHERE operation_id=?1",
                [&updated.intent.operation_id],
                |row| row.get(0),
            )
            .map_err(|_| Error::Unavailable)?;
        let prior: InvocationState =
            serde_json::from_str(&prior).map_err(|_| Error::Unavailable)?;
        if (executing_only && prior != InvocationState::Executing)
            || (prior == InvocationState::Succeeded && updated.state != InvocationState::Succeeded)
        {
            return Ok(());
        }
        transaction.execute("UPDATE management_external_mutations SET state_json=?2,receipt_json=?3 WHERE operation_id=?1",params![updated.intent.operation_id,serde_json::to_string(&updated.state).map_err(|_| Error::Unavailable)?,updated.receipt.as_ref().map(serde_json::to_string).transpose().map_err(|_| Error::Unavailable)?]).map_err(|_| Error::Unavailable)?;
        let phase =
            if prior == InvocationState::Unknown && updated.state == InvocationState::Succeeded {
                "external_reconciled"
            } else {
                "external_completed"
            };
        // Persist the outcome and outbox atomically before returning an owner reply.
        let event = AuditEvent {
            intent: updated.intent.clone(),
            actor: Some(updated.intent.subject.clone()),
            decision: None,
            phase: phase.into(),
            state: updated.state,
            receipt: updated
                .receipt
                .as_ref()
                .and_then(|value| value.get("credential_id"))
                .and_then(Value::as_str)
                .map(str::to_owned),
            occurred_at: format_time(self.authority.wall_now())?,
        };
        transaction.execute("INSERT OR IGNORE INTO management_audit_outbox(operation_id,phase,event_json) VALUES(?1,?2,?3)", params![updated.intent.operation_id,event.phase,serde_json::to_string(&event).map_err(|_| Error::Unavailable)?]).map_err(|_| Error::Unavailable)?;
        transaction.commit().map_err(|_| Error::Unavailable)
    }

    pub async fn external_flush(
        &self,
        context: &InvocationContext,
        mutation: &ExternalMutation,
    ) -> Result<(), Error> {
        self.flush_audit_events(context, &mutation.intent.operation_id)
            .await
    }
}

pub struct ExternalDispatchGuard {
    management: Rc<Management>,
    mutation: ExternalMutation,
    armed: bool,
}
impl ExternalDispatchGuard {
    pub fn complete(mut self, state: InvocationState, receipt: Option<Value>) -> Result<(), Error> {
        self.management
            .external_record_guarded(&self.mutation, state, receipt, true)?;
        self.armed = false;
        Ok(())
    }
}
impl Drop for ExternalDispatchGuard {
    fn drop(&mut self) {
        if self.armed {
            let _ = self.management.external_record_guarded(
                &self.mutation,
                InvocationState::Unknown,
                None,
                true,
            );
        }
    }
}
