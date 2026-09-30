//! Finite private owner storage. It never accepts SQL, credentials or business callbacks.
use crate::{
    AuditEvent, Binding, Error, Intent, IntentParameters, IntentSeal, InvocationState,
    InvokeResponse, Management, Record, accept_bindings, format_time,
};
use futures::future::LocalBoxFuture;
use lenso_kernel::InvocationContext;
use serde::{Deserialize, Serialize};
use std::rc::Rc;

/// An explicitly selected owner adapter must durably implement these atomic operations.
/// Reads use the primary/causal database session. Runtime readiness only checks the version.
pub trait Journal: std::fmt::Debug {
    fn execute(
        &self,
        request: JournalRequest,
    ) -> LocalBoxFuture<'_, Result<JournalResponse, Error>>;
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case", deny_unknown_fields)]
pub enum JournalRequest {
    Inspect,
    Reserve {
        deployment: String,
        key: String,
        record: Record,
    },
    Load {
        deployment: String,
        operation_id: String,
    },
    Claim {
        deployment: String,
        operation_id: String,
        response: InvokeResponse,
        execution_until_ms: i64,
    },
    Complete {
        deployment: String,
        operation_id: String,
        response: InvokeResponse,
        event: AuditEvent,
    },
    Recover {
        deployment: String,
        operation_id: String,
        execution_until_ms: i64,
        now_ms: i64,
        event: AuditEvent,
    },
    Enqueue {
        deployment: String,
        event: AuditEvent,
    },
    PendingEvents {
        deployment: String,
        operation_id: String,
    },
    Acknowledge {
        deployment: String,
        operation_id: String,
        phase: String,
    },
    RefreshAudit {
        deployment: String,
        operation_id: String,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    content = "value",
    rename_all = "snake_case",
    deny_unknown_fields
)]
pub enum JournalResponse {
    Ready,
    Record(Box<Record>),
    Claimed(bool),
    Events(Vec<AuditEvent>),
    Done,
}

impl Management {
    /// This does not create tables, recover active claims, or grant operator qualification.
    pub async fn from_store(
        deployment: String,
        revision: String,
        bindings: Vec<Binding>,
        authority: Rc<dyn crate::Authority>,
        journal: Rc<dyn Journal>,
    ) -> Result<Self, Error> {
        if deployment.is_empty()
            || deployment.len() > 128
            || revision.is_empty()
            || revision.len() > 128
            || bindings.len() > 256
        {
            return Err(Error::InvalidInput);
        }
        if !matches!(
            journal.execute(JournalRequest::Inspect).await?,
            JournalResponse::Ready
        ) {
            return Err(Error::Unavailable);
        }
        Ok(Self {
            deployment,
            revision,
            entries: accept_bindings(bindings)?,
            authority,
            #[cfg(not(target_arch = "wasm32"))]
            journal: None,
            #[cfg(not(target_arch = "wasm32"))]
            _lease: None,
            owned_journal: Some(journal),
        })
    }

    #[cfg(not(target_arch = "wasm32"))]
    pub(crate) fn native_connection(
        &self,
    ) -> Result<&std::cell::RefCell<rusqlite::Connection>, Error> {
        self.journal.as_ref().ok_or(Error::Unavailable)
    }

    pub(super) async fn peek_async(&self, id: &str) -> Result<Record, Error> {
        let Some(store) = &self.owned_journal else {
            #[cfg(not(target_arch = "wasm32"))]
            return self.load(id);
            #[cfg(target_arch = "wasm32")]
            return Err(Error::Unavailable);
        };
        let JournalResponse::Record(record) = store
            .execute(JournalRequest::Load {
                deployment: self.deployment.clone(),
                operation_id: id.into(),
            })
            .await?
        else {
            return Err(Error::Unavailable);
        };
        Ok(*record)
    }

