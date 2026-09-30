//! Explicit local qualification setup. This binary never signs credentials or grants RBAC.
#[cfg(not(target_arch = "wasm32"))]
use lenso_management_authority::{LegacyImportPlan, QualificationStore};
#[cfg(not(target_arch = "wasm32"))]
use std::{env, fs, path::Path};
#[cfg(not(target_arch = "wasm32"))]
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().skip(1).collect();
    match args.as_slice() {
        [command,database] if command=="initialize"=>QualificationStore::initialize(Path::new(database)).map_err(|error|format!("{error:?}"))?,
        [command,database,deployment,subjects,output] if command=="preview"=>{
            let subjects:Vec<String>=serde_json::from_slice(&fs::read(subjects)?)?;
            let plan=QualificationStore::open(Path::new(database)).map_err(|error|format!("{error:?}"))?.preview_legacy_import(deployment,&subjects).map_err(|error|format!("{error:?}"))?;
            fs::write(output,serde_json::to_vec_pretty(&plan)?)?;println!("Review {output}; apply requires its exact digest. Operators login and separate RBAC setup are required.");
        },
        [command,database,plan,digest] if command=="apply"=>{
            let plan:LegacyImportPlan=serde_json::from_slice(&fs::read(plan)?)?;
            QualificationStore::open(Path::new(database)).map_err(|error|format!("{error:?}"))?.apply_legacy_import(&plan,digest).map_err(|error|format!("{error:?}"))?;
            println!("Imported Management qualification for {}. Configure RBAC and authenticate in the operators realm before managing the deployment.",plan.deployment);
        },
        _=>return Err("Usage: management-operator initialize DB | preview DB DEPLOYMENT SUBJECTS_JSON PLAN_JSON | apply DB PLAN_JSON EXACT_DIGEST".into()),
    }
    Ok(())
}

#[cfg(target_arch = "wasm32")]
fn main() {
    panic!("management-operator is a native local operator; Workers use explicit D1 owner setup");
}
