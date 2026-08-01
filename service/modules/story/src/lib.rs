//! Runtime Story module.
//!
//! The Console Service owns this module's manifest, migrations, federated
//! collection, authenticated `/admin/runtime/stories*` routes, and frontend
//! surface contract.

pub mod backend;
pub mod federation;
pub mod migrations;
pub mod module;
