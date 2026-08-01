use platform_core::AppContext;
use platform_http::ApiOpenApiRouter;
use platform_module::{
    ConsoleArea, ConsolePackage, ConsoleSurface, LinkedBinding, LinkedHttpContribution, Module,
    ModuleHttpMethod, ModuleHttpRoute, ModuleManifest, StoryDisplayDescriptor, StoryDisplaySource,
};

pub const MODULE_NAME: &str = "lenso/platform-story";
pub const STORY_CONSOLE_CAPABILITY: &str = "runtime.stories.read";

pub fn http_routes() -> Vec<ModuleHttpRoute> {
    vec![
        ModuleHttpRoute {
            method: ModuleHttpMethod::Get,
            path: "/admin/runtime/stories".to_owned(),
            capability: Some(STORY_CONSOLE_CAPABILITY.to_owned()),
            display_name: Some("List Runtime Stories".to_owned()),
            story_title: Some("Runtime Stories".to_owned()),
            operation: None,
        },
        ModuleHttpRoute {
            method: ModuleHttpMethod::Get,
            path: "/admin/runtime/stories/{correlation_id}".to_owned(),
            capability: Some(STORY_CONSOLE_CAPABILITY.to_owned()),
            display_name: Some("Runtime Story Detail".to_owned()),
            story_title: Some("Runtime Story Detail".to_owned()),
            operation: None,
        },
        ModuleHttpRoute {
            method: ModuleHttpMethod::Get,
            path: "/admin/runtime/stories/{correlation_id}/heatmap".to_owned(),
            capability: Some(STORY_CONSOLE_CAPABILITY.to_owned()),
            display_name: Some("Runtime Story Heatmap".to_owned()),
            story_title: Some("Runtime Story Heatmap".to_owned()),
            operation: None,
        },
        ModuleHttpRoute {
            method: ModuleHttpMethod::Get,
            path: "/admin/runtime/stories/{correlation_id}/technical-operations".to_owned(),
            capability: Some(STORY_CONSOLE_CAPABILITY.to_owned()),
            display_name: Some("Runtime Story Technical Operations".to_owned()),
            story_title: Some("Runtime Story Technical Operations".to_owned()),
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
            area: ConsoleArea::Runtime,
            route: "/runtime/stories".to_owned(),
            package: ConsolePackage {
                name: "@lenso/story-console".to_owned(),
                export: "storyConsoleModule".to_owned(),
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
            public_prefixes: &["/admin/runtime/stories"],
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
    use platform_module::{ModuleManifestLintSeverity, ModuleSource, lint_module_manifest};

    #[test]
    fn manifest_declares_story_console_surface() {
        let manifest = manifest();
        let console_surface_contract: serde_json::Value = serde_json::from_str(include_str!(
            "../../../../packages/story-console/console-surface.json"
        ))
        .expect("story console surface contract should be valid json");

        assert_eq!(manifest.name, console_surface_contract["id"]);
        assert_eq!(manifest.admin, None);
        assert_eq!(manifest.capabilities, vec![STORY_CONSOLE_CAPABILITY]);
        assert_eq!(manifest.http_routes, http_routes());
        assert_eq!(manifest.console.len(), 1);

        let surface = &manifest.console[0];
        let surface_json =
            serde_json::to_value(surface).expect("story console surface should serialize");

        assert_eq!(surface.name, console_surface_contract["surfaceName"]);
        assert_eq!(surface.label, console_surface_contract["label"]);
        assert_eq!(surface.area, ConsoleArea::Runtime);
        assert_eq!(surface_json["area"], console_surface_contract["area"]);
        assert_eq!(surface.route, console_surface_contract["route"]);
        assert_eq!(
            surface.package.name,
            console_surface_contract["packageName"]
        );
        assert_eq!(
            surface.package.export,
            console_surface_contract["exportName"]
        );
        assert_eq!(surface_json["icon"], console_surface_contract["icon"]);
        assert_eq!(surface.navigation, None);
        assert!(console_surface_contract.get("navigation").is_none());
        assert_eq!(
            surface.required_capabilities,
            vec![STORY_CONSOLE_CAPABILITY]
        );

        let lints = lint_module_manifest(ModuleSource::Linked, &manifest);
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
}
