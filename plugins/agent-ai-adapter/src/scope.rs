//! Separate authority ledger: scope references and explicit grants, never text.
use crate::{HostCaller, PurposeProfile, Rejection};
use rusqlite::{Connection, params};
use std::{
    collections::BTreeSet,
    path::PathBuf,
    sync::{Arc, Mutex},
};
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct RunPolicy {
    pub authority: PathBuf,
    pub workspace: PathBuf,
    pub max_calls: u32,
    pub tools: BTreeSet<String>,
    #[serde(default)]
    pub existing_session_owners: BTreeSet<String>,
}
#[derive(Clone, Debug)]
pub(crate) struct ScopeStore {
    connection: Arc<Mutex<Connection>>,
    callers: BTreeSet<HostCaller>,
}
fn json<T: serde::Serialize>(value: &T) -> Result<String, Rejection> {
    serde_json::to_string(value).map_err(|_| Rejection::Ledger)
}
impl ScopeStore {
    pub fn open(policy: &RunPolicy, profile: &PurposeProfile) -> Result<Self, Rejection> {
        if !policy.authority.is_absolute()
            || !policy.workspace.is_absolute()
            || !(1..=16).contains(&policy.max_calls)
            || policy.tools.len() > 32
        {
            return Err(Rejection::Limit);
        }
        let c = Connection::open(&policy.authority).map_err(|_| Rejection::Ledger)?;
        let version: i64 = c
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .map_err(|_| Rejection::Ledger)?;
        let tables:i64=c.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",[],|r|r.get(0)).map_err(|_|Rejection::Ledger)?;
        if !matches!((version, tables), (0, 0) | (1, 3)) {
            return Err(Rejection::Ledger);
        }
        if version == 1 {
            let owned:i64=c.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('policy','sessions','grants')",[],|r|r.get(0)).map_err(|_|Rejection::Ledger)?;
            if owned != 3 {
                return Err(Rejection::Ledger);
            }
        }
        c.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS policy(id INTEGER PRIMARY KEY CHECK(id=1),json TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,owner TEXT NOT NULL,namespace TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS grants(id TEXT PRIMARY KEY,session TEXT NOT NULL,owner TEXT NOT NULL,target TEXT NOT NULL,expiry INTEGER NOT NULL,revoked INTEGER NOT NULL);
          PRAGMA user_version=1;").map_err(|_|Rejection::Ledger)?;
        let config = json(&serde_json::json!({"run":policy,"profile":profile}))?;
        c.execute("INSERT OR IGNORE INTO policy VALUES(1,?1)", [&config])
            .map_err(|_| Rejection::Ledger)?;
        let stored: String = c
            .query_row("SELECT json FROM policy WHERE id=1", [], |r| r.get(0))
            .map_err(|_| Rejection::Ledger)?;
        if stored != config {
            return Err(Rejection::Ledger);
        }
        Ok(Self {
            connection: Arc::new(Mutex::new(c)),
            callers: profile.callers.clone(),
        })
    }
    pub fn register(
        &self,
        id: &str,
        owner: &HostCaller,
        namespace: &serde_json::Value,
    ) -> Result<(), Rejection> {
        if !self.callers.contains(owner) || uuid::Uuid::parse_str(id).is_err() {
            return Err(Rejection::Unauthorized);
        }
        let c = self.connection.lock().map_err(|_| Rejection::Ledger)?;
        c.execute(
            "INSERT OR IGNORE INTO sessions VALUES(?1,?2,?3)",
            params![id, json(owner)?, json(namespace)?],
        )
        .map_err(|_| Rejection::Ledger)?;
        let row: (String, String) = c
            .query_row(
                "SELECT owner,namespace FROM sessions WHERE id=?1",
                [id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .map_err(|_| Rejection::Ledger)?;
        if row != (json(owner)?, json(namespace)?) {
            return Err(Rejection::Unauthorized);
        }
        Ok(())
    }
    pub fn authorize(
        &self,
        id: &str,
        caller: &HostCaller,
        grant: Option<&str>,
    ) -> Result<serde_json::Value, Rejection> {
        if !self.callers.contains(caller) {
            return Err(Rejection::Unauthorized);
        }
        let c = self.connection.lock().map_err(|_| Rejection::Ledger)?;
        let (owner, namespace): (String, String) = c
            .query_row(
                "SELECT owner,namespace FROM sessions WHERE id=?1",
                [id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .map_err(|_| Rejection::Unauthorized)?;
        let owner_caller: HostCaller =
            serde_json::from_str(&owner).map_err(|_| Rejection::Ledger)?;
        if owner_caller.user != caller.user || owner_caller.project != caller.project {
            return Err(Rejection::Unauthorized);
        }
        if owner_caller != *caller {
            let grant = grant.ok_or(Rejection::Unauthorized)?;
            let permitted:i64=c.query_row("SELECT COUNT(*) FROM grants WHERE id=?1 AND session=?2 AND owner=?3 AND target=?4 AND expiry>?5 AND revoked=0",
                params![grant,id,owner,json(caller)?,time::OffsetDateTime::now_utc().unix_timestamp()],|r|r.get(0)).map_err(|_|Rejection::Ledger)?;
            if permitted != 1 {
                return Err(Rejection::Unauthorized);
            }
        }
        serde_json::from_str(&namespace).map_err(|_| Rejection::Ledger)
    }
    pub fn grant(
        &self,
        id: &str,
        owner: &HostCaller,
        target: &str,
        seconds: i64,
    ) -> Result<String, Rejection> {
        self.authorize(id, owner, None)?;
        if !(1..=3600).contains(&seconds) {
            return Err(Rejection::Limit);
        }
        let target = HostCaller {
            consumer: target.to_owned(),
            ..owner.clone()
        };
        if !self.callers.contains(&target) || target == *owner {
            return Err(Rejection::Unauthorized);
        }
        let id_grant = uuid::Uuid::new_v4().to_string();
        self.connection
            .lock()
            .map_err(|_| Rejection::Ledger)?
            .execute(
                "INSERT INTO grants VALUES(?1,?2,?3,?4,?5,0)",
                params![
                    id_grant,
                    id,
                    json(owner)?,
                    json(&target)?,
                    time::OffsetDateTime::now_utc().unix_timestamp() + seconds
                ],
            )
            .map_err(|_| Rejection::Ledger)?;
        Ok(id_grant)
    }
    pub fn revoke(&self, id: &str, owner: &HostCaller) -> Result<(), Rejection> {
        let changed = self
            .connection
            .lock()
            .map_err(|_| Rejection::Ledger)?
            .execute(
                "UPDATE grants SET revoked=1 WHERE id=?1 AND owner=?2",
                params![id, json(owner)?],
            )
            .map_err(|_| Rejection::Ledger)?;
        if changed != 1 {
            return Err(Rejection::Unauthorized);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn explicit_grants_are_scoped_revocable_and_persistent() {
        let root = tempfile::tempdir().unwrap();
        let owner = HostCaller {
            consumer: "assistant/default".into(),
            user: "alice".into(),
            project: "one".into(),
        };
        let target = HostCaller {
            consumer: "plugin-a/default".into(),
            ..owner.clone()
        };
        let mut profile = crate::tests::profile();
        profile.callers = [
            owner.clone(),
            target.clone(),
            HostCaller {
                project: "two".into(),
                ..target.clone()
            },
            HostCaller {
                user: "bob".into(),
                ..target.clone()
            },
        ]
        .into();
        let policy = RunPolicy {
            authority: root.path().join("authority.sqlite"),
            workspace: root.path().into(),
            max_calls: 2,
            tools: BTreeSet::new(),
            existing_session_owners: [owner.consumer.clone()].into(),
        };
        let store = ScopeStore::open(&policy, &profile).unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        store
            .register(&id, &owner, &serde_json::Value::Null)
            .unwrap();
        assert!(store.authorize(&id, &target, None).is_err());
        let grant = store.grant(&id, &owner, &target.consumer, 3600).unwrap();
        assert!(store.authorize(&id, &target, Some(&grant)).is_ok());
        for bad in [
            HostCaller {
                project: "two".into(),
                ..target.clone()
            },
            HostCaller {
                user: "bob".into(),
                ..target.clone()
            },
        ] {
            assert!(store.authorize(&id, &bad, Some(&grant)).is_err());
        }
        assert!(store.revoke(&grant, &target).is_err());
        let expired = store.grant(&id, &owner, &target.consumer, 1).unwrap();
        store
            .connection
            .lock()
            .unwrap()
            .execute("UPDATE grants SET expiry=0 WHERE id=?1", [&expired])
            .unwrap();
        assert!(store.authorize(&id, &target, Some(&expired)).is_err());
        drop(store);
        let store = ScopeStore::open(&policy, &profile).unwrap();
        assert!(store.authorize(&id, &target, Some(&grant)).is_ok());
        store.revoke(&grant, &owner).unwrap();
        assert!(store.authorize(&id, &target, Some(&grant)).is_err());
    }
}
