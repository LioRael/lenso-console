use platform_core::AppContext;
use platform_http::ApiOpenApiRouter;
use platform_module::{
    ConsoleSurface, ConsoleSurfacePresentation, LinkedBinding, LinkedHttpContribution, Module,
    ModuleHttpMethod, ModuleHttpRoute, ModuleManifest, StoryDisplayDescriptor, StoryDisplaySource,
};
use serde_json::json;

pub const MODULE_NAME: &str = "lenso/platform-story";
pub const STORY_CONSOLE_CAPABILITY: &str = "runtime.stories.read";

const EXECUTION_PAYLOAD_PATH: &str =
    "/api/console/v1/stories/{correlation_id}/executions/{node_id}/payload";
const EXECUTION_LOGS_PATH: &str =
    "/api/console/v1/stories/{correlation_id}/executions/{node_id}/logs";
const EXECUTION_TECHNICAL_OPERATIONS_PATH: &str =
    "/api/console/v1/stories/{correlation_id}/executions/{node_id}/technical-operations";

pub fn http_routes() -> Vec<ModuleHttpRoute> {
    vec![
        ModuleHttpRoute {
            method: ModuleHttpMethod::Get,
            path: "/api/console/v1/stories".to_owned(),
            capability: Some(STORY_CONSOLE_CAPABILITY.to_owned()),
            display_name: Some("List Runtime Stories".to_owned()),
            story_title: Some("Runtime Stories".to_owned()),
            operation: None,
        },
        ModuleHttpRoute {
            method: ModuleHttpMethod::Get,
            path: "/api/console/v1/stories/{correlation_id}".to_owned(),
            capability: Some(STORY_CONSOLE_CAPABILITY.to_owned()),
            display_name: Some("Runtime Story Detail".to_owned()),
            story_title: Some("Runtime Story Detail".to_owned()),
            operation: None,
        },
        ModuleHttpRoute {
            method: ModuleHttpMethod::Get,
            path: "/api/console/v1/stories/{correlation_id}/heatmap".to_owned(),
            capability: Some(STORY_CONSOLE_CAPABILITY.to_owned()),
            display_name: Some("Runtime Story Heatmap".to_owned()),
            story_title: Some("Runtime Story Heatmap".to_owned()),
            operation: None,
        },
        ModuleHttpRoute {
            method: ModuleHttpMethod::Get,
            path: "/api/console/v1/stories/{correlation_id}/technical-operations".to_owned(),
            capability: Some(STORY_CONSOLE_CAPABILITY.to_owned()),
            display_name: Some("Runtime Story Technical Operations".to_owned()),
            story_title: Some("Runtime Story Technical Operations".to_owned()),
            operation: None,
        },
        ModuleHttpRoute {
            method: ModuleHttpMethod::Get,
            path: EXECUTION_PAYLOAD_PATH.to_owned(),
            capability: Some(STORY_CONSOLE_CAPABILITY.to_owned()),
            display_name: Some("Inspect Runtime Story Execution Payload".to_owned()),
            story_title: Some("Runtime Story Inspector Evidence".to_owned()),
            operation: None,
        },
        ModuleHttpRoute {
            method: ModuleHttpMethod::Get,
            path: EXECUTION_LOGS_PATH.to_owned(),
            capability: Some(STORY_CONSOLE_CAPABILITY.to_owned()),
            display_name: Some("Inspect Runtime Story Execution Logs".to_owned()),
            story_title: Some("Runtime Story Inspector Evidence".to_owned()),
            operation: None,
        },
        ModuleHttpRoute {
            method: ModuleHttpMethod::Get,
            path: EXECUTION_TECHNICAL_OPERATIONS_PATH.to_owned(),
            capability: Some(STORY_CONSOLE_CAPABILITY.to_owned()),
            display_name: Some("Inspect Runtime Story Execution Operations".to_owned()),
            story_title: Some("Runtime Story Inspector Evidence".to_owned()),
            operation: None,
        },
    ]
}

/// Context-free manifest for the Runtime Story system module.
pub fn manifest() -> ModuleManifest {
    ModuleManifest::builder(MODULE_NAME)
        .capabilities(vec![STORY_CONSOLE_CAPABILITY.to_owned()])
        .http_routes(http_routes())
        .console(vec![ConsoleSurface {
            name: "stories".to_owned(),
            label: "Stories".to_owned(),
            route: "/stories".to_owned(),
            presentation: ConsoleSurfacePresentation::Declarative {
                schema: json!({
                    "component": "lenso/runtime-stories",
                    "version": 1,
                }),
            },
            icon: Some("workflow".to_owned()),
            required_capabilities: vec![STORY_CONSOLE_CAPABILITY.to_owned()],
            navigation: None,
        }])
        .build()
}

pub fn merge_http(base: ApiOpenApiRouter) -> ApiOpenApiRouter {
    base.merge(crate::backend::router())
}

pub fn binding() -> LinkedBinding {
    LinkedBinding::builder()
        .http(LinkedHttpContribution {
            public_prefixes: &["/api/console/v1/stories"],
            merge: merge_http,
        })
        .build()
}

/// The loaded Story module.
pub fn module(_ctx: &AppContext) -> Module {
    Module::linked(manifest(), binding())
}