    pub(super) async fn load_async(&self, id: &str) -> Result<Record, Error> {
        let record = self.peek_async(id).await?;
        let Some(store) = &self.owned_journal else {
            return Ok(record);
        };
        let now_ms = wall_ms(self.authority.wall_now())?;
        if record.response.state == InvocationState::Executing
            && let Some(until) = record.execution_until_ms.filter(|until| *until <= now_ms)
        {
            let event = AuditEvent {
                intent: self.intent(&record)?,
                actor: None,
                decision: None,
                phase: "interrupted".into(),
                state: InvocationState::Unknown,
                receipt: None,
                occurred_at: format_time(self.authority.wall_now())?,
            };
            let JournalResponse::Record(recovered) = store
                .execute(JournalRequest::Recover {
                    deployment: self.deployment.clone(),
                    operation_id: id.into(),
                    execution_until_ms: until,
                    now_ms,
                    event,
                })
                .await?
            else {
                return Err(Error::Unavailable);
            };
            return Ok(*recovered);
        }
        Ok(record)
    }

    pub(super) async fn intent_expiration_async(
        &self,
        subject: &str,
        entry: &str,
        key: &str,
    ) -> Result<String, Error> {
        if self.owned_journal.is_some() {
            // Reserve returns the existing expiry on a concurrent duplicate. Its digest is
            // checked again against that durable expiry before any owner call.
            return format_time(self.authority.wall_now() + time::Duration::seconds(300));
        }
        #[cfg(not(target_arch = "wasm32"))]
        return self.intent_expiration(subject, entry, key);
        #[cfg(target_arch = "wasm32")]
        {
            let _ = (subject, entry, key);
            Err(Error::Unavailable)
        }
    }

    pub(super) async fn reserve_async(
        &self,
        subject: &str,
        entry: &crate::Entry,
        key: &str,
        seal: IntentSeal<'_>,
        parameters: &IntentParameters,
    ) -> Result<Record, Error> {
        let Some(store) = &self.owned_journal else {
            #[cfg(not(target_arch = "wasm32"))]
            return self.reserve(subject, entry, key, seal, parameters);
            #[cfg(target_arch = "wasm32")]
            return Err(Error::Unavailable);
        };
        use sha2::{Digest as _, Sha256};
        let identity = serde_json::to_vec(&(
            "management-operation-v1",
            &self.deployment,
            subject,
            &entry.id,
            key,
        ))
        .map_err(|_| Error::Unavailable)?;
        let operation_id = format!("{:x}", Sha256::digest(identity));
        let record = Record {
            subject: subject.into(),
            entry_id: entry.id.clone(),
            digest: seal.digest.into(),
            binding_digest: seal.binding_digest.into(),
            expires_at: seal.expires_at.into(),
            parameters: parameters.clone(),
            execution_until_ms: None,
            response: InvokeResponse {
                operation_id: Some(operation_id),
                state: if entry.requires_approval {
                    InvocationState::PendingApproval
                } else {
                    InvocationState::Ready
                },
                result_json: None,
                receipt: None,
                audit_pending: true,
            },
        };
        let JournalResponse::Record(record) = store
            .execute(JournalRequest::Reserve {
                deployment: self.deployment.clone(),
                key: key.into(),
                record,
            })
            .await?
        else {
            return Err(Error::Unavailable);
        };
        Ok(*record)
    }

    pub(super) async fn claim_execution_async(
        &self,
        id: &str,
        response: &InvokeResponse,
        context: &InvocationContext,
        intent_expiry: &str,
    ) -> Result<bool, Error> {
        let Some(store) = &self.owned_journal else {
            #[cfg(not(target_arch = "wasm32"))]
            return self.claim_execution(id, response);
            #[cfg(target_arch = "wasm32")]
            return Err(Error::Unavailable);
        };
        // Relative Driver time is used only to bound this event. The persisted lease is
        // absolute wall time and remains meaningful in a new Worker isolate.
        let budget = context
            .deadline()
            .map(|deadline| deadline.saturating_sub(self.authority.now()))
            .unwrap_or(std::time::Duration::from_secs(30))
            .min(std::time::Duration::from_secs(30));
        let until = (self.authority.wall_now()
            + time::Duration::try_from(budget).map_err(|_| Error::Unavailable)?)
        .min(crate::parse_time(intent_expiry)?);
        let JournalResponse::Claimed(claimed) = store
            .execute(JournalRequest::Claim {
                deployment: self.deployment.clone(),
                operation_id: id.into(),
                response: response.clone(),
                execution_until_ms: wall_ms(until)?,
            })
            .await?
        else {
            return Err(Error::Unavailable);
        };
        Ok(claimed)
    }

