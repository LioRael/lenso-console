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
        if version == 4 {
            return Ok(());
        }
        if version != 3 {
            return Err(Error::Unavailable);
        }
        connection.execute_batch("BEGIN IMMEDIATE; CREATE TABLE management_external_mutations(operation_id TEXT PRIMARY KEY, deployment TEXT NOT NULL, subject TEXT NOT NULL, kind TEXT NOT NULL, idempotency_key TEXT NOT NULL, intent_json TEXT NOT NULL, parameters_digest TEXT NOT NULL, state_json TEXT NOT NULL, receipt_json TEXT, UNIQUE(deployment,subject,kind,idempotency_key)); PRAGMA user_version = 4; COMMIT;").map_err(|_| Error::Unavailable)
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
        let mut journal = self.journal.borrow_mut();
        let transaction = journal
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .map_err(|_| Error::Unavailable)?;
        let prior: Option<(String,String,String,Option<String>)> = transaction.query_row("SELECT intent_json,parameters_digest,state_json,receipt_json FROM management_external_mutations WHERE deployment=?1 AND subject=?2 AND kind=?3 AND idempotency_key=?4", params![self.deployment,human.subject,kind,key], |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?))).optional().map_err(|_| Error::Unavailable)?;
        if let Some((intent, previous, state, receipt)) = prior {
            if previous != digest {
                return Err(Error::Conflict);
            }
            return Ok(ExternalMutation {
                intent: serde_json::from_str(&intent).map_err(|_| Error::Unavailable)?,
                state: serde_json::from_str(&state).map_err(|_| Error::Unavailable)?,
                receipt: receipt
                    .map(|wire| serde_json::from_str(&wire))
                    .transpose()
                    .map_err(|_| Error::Unavailable)?,
            });
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
                "INSERT INTO management_external_mutations VALUES(?1,?2,?3,?4,?5,?6,?7,?8,NULL)",
                params![
                    intent.operation_id,
                    self.deployment,
                    human.subject,
                    kind,
                    key,
                    serde_json::to_string(&intent).map_err(|_| Error::Unavailable)?,
                    intent.digest,
                    serde_json::to_string(&InvocationState::Ready)
                        .map_err(|_| Error::Unavailable)?
                ],
            )
            .map_err(|_| Error::Unavailable)?;
        transaction.commit().map_err(|_| Error::Unavailable)?;
        Ok(ExternalMutation {
            intent,
            state: InvocationState::Ready,
            receipt: None,
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
        let count = self.journal.borrow().execute("UPDATE management_external_mutations SET state_json=?2 WHERE operation_id=?1 AND state_json=?3", params![mutation.intent.operation_id,serde_json::to_string(&InvocationState::Executing).map_err(|_| Error::Unavailable)?,serde_json::to_string(&InvocationState::Ready).map_err(|_| Error::Unavailable)?]).map_err(|_| Error::Unavailable)?;
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
        self.journal.borrow().execute("INSERT OR IGNORE INTO management_audit_outbox(operation_id,phase,event_json) VALUES(?1,?2,?3)", params![mutation.intent.operation_id,phase,serde_json::to_string(&event).map_err(|_| Error::Unavailable)?]).map_err(|_| Error::Unavailable)?;
        Ok(())
    }

    pub fn external_record(
        &self,
        mutation: &ExternalMutation,
        state: InvocationState,
        receipt: Option<Value>,
    ) -> Result<(), Error> {
        let updated = ExternalMutation {
            intent: mutation.intent.clone(),
            state,
            receipt,
        };
        let mut journal = self.journal.borrow_mut();
        let transaction = journal.transaction().map_err(|_| Error::Unavailable)?;
        transaction.execute("UPDATE management_external_mutations SET state_json=?2,receipt_json=?3 WHERE operation_id=?1",params![updated.intent.operation_id,serde_json::to_string(&updated.state).map_err(|_| Error::Unavailable)?,updated.receipt.as_ref().map(serde_json::to_string).transpose().map_err(|_| Error::Unavailable)?]).map_err(|_| Error::Unavailable)?;
        let phase = if mutation.state == InvocationState::Unknown
            && updated.state == InvocationState::Succeeded
        {
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
            .external_record(&self.mutation, state, receipt)?;
        self.armed = false;
        Ok(())
    }
}
impl Drop for ExternalDispatchGuard {
    fn drop(&mut self) {
        if self.armed {
            let _ = self
                .management
                .external_record(&self.mutation, InvocationState::Unknown, None);
        }
    }
}