/// Install context-free Story display metadata for the Console composition.
pub fn install_default_story_display_from_manifests(
    manifests: impl IntoIterator<Item = ModuleManifest>,
) {
    crate::backend::install_default_story_display(
        manifests
            .into_iter()
            .flat_map(story_display_descriptors_from_manifest)
            .collect(),
    );
}

fn story_display_descriptors_from_manifest(
    manifest: ModuleManifest,
) -> Vec<StoryDisplayDescriptor> {
    let mut descriptors = manifest.story_display;
    let existing_http = descriptors
        .iter()
        .filter_map(|descriptor| match &descriptor.source {
            StoryDisplaySource::HttpRequest { method, path } => {
                Some((method.clone(), path.clone()))
            }
            StoryDisplaySource::ExecutionName { .. } => None,
        })
        .collect::<Vec<_>>();

    descriptors.extend(manifest.http_routes.into_iter().filter_map(|route| {
        if is_execution_inspector_evidence_path(&route.path) {
            return None;
        }
        let display_name = route.display_name?;
        let method = http_method_label(route.method)?;
        if existing_http
            .iter()
            .any(|(existing_method, existing_path)| {
                existing_method == method && existing_path == &route.path
            })
        {
            return None;
        }
        Some(StoryDisplayDescriptor {
            source: StoryDisplaySource::HttpRequest {
                method: method.to_owned(),
                path: route.path,
            },
            display_name,
            story_title: route.story_title,
        })
    }));
    descriptors
}

fn is_execution_inspector_evidence_path(path: &str) -> bool {
    matches!(
        path,
        EXECUTION_PAYLOAD_PATH | EXECUTION_LOGS_PATH | EXECUTION_TECHNICAL_OPERATIONS_PATH
    )
}

fn http_method_label(method: ModuleHttpMethod) -> Option<&'static str> {
    Some(match method {
        ModuleHttpMethod::Get => "GET",
        ModuleHttpMethod::Post => "POST",
        ModuleHttpMethod::Put => "PUT",
        ModuleHttpMethod::Patch => "PATCH",
        ModuleHttpMethod::Delete => "DELETE",
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use platform_module::{ModuleManifestLintSeverity, lint_module_manifest};

    #[test]
    fn manifest_declares_story_console_surface() {
        let manifest = manifest();
        assert_eq!(manifest.module_id, MODULE_NAME);
        assert_eq!(manifest.admin, None);
        assert_eq!(manifest.capabilities, vec![STORY_CONSOLE_CAPABILITY]);
        assert_eq!(manifest.http_routes, http_routes());
        assert_eq!(manifest.console.len(), 1);
        assert_eq!(
            manifest
                .http_routes
                .iter()
                .map(|route| route.path.as_str())
                .collect::<Vec<_>>(),
            vec![
                "/api/console/v1/stories",
                "/api/console/v1/stories/{correlation_id}",
                "/api/console/v1/stories/{correlation_id}/heatmap",
                "/api/console/v1/stories/{correlation_id}/technical-operations",
                "/api/console/v1/stories/{correlation_id}/executions/{node_id}/payload",
                "/api/console/v1/stories/{correlation_id}/executions/{node_id}/logs",
                "/api/console/v1/stories/{correlation_id}/executions/{node_id}/technical-operations",
            ]
        );

        let surface = &manifest.console[0];
        assert_eq!(surface.name, "stories");
        assert_eq!(surface.label, "Stories");
        assert_eq!(surface.route, "/stories");
        assert!(matches!(
            &surface.presentation,
            ConsoleSurfacePresentation::Declarative { schema }
                if schema["component"] == "lenso/runtime-stories"
        ));
        assert_eq!(surface.icon.as_deref(), Some("workflow"));
        assert_eq!(surface.navigation, None);
        assert_eq!(
            surface.required_capabilities,
            vec![STORY_CONSOLE_CAPABILITY]
        );

        let lints = lint_module_manifest(&manifest);
        assert!(
            lints
                .iter()
                .all(|lint| lint.severity == ModuleManifestLintSeverity::Ok),
            "platform-story manifest should not have warning/error lints: {lints:?}"
        );
    }

    #[test]
    fn composition_manifests_install_story_display_metadata() {
        crate::backend::reset_catalogs_for_test();
        install_default_story_display_from_manifests([manifest()]);

        let catalog = crate::backend::story_display_catalog_snapshot();
        assert_eq!(catalog.len(), 4);
        assert!(
            catalog
                .iter()
                .all(|descriptor| descriptor.story_title.is_some())
        );
    }

    #[test]
    fn inspector_evidence_filter_is_exact_not_a_global_route_heuristic() {
        assert!(is_execution_inspector_evidence_path(EXECUTION_PAYLOAD_PATH));
        assert!(is_execution_inspector_evidence_path(EXECUTION_LOGS_PATH));
        assert!(is_execution_inspector_evidence_path(
            EXECUTION_TECHNICAL_OPERATIONS_PATH
        ));
        assert!(!is_execution_inspector_evidence_path(
            "/api/orders/{order_id}/executions/{node_id}/payload"
        ));
    }
}