    pub(super) async fn queue_audit_async(
        &self,
        intent: &Intent,
        phase: &str,
        state: InvocationState,
        receipt: Option<String>,
    ) -> Result<(), Error> {
        let event = AuditEvent {
            intent: intent.clone(),
            actor: None,
            decision: None,
            phase: phase.into(),
            state,
            receipt,
            occurred_at: format_time(self.authority.wall_now())?,
        };
        self.enqueue_async(&event).await
    }

    pub(super) async fn enqueue_async(&self, event: &AuditEvent) -> Result<(), Error> {
        if let Some(store) = &self.owned_journal {
            return done(
                store
                    .execute(JournalRequest::Enqueue {
                        deployment: self.deployment.clone(),
                        event: event.clone(),
                    })
                    .await?,
            );
        }
        #[cfg(not(target_arch = "wasm32"))]
        {
            use rusqlite::params;
            let mut connection = self.native_connection()?.borrow_mut();
            let transaction = connection.transaction().map_err(|_| Error::Unavailable)?;
            transaction.execute("INSERT OR IGNORE INTO management_audit_outbox(operation_id,phase,event_json) VALUES(?1,?2,?3)",
                params![event.intent.operation_id, event.phase, serde_json::to_string(event).map_err(|_| Error::Unavailable)?]).map_err(|_| Error::Unavailable)?;
            transaction.execute("UPDATE management_invocations SET response_json=json_set(response_json,'$.audit_pending',json('true')) WHERE operation_id=?1",
                [&event.intent.operation_id]).map_err(|_| Error::Unavailable)?;
            transaction.commit().map_err(|_| Error::Unavailable)
        }
        #[cfg(target_arch = "wasm32")]
        Err(Error::Unavailable)
    }

    pub(super) async fn save_with_audit_async(
        &self,
        id: &str,
        response: &InvokeResponse,
        phase: &str,
    ) -> Result<(), Error> {
        let Some(store) = &self.owned_journal else {
            #[cfg(not(target_arch = "wasm32"))]
            return self.save_with_audit(id, response, phase);
            #[cfg(target_arch = "wasm32")]
            return Err(Error::Unavailable);
        };
        let record = self.load_async(id).await?;
        let event = AuditEvent {
            intent: self.intent(&record)?,
            actor: None,
            decision: None,
            phase: phase.into(),
            state: response.state.clone(),
            receipt: response.receipt.clone(),
            occurred_at: format_time(self.authority.wall_now())?,
        };
        done(
            store
                .execute(JournalRequest::Complete {
                    deployment: self.deployment.clone(),
                    operation_id: id.into(),
                    response: response.clone(),
                    event,
                })
                .await?,
        )
    }

