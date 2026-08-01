use lenso::host::prelude::{HostComposition, HostLinkedModule};

pub const MODULE_NAME: &str = console_story_backend::module::MODULE_NAME;

pub fn linked_module() -> HostLinkedModule {
    HostLinkedModule::linked(
        MODULE_NAME,
        console_story_backend::module::manifest,
        console_story_backend::module::module,
        console_story_backend::migrations::STORY_MIGRATIONS,
    )
    .with_http_binding(console_story_backend::module::binding)
}

pub fn install_default_story_display(composition: &HostComposition) {
    console_story_backend::module::install_default_story_display_from_manifests(
        composition
            .linked_modules()
            .iter()
            .map(|module| (module.manifest)()),
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn linked_module_preserves_the_story_module_identity_and_routes() {
        let module = linked_module();
        let manifest = (module.manifest)();

        assert_eq!(module.module_name, MODULE_NAME);
        assert_eq!(manifest.name, MODULE_NAME);
        assert_eq!(manifest.console[0].package.name, "@lenso/story-console");
        assert_eq!(manifest.http_routes.len(), 4);
    }
}
