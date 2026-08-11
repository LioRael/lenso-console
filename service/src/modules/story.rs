use std::sync::Arc;

use console_story_backend::backend::{StoryAccessActor, StoryAccessAuthorizer};
use lenso::host::http::{AppContext, AppError, UserActor};
use lenso::host::prelude::{HostComposition, HostLinkedModule};

use crate::modules::console_access;

pub const MODULE_NAME: &str = console_story_backend::module::MODULE_NAME;

#[derive(Debug)]
struct ConsoleStoryAccessAuthorizer;

#[async_trait::async_trait]
impl StoryAccessAuthorizer for ConsoleStoryAccessAuthorizer {
    async fn has_story_access(
        &self,
        actor: StoryAccessActor<'_>,
        ctx: &AppContext,
    ) -> Result<bool, AppError> {
        match actor {
            StoryAccessActor::System | StoryAccessActor::Service => Ok(true),
            StoryAccessActor::User { user_id, scopes } => {
                console_access::has_console_capability(
                    ctx,
                    &UserActor {
                        user_id: user_id.to_owned(),
                        scopes: scopes.to_vec(),
                    },
                    console_story_backend::module::STORY_CONSOLE_CAPABILITY,
                )
                .await
            }
            StoryAccessActor::Anonymous => Ok(false),
        }
    }
}

pub fn linked_module() -> HostLinkedModule {
    console_story_backend::backend::install_story_access_authorizer(Arc::new(
        ConsoleStoryAccessAuthorizer,
    ));
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
        assert_eq!(manifest.module_id, MODULE_NAME);
        let lenso::ConsoleSurfacePresentation::Declarative { schema } =
            &manifest.console[0].presentation
        else {
            panic!("linked Story UI must use a declarative Console surface");
        };
        assert_eq!(schema["component"], "lenso/runtime-stories");
        assert_eq!(schema["version"], 1);
        assert_eq!(manifest.http_routes.len(), 4);
    }
}
