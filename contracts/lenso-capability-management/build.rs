use lenso_contract_codegen::{
    ProjectionLanguage, check_projection, check_source_snapshot, write_projection,
    write_source_snapshot,
};
use std::{env, path::Path};

#[allow(dead_code)]
#[path = "src/contract.rs"]
mod source;

fn main() {
    for path in [
        "src/contract.rs",
        "capability.json",
        "schemas",
        "src/generated.rs",
        "generated/bindings.ts",
    ] {
        println!("cargo:rerun-if-changed={path}");
    }
    println!("cargo:rerun-if-env-changed=LENSO_UPDATE_CONTRACT_SNAPSHOT");
    let snapshot = source::__lenso_capability_snapshot();
    let descriptor = Path::new("capability.json");
    if env::var_os("LENSO_UPDATE_CONTRACT_SNAPSHOT").is_some() {
        write_source_snapshot(&snapshot, descriptor).expect("management snapshot generation");
        write_projection(
            descriptor,
            ProjectionLanguage::RustRuntime,
            Path::new("src/generated.rs"),
        )
        .expect("management Rust projection");
        write_projection(
            descriptor,
            ProjectionLanguage::TypeScript,
            Path::new("generated/bindings.ts"),
        )
        .expect("management TypeScript projection");
    } else {
        check_source_snapshot(&snapshot, descriptor).expect("management source snapshot is stale");
        check_projection(
            descriptor,
            ProjectionLanguage::RustRuntime,
            Path::new("src/generated.rs"),
        )
        .expect("management Rust projection is stale");
        check_projection(
            descriptor,
            ProjectionLanguage::TypeScript,
            Path::new("generated/bindings.ts"),
        )
        .expect("management TypeScript projection is stale");
    }
}
