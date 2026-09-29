use crate::{Error, QualificationStore};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use sha2::{Digest as _, Sha256};

/// A preview imports only Management qualification. It grants no RBAC permission or credential.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LegacyImportPlan {
    pub deployment: String,
    pub subjects: Vec<String>,
    pub already_qualified: Vec<String>,
    pub new_qualifications: Vec<String>,
    pub current_qualification_digest: String,
    pub digest: String,
    pub requires_operators_login: bool,
}
fn digest(value: impl Serialize) -> Result<String, Error> {
    Ok(format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(&value).map_err(|_| Error::InvalidInput)?)
    ))
}
fn current(connection: &rusqlite::Connection, deployment: &str) -> Result<Vec<String>, Error> {
    let mut statement = connection
        .prepare("SELECT subject FROM qualified_operators WHERE deployment=?1 ORDER BY subject")
        .map_err(|_| Error::Unavailable)?;
    statement
        .query_map([deployment], |row| row.get(0))
        .map_err(|_| Error::Unavailable)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| Error::Unavailable)
}
impl QualificationStore {
    pub fn preview_legacy_import(
        &self,
        deployment: &str,
        subjects: &[String],
    ) -> Result<LegacyImportPlan, Error> {
        if deployment.is_empty()
            || deployment.len() > 128
            || subjects.is_empty()
            || subjects.len() > 256
            || subjects.iter().any(|subject| {
                subject.is_empty() || subject.len() > 256 || subject.chars().any(char::is_control)
            })
        {
            return Err(Error::InvalidInput);
        }
        let mut subjects = subjects.to_vec();
        subjects.sort();
        subjects.dedup();
        let existing = current(&self.0.borrow(), deployment)?;
        let (already_qualified, new_qualifications) = subjects
            .iter()
            .cloned()
            .partition(|subject| existing.contains(subject));
        let current_qualification_digest = digest((&deployment, &existing))?;
        let digest = digest((&deployment, &subjects, &current_qualification_digest))?;
        Ok(LegacyImportPlan {
            deployment: deployment.into(),
            subjects,
            already_qualified,
            new_qualifications,
            current_qualification_digest,
            digest,
            requires_operators_login: true,
        })
    }
    /// Local operator action. Any change after preview requires a fresh reviewed plan.
    pub fn apply_legacy_import(
        &self,
        plan: &LegacyImportPlan,
        expected_digest: &str,
    ) -> Result<(), Error> {
        let fresh = self.preview_legacy_import(&plan.deployment, &plan.subjects)?;
        if fresh != *plan || plan.digest != expected_digest {
            return Err(Error::Conflict);
        }
        let mut connection = self.0.borrow_mut();
        let transaction = connection
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .map_err(|_| Error::Unavailable)?;
        if digest((&plan.deployment, current(&transaction, &plan.deployment)?))?
            != plan.current_qualification_digest
        {
            return Err(Error::Conflict);
        }
        for subject in &plan.new_qualifications {
            transaction
                .execute(
                    "INSERT OR IGNORE INTO qualified_operators VALUES(?1,?2)",
                    params![plan.deployment, subject],
                )
                .map_err(|_| Error::Unavailable)?;
        }
        transaction.commit().map_err(|_| Error::Unavailable)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preview_does_not_grant_and_import_rejects_changed_membership_or_plan() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("qualification.sqlite");
        QualificationStore::initialize(&path).unwrap();
        let store = QualificationStore::open(&path).unwrap();
        store.grant("beta", "unrelated").unwrap();
        let plan = store
            .preview_legacy_import("alpha", &["alice".into(), "bob".into()])
            .unwrap();
        assert!(!store.contains("alpha", "alice").unwrap());
        store.grant("alpha", "new-owner").unwrap();
        assert_eq!(
            store.apply_legacy_import(&plan, &plan.digest),
            Err(Error::Conflict)
        );
        let plan = store
            .preview_legacy_import("alpha", &["alice".into(), "bob".into()])
            .unwrap();
        let mut changed = plan.clone();
        changed.subjects.push("mallory".into());
        assert_eq!(
            store.apply_legacy_import(&changed, &plan.digest),
            Err(Error::Conflict)
        );
        store.apply_legacy_import(&plan, &plan.digest).unwrap();
        drop(store);
        let reopened = QualificationStore::open(&path).unwrap();
        assert!(reopened.contains("alpha", "alice").unwrap());
        assert!(reopened.contains("beta", "unrelated").unwrap());
        assert!(!reopened.contains("beta", "alice").unwrap());
    }
}
