use std::{env, path::Path};

use lenso_contract_codegen::{ProjectionLanguage, check_projection, write_projection};

fn main() {
    println!("cargo:rerun-if-changed=capability.json");
    println!("cargo:rerun-if-changed=schemas");
    println!("cargo:rerun-if-changed=src/generated.rs");
    println!("cargo:rerun-if-changed=generated/bindings.ts");
    println!("cargo:rerun-if-env-changed=LENSO_UPDATE_CONTRACT_SNAPSHOT");
    if env::var_os("LENSO_UPDATE_CONTRACT_SNAPSHOT").is_some() {
        write_projection(
            Path::new("capability.json"),
            ProjectionLanguage::Rust,
            Path::new("src/generated.rs"),
        )
        .expect("failed to update generated Rust Workspace service contract");
        write_projection(
            Path::new("capability.json"),
            ProjectionLanguage::TypeScript,
            Path::new("generated/bindings.ts"),
        )
        .expect("failed to update generated TypeScript Workspace service contract");
        return;
    }
    check_projection(
        Path::new("capability.json"),
        ProjectionLanguage::Rust,
        Path::new("src/generated.rs"),
    )
    .expect("generated Rust Workspace service contract is stale");
    check_projection(
        Path::new("capability.json"),
        ProjectionLanguage::TypeScript,
        Path::new("generated/bindings.ts"),
    )
    .expect("generated TypeScript Workspace service contract is stale");
}
