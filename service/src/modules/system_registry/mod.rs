pub(crate) mod connection;
mod routes;

use lenso::host::http::{LinkedHttpContribution, ModuleHttpMethod, ModuleHttpRoute};
use lenso::host::prelude::*;
use lenso::{ConsoleNavigation, ConsoleSurface, ConsoleSurfacePresentation, ConsoleWorkspaceRef};
use serde_json::json;

pub const MODULE_NAME: &str = "lenso/system-registry";
pub const REGISTRY_READ: &str = "console.system-registry.read";
pub const MODULE_INVENTORY_READ: &str = "console.managed-service.module.inventory.read";
pub const MODULE_CONTRIBUTIONS_RESOLVE: &str =
    "console.managed-service.module.contributions.resolve";
pub const MODULE_CONFIG_READ: &str = "console.managed-service.module.config.read";
pub const MODULE_CONFIG_WRITE: &str = "console.managed-service.module.config.write";
pub const SYSTEM_READ: &str = "console.system.read";
pub const SYSTEM_CONNECT: &str = "console.system.connect";

const MIGRATIONS: &[Migration] = &[
    Migration {
        name: "lenso/system-registry/0001_create_managed_service_registry",
        sql: include_str!("migrations/0001_create_managed_service_registry.sql"),
    },
    Migration {
        name: "lenso/system-registry/0002_create_system_connections",
        sql: include_str!("migrations/0002_create_system_connections.sql"),
    },
];

pub fn linked_module() -> HostLinkedModule {
    HostLinkedModule::manifest_only(MODULE_NAME, manifest, MIGRATIONS)
        .with_http_binding(http_binding)
}

pub fn http_routes() -> Vec<ModuleHttpRoute> {
    let mut routes = vec![
        route(
            ModuleHttpMethod::Get,
            "/api/console/v1/system",
            SYSTEM_READ,
            "Get System Connection",
        ),
        route(
            ModuleHttpMethod::Post,
            "/api/console/v1/system/connect",
            SYSTEM_CONNECT,
            "Connect System",
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
    ];
    routes.extend(operation_http_routes());
    routes
}

fn operation_http_routes() -> Vec<ModuleHttpRoute> {
    vec![
        route(
            ModuleHttpMethod::Post,
            "/api/console/v1/services/{serviceId}/system-plane/v1/modules",
            MODULE_INVENTORY_READ,
            "Read Managed Service Module Inventory",
        ),
        route(
            ModuleHttpMethod::Post,
            "/api/console/v1/services/{serviceId}/system-plane/v1/modules/action-contributions/resolve",
            MODULE_CONTRIBUTIONS_RESOLVE,
            "Resolve Managed Service Action Contributions",
        ),
        route(
            ModuleHttpMethod::Post,
            "/api/console/v1/services/{serviceId}/system-plane/v1/modules/config/read",
            MODULE_CONFIG_READ,
            "Read Managed Service Module Configuration",
        ),
        route(
            ModuleHttpMethod::Post,
            "/api/console/v1/services/{serviceId}/system-plane/v1/modules/config/write",
            MODULE_CONFIG_WRITE,
            "Write Managed Service Module Configuration",
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
            REGISTRY_READ.to_owned(),
            MODULE_INVENTORY_READ.to_owned(),
            MODULE_CONTRIBUTIONS_RESOLVE.to_owned(),
            MODULE_CONFIG_READ.to_owned(),
            MODULE_CONFIG_WRITE.to_owned(),
            SYSTEM_CONNECT.to_owned(),
            SYSTEM_READ.to_owned(),
        ])
        .http_routes(http_routes())
        .console(vec![ConsoleSurface {
            name: "managed-services".to_owned(),
            label: "Managed Services".to_owned(),
            route: "/services".to_owned(),
            presentation: ConsoleSurfacePresentation::Declarative {
                schema: json!({
                    "component": "lenso/system-registry",
                    "version": 1,
                }),
            },
            icon: Some("network".to_owned()),
            required_capabilities: vec![SYSTEM_READ.to_owned()],
            navigation: Some(ConsoleNavigation {
                workspace: ConsoleWorkspaceRef {
                    id: "system".to_owned(),
                    label: "System".to_owned(),
                    icon: Some("shield".to_owned()),
                },
                group: None,
                order: Some(70),
            }),
        }])
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
        assert_eq!(
            manifest.capabilities,
            [
                MODULE_CONFIG_READ,
                MODULE_CONFIG_WRITE,
                MODULE_CONTRIBUTIONS_RESOLVE,
                MODULE_INVENTORY_READ,
                REGISTRY_READ,
                SYSTEM_CONNECT,
                SYSTEM_READ,
            ]
        );
        assert_eq!(manifest.http_routes, http_routes());
        assert_eq!(manifest.console.len(), 1);
        let surface = &manifest.console[0];
        assert_eq!(surface.name, "managed-services");
        assert_eq!(surface.route, "/services");
        assert_eq!(surface.required_capabilities, [SYSTEM_READ]);
        assert!(matches!(
            &surface.presentation,
            ConsoleSurfacePresentation::Declarative { schema }
                if schema["component"] == "lenso/system-registry"
        ));
        assert!(module.http_binding.is_some());
        assert_eq!(module.migrations.len(), 2);
    }
}
