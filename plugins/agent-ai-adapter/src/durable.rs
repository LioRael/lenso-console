//! SQLite reservations commit before any paid invocation. Unknown results retain
//! the full reservation. Crashed reserved rows block concurrency until reviewed.
use crate::{CompletionRequest, HostCaller, Price, PurposeProfile, Rejection, RunEvidence, cost};
use rusqlite::{Connection, TransactionBehavior, params};
use std::{
    path::Path,
    sync::{Arc, Mutex},
    time::Duration,
};

#[derive(Clone, Debug)]
pub struct DurableAdmission {
    profile: PurposeProfile,
    connection: Arc<Mutex<Connection>>,
}

pub struct DurableReservation {
    connection: Arc<Mutex<Connection>>,
    id: String,
    amount: u64,
    input_ceiling: u64,
    output_ceiling: u64,
    price: Price,
    caller: HostCaller,
    model: String,
    finished: bool,
}

impl DurableAdmission {
    pub fn recovery_binding(
        &self,
        id: &str,
        caller: &HostCaller,
    ) -> Result<serde_json::Value, Rejection> {
        if !self.profile.callers.contains(caller) {
            return Err(Rejection::Unauthorized);
        }
        let connection = self.connection.lock().map_err(|_| Rejection::Ledger)?;
        let admission: String = connection
            .query_row(
                "SELECT admission FROM runs WHERE id=?1 AND state='reserved'",
                [id],
                |r| r.get(0),
            )
            .map_err(|_| Rejection::Unauthorized)?;
        let admission: serde_json::Value =
            serde_json::from_str(&admission).map_err(|_| Rejection::Ledger)?;
        if admission["caller"] != serde_json::to_value(caller).map_err(|_| Rejection::Ledger)? {
            return Err(Rejection::Unauthorized);
        }
        Ok(admission["binding"].clone())
    }

    /// Call only after the authenticated Agent proves a successful provider terminal.
    /// Keep the entire charge; no replay and no unknown-cost refund.
    pub fn recover_with_terminal_receipt(
        &self,
        id: &str,
        caller: &HostCaller,
    ) -> Result<(), Rejection> {
        self.recovery_binding(id, caller)?;
        let changed = self
            .connection
            .lock()
            .map_err(|_| Rejection::Ledger)?
            .execute(
                "UPDATE runs SET state='unknown',evidence=?1 WHERE id=?2 AND state='reserved'",
                params![
                    "{\"recovery\":\"authenticated-provider-terminal\",\"refund\":false}",
                    id
                ],
            )
            .map_err(|_| Rejection::Ledger)?;
        if changed != 1 {
            return Err(Rejection::Ledger);
        }
        Ok(())
    }

    pub fn open(path: &Path, profile: PurposeProfile) -> Result<Self, Rejection> {
        if !path.is_absolute() {
            return Err(Rejection::Ledger);
        }
        let mut connection = Connection::open(path).map_err(|_| Rejection::Ledger)?;
        connection
            .busy_timeout(Duration::from_secs(2))
            .map_err(|_| Rejection::Ledger)?;
        let version: i64 = connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .map_err(|_| Rejection::Ledger)?;
        let tables: i64 = connection.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", [], |row| row.get(0)).map_err(|_| Rejection::Ledger)?;
        if !matches!((version, tables), (0, 0) | (1, 2)) {
            return Err(Rejection::Ledger);
        }
        if version == 1 {
            let owned: i64 = connection.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('policy','runs')", [], |row| row.get(0)).map_err(|_| Rejection::Ledger)?;
            if owned != 2 {
                return Err(Rejection::Ledger);
            }
        }
        connection.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
            CREATE TABLE IF NOT EXISTS policy (id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, state TEXT NOT NULL,
            charge INTEGER NOT NULL CHECK(charge>=0), admission TEXT NOT NULL, evidence TEXT);
            PRAGMA user_version=1;").map_err(|_| Rejection::Ledger)?;
        let policy = serde_json::to_string(&profile).map_err(|_| Rejection::Ledger)?;
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|_| Rejection::Ledger)?;
        transaction
            .execute(
                "INSERT OR IGNORE INTO policy(id,json) VALUES(1,?1)",
                [&policy],
            )
            .map_err(|_| Rejection::Ledger)?;
        let existing: String = transaction
            .query_row("SELECT json FROM policy WHERE id=1", [], |row| row.get(0))
            .map_err(|_| Rejection::Ledger)?;
        if existing != policy {
            return Err(Rejection::Ledger);
        }
        transaction.commit().map_err(|_| Rejection::Ledger)?;
        Ok(Self {
            profile,
            connection: Arc::new(Mutex::new(connection)),
        })
    }

    pub fn authorize(
        &self,
        caller: &HostCaller,
        request: &CompletionRequest,
    ) -> Result<(), Rejection> {
        if !self.profile.callers.contains(caller) {
            return Err(Rejection::Unauthorized);
        }
        if request.model != self.profile.model {
            return Err(Rejection::Model);
        }
        if request.max_output == 0 || request.max_output > self.profile.max_output {
            return Err(Rejection::Limit);
        }
        self.profile
            .price
            .as_ref()
            .filter(|p| !p.version.is_empty())
            .ok_or(Rejection::UnknownPrice)?;
        Ok(())
    }

    pub fn reserve(
        &self,
        id: String,
        caller: &HostCaller,
        request: &CompletionRequest,
        input_ceiling: u64,
        binding: &serde_json::Value,
    ) -> Result<DurableReservation, Rejection> {
        self.authorize(caller, request)?;
        if input_ceiling == 0 {
            return Err(Rejection::UnmeteredInput);
        }
        let price = self.profile.price.clone().ok_or(Rejection::UnknownPrice)?;
        let amount = cost(&price, input_ceiling, request.max_output)?;
        let charge = i64::try_from(amount).map_err(|_| Rejection::Budget)?;
        let admission = serde_json::to_string(&serde_json::json!({"caller":caller,"model":request.model,
            "price_version":price.version,"input_ceiling":input_ceiling,"output_ceiling":request.max_output,"binding":binding}))
            .map_err(|_| Rejection::Ledger)?;
        let mut connection = self.connection.lock().map_err(|_| Rejection::Ledger)?;
        let tx = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|_| Rejection::Ledger)?;
        let active: i64 = tx
            .query_row(
                "SELECT COUNT(*) FROM runs WHERE state='reserved'",
                [],
                |r| r.get(0),
            )
            .map_err(|_| Rejection::Ledger)?;
        if usize::try_from(active).map_err(|_| Rejection::Ledger)? >= self.profile.concurrency {
            return Err(Rejection::Concurrency);
        }
        let used: i64 = tx
            .query_row("SELECT COALESCE(SUM(charge),0) FROM runs", [], |r| r.get(0))
            .map_err(|_| Rejection::Ledger)?;
        let used = u64::try_from(used).map_err(|_| Rejection::Ledger)?;
        if used
            .checked_add(amount)
            .filter(|total| *total <= self.profile.budget)
            .is_none()
        {
            return Err(Rejection::Budget);
        }
        tx.execute(
            "INSERT INTO runs(id,state,charge,admission) VALUES(?1,'reserved',?2,?3)",
            params![id, charge, admission],
        )
        .map_err(|_| Rejection::Ledger)?;
        tx.commit().map_err(|_| Rejection::Ledger)?;
        Ok(DurableReservation {
            connection: Arc::clone(&self.connection),
            id,
            amount,
            input_ceiling,
            output_ceiling: request.max_output,
            price,
            caller: caller.clone(),
            model: request.model.clone(),
            finished: false,
        })
    }
}

