mod routes;

use lenso::host::http::{LinkedHttpContribution, ModuleHttpMethod, ModuleHttpRoute};
use lenso::host::prelude::*;

pub const MODULE_NAME: &str = "lenso/system-registry";
pub const REGISTRY_ENROLL: &str = "console.system-registry.enroll";
pub const REGISTRY_READ: &str = "console.system-registry.read";
pub const REGISTRY_REVOKE: &str = "console.system-registry.revoke";

const MIGRATIONS: &[Migration] = &[
    Migration {
        name: "lenso/system-registry/0001_create_managed_service_registry",
        sql: include_str!(
            "../../../../packages/console-system-plane/migrations/0002_create_managed_service_registry.sql"
        ),
    },
    Migration {
        name: "lenso/system-registry/0002_create_console_composition",
        sql: include_str!(
            "../../../../packages/console-system-plane/migrations/0003_create_console_composition.sql"
        ),
    },
    Migration {
        name: "lenso/system-registry/0003_create_enrollment_evidence",
        sql: include_str!(
            "../../../../packages/console-system-plane/migrations/0004_create_enrollment_evidence.sql"
        ),
    },
];

pub fn linked_module() -> HostLinkedModule {
    HostLinkedModule::manifest_only(MODULE_NAME, manifest, MIGRATIONS)
        .with_http_binding(http_binding)
}

pub fn http_routes() -> Vec<ModuleHttpRoute> {
    vec![
        route(
            ModuleHttpMethod::Post,
            "/api/console/v1/enrollment/offers",
            REGISTRY_ENROLL,
            "Create Service Enrollment Offer",
        ),
        route(
            ModuleHttpMethod::Post,
            "/api/console/v1/enrollment/accept",
            REGISTRY_ENROLL,
            "Accept Service Enrollment Receipt",
        ),
        route(
            ModuleHttpMethod::Get,
            "/api/console/v1/services",
            REGISTRY_READ,
            "List Managed Services",
        ),
        route(
            ModuleHttpMethod::Get,
            "/api/console/v1/services/{serviceId}",
            REGISTRY_READ,
            "Get Managed Service",
        ),
        route(
            ModuleHttpMethod::Post,
            "/api/console/v1/services/{serviceId}/enrollment/revoke",
            REGISTRY_REVOKE,
            "Revoke Service Enrollment",
        ),
    ]
}

fn route(
    method: ModuleHttpMethod,
    path: &str,
    capability: &str,
    display_name: &str,
) -> ModuleHttpRoute {
    ModuleHttpRoute {
        method,
        path: path.to_owned(),
        capability: Some(capability.to_owned()),
        display_name: Some(display_name.to_owned()),
        story_title: Some("System Registry".to_owned()),
        operation: None,
    }
}

fn manifest() -> ModuleManifest {
    ModuleManifest::builder(MODULE_NAME)
        .capabilities(vec![
            REGISTRY_ENROLL.to_owned(),
            REGISTRY_READ.to_owned(),
            REGISTRY_REVOKE.to_owned(),
        ])
        .http_routes(http_routes())
        .build()
}

fn http_binding() -> LinkedBinding {
    LinkedBinding::builder()
        .http(LinkedHttpContribution {
            public_prefixes: &["/api/console/v1/"],
            merge: routes::merge_http,
        })
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn module_declares_only_implemented_console_registry_routes() {
        let module = linked_module();
        let manifest = (module.manifest)();

        assert_eq!(module.module_name, MODULE_NAME);
        assert_eq!(manifest.capabilities.len(), 3);
        assert_eq!(manifest.http_routes, http_routes());
        assert!(manifest.console.is_empty());
        assert!(module.http_binding.is_some());
        assert_eq!(module.migrations.len(), 3);
    }
}