    pub(super) async fn pending_events_async(&self, id: &str) -> Result<Vec<AuditEvent>, Error> {
        if let Some(store) = &self.owned_journal {
            let JournalResponse::Events(events) = store
                .execute(JournalRequest::PendingEvents {
                    deployment: self.deployment.clone(),
                    operation_id: id.into(),
                })
                .await?
            else {
                return Err(Error::Unavailable);
            };
            return Ok(events);
        }
        #[cfg(not(target_arch = "wasm32"))]
        {
            let connection = self.native_connection()?.borrow();
            let mut statement = connection.prepare("SELECT event_json FROM management_audit_outbox WHERE operation_id=?1 AND sent=0 ORDER BY rowid").map_err(|_| Error::Unavailable)?;
            let wires = statement
                .query_map([id], |row| row.get::<_, String>(0))
                .map_err(|_| Error::Unavailable)?;
            wires
                .map(|wire| {
                    serde_json::from_str(&wire.map_err(|_| Error::Unavailable)?)
                        .map_err(|_| Error::Unavailable)
                })
                .collect()
        }
        #[cfg(target_arch = "wasm32")]
        Err(Error::Unavailable)
    }
    pub(super) async fn acknowledge_async(&self, id: &str, phase: &str) -> Result<(), Error> {
        if let Some(store) = &self.owned_journal {
            return done(
                store
                    .execute(JournalRequest::Acknowledge {
                        deployment: self.deployment.clone(),
                        operation_id: id.into(),
                        phase: phase.into(),
                    })
                    .await?,
            );
        }
        #[cfg(not(target_arch = "wasm32"))]
        {
            self.native_connection()?
                .borrow()
                .execute(
                    "UPDATE management_audit_outbox SET sent=1 WHERE operation_id=?1 AND phase=?2",
                    [id, phase],
                )
                .map(|_| ())
                .map_err(|_| Error::Unavailable)
        }

        #[cfg(target_arch = "wasm32")]
        Err(Error::Unavailable)
    }
    pub(super) async fn refresh_audit_async(&self, id: &str) -> Result<(), Error> {
        if let Some(store) = &self.owned_journal {
            return done(
                store
                    .execute(JournalRequest::RefreshAudit {
                        deployment: self.deployment.clone(),
                        operation_id: id.into(),
                    })
                    .await?,
            );
        }
        #[cfg(not(target_arch = "wasm32"))]
        {
            self.native_connection()?.borrow().execute(
            "UPDATE management_invocations SET response_json=json_set(response_json,'$.audit_pending',json(CASE WHEN EXISTS(SELECT 1 FROM management_audit_outbox WHERE operation_id=?1 AND sent=0) THEN 'true' ELSE 'false' END)) WHERE operation_id=?1", [id])
            .map(|_| ()).map_err(|_| Error::Unavailable)
        }

        #[cfg(target_arch = "wasm32")]
        Err(Error::Unavailable)
    }

    pub async fn pending_approval_intent_async(
        &self,
        id: &str,
    ) -> Result<(Intent, crate::Entry), Error> {
        let record = self.peek_async(id).await?;
        let accepted = self.entries.get(&record.entry_id).ok_or(Error::NotFound)?;
        if !accepted.entry.requires_approval
            || record.response.state != InvocationState::PendingApproval
            || crate::binding_digest(&accepted.entry)? != record.binding_digest
        {
            return Err(Error::Conflict);
        }
        Ok((self.intent(&record)?, accepted.entry.clone()))
    }
    pub async fn pending_approval_parameters_async(
        &self,
        id: &str,
    ) -> Result<IntentParameters, Error> {
        let (intent, entry) = self.pending_approval_intent_async(id).await?;
        let record = self.peek_async(id).await?;
        if crate::intent_digest(
            &intent.deployment,
            &entry,
            &intent.subject,
            &record.parameters.input,
            record.parameters.expected_revision.as_deref(),
            &intent.expires_at,
        )? != intent.digest
        {
            return Err(Error::Conflict);
        }
        Ok(record.parameters)
    }
    pub async fn audit_pending_async(&self, id: &str) -> Result<bool, Error> {
        Ok(self.peek_async(id).await?.response.audit_pending)
    }
}
fn done(response: JournalResponse) -> Result<(), Error> {
    if matches!(response, JournalResponse::Done) {
        Ok(())
    } else {
        Err(Error::Unavailable)
    }
}
fn wall_ms(now: time::OffsetDateTime) -> Result<i64, Error> {
    i64::try_from(now.unix_timestamp_nanos() / 1_000_000).map_err(|_| Error::Unavailable)
}