impl DurableReservation {
    pub fn finish(
        mut self,
        actual_model: &str,
        input: u64,
        output: u64,
        binding: &serde_json::Value,
    ) -> Result<RunEvidence, Rejection> {
        if actual_model != self.model || input > self.input_ceiling || output > self.output_ceiling
        {
            return Err(Rejection::Evidence);
        }
        let charged = cost(&self.price, input, output)?;
        if charged > self.amount {
            return Err(Rejection::Evidence);
        }
        let evidence = RunEvidence {
            caller: self.caller.clone(),
            admitted_model: self.model.clone(),
            actual_model: actual_model.to_owned(),
            price_version: self.price.version.clone(),
            input_tokens: input,
            output_tokens: output,
            charged,
        };
        let json = serde_json::to_string(&serde_json::json!({"usage":evidence,"binding":binding}))
            .map_err(|_| Rejection::Ledger)?;
        let changed = self.connection.lock().map_err(|_| Rejection::Ledger)?.execute(
            "UPDATE runs SET state='completed',charge=?1,evidence=?2 WHERE id=?3 AND state='reserved'",
            params![i64::try_from(charged).map_err(|_| Rejection::Budget)?,json,self.id]).map_err(|_| Rejection::Ledger)?;
        if changed != 1 {
            return Err(Rejection::Ledger);
        }
        self.finished = true;
        Ok(evidence)
    }
}

impl Drop for DurableReservation {
    fn drop(&mut self) {
        if !self.finished
            && let Ok(connection) = self.connection.lock()
        {
            // No refund on cancellation, missing usage, failed provider or bad evidence.
            let _ = connection.execute(
                "UPDATE runs SET state='unknown' WHERE id=?1 AND state='reserved'",
                [&self.id],
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn durable_budget_and_unknown_reservations_survive_reopen() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("usage.sqlite");
        let caller = crate::tests::caller();
        let profile = crate::tests::profile();
        let adapter = DurableAdmission::open(&path, profile.clone()).unwrap();
        let run = adapter
            .reserve(
                "one".into(),
                &caller,
                &crate::tests::request(),
                4,
                &serde_json::json!({}),
            )
            .unwrap();
        let second = DurableAdmission::open(&path, profile.clone()).unwrap();
        assert!(matches!(
            second.reserve(
                "two".into(),
                &caller,
                &crate::tests::request(),
                4,
                &serde_json::json!({})
            ),
            Err(Rejection::Concurrency)
        ));
        drop(run);
        drop(adapter);
        drop(second);
        let adapter = DurableAdmission::open(&path, profile.clone()).unwrap();
        let run = adapter
            .reserve(
                "two".into(),
                &caller,
                &crate::tests::request(),
                4,
                &serde_json::json!({}),
            )
            .unwrap();
        run.finish("synthetic", 3, 2, &serde_json::json!({}))
            .unwrap();
        let connection = adapter.connection.lock().unwrap();
        let used: i64 = connection
            .query_row("SELECT SUM(charge) FROM runs", [], |r| r.get(0))
            .unwrap();
        assert_eq!(used, 50);
        drop(connection);
        drop(adapter);
        let mut changed = profile;
        changed.price.as_mut().unwrap().version = "v2".into();
        assert!(DurableAdmission::open(&path, changed).is_err());
    }
}
