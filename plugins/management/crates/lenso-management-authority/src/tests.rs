use super::*;

#[test]
fn qualification_is_explicit_persistent_and_revoked_per_deployment() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("qualification.sqlite");
    assert!(QualificationStore::open(&path).is_err());
    assert!(!path.exists());
    QualificationStore::initialize(&path).unwrap();
    let store = QualificationStore::open(&path).unwrap();
    store.grant("alpha", "alice").unwrap();
    store.grant("beta", "alice").unwrap();
    assert!(store.contains("alpha", "alice").unwrap());
    assert!(!store.contains("alpha", "bob").unwrap());
    drop(store);
    let reopened = QualificationStore::open(&path).unwrap();
    reopened.revoke("alpha", "alice").unwrap();
    assert!(!reopened.contains("alpha", "alice").unwrap());
    assert!(reopened.contains("beta", "alice").unwrap());
    let tables: Vec<String> = {
        let connection = reopened.0.borrow();
        let mut statement = connection
            .prepare("SELECT name FROM sqlite_master WHERE type='table'")
            .unwrap();
        statement
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap()
    };
    assert_eq!(tables, vec!["qualified_operators"]);
}
