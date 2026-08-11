#[allow(clippy::wildcard_imports)]
use super::*;
use crate::module::STORY_CONSOLE_CAPABILITY;
use std::sync::Arc;

#[async_trait::async_trait]
pub trait StoryAccessAuthorizer: std::fmt::Debug + Send + Sync {
    async fn has_story_access(
        &self,
        actor: StoryAccessActor<'_>,
        ctx: &AppContext,
    ) -> Result<bool, AppError>;
}

#[derive(Debug, Clone, Copy)]
pub enum StoryAccessActor<'a> {
    Anonymous,
    Service,
    System,
    User {
        user_id: &'a str,
        scopes: &'a [String],
    },
}

#[derive(Debug)]
struct ScopeStoryAccessAuthorizer;

#[async_trait::async_trait]
impl StoryAccessAuthorizer for ScopeStoryAccessAuthorizer {
    async fn has_story_access(
        &self,
        actor: StoryAccessActor<'_>,
        _ctx: &AppContext,
    ) -> Result<bool, AppError> {
        Ok(match actor {
            StoryAccessActor::System | StoryAccessActor::Service => true,
            StoryAccessActor::User { scopes, .. } => {
                scopes.iter().any(|scope| scope == STORY_CONSOLE_CAPABILITY)
            }
            StoryAccessActor::Anonymous => false,
        })
    }
}

static STORY_ACCESS_AUTHORIZER: OnceLock<RwLock<Arc<dyn StoryAccessAuthorizer>>> = OnceLock::new();

fn story_access_authorizer() -> Arc<dyn StoryAccessAuthorizer> {
    STORY_ACCESS_AUTHORIZER
        .get_or_init(|| RwLock::new(Arc::new(ScopeStoryAccessAuthorizer)))
        .read()
        .expect("Story Access authorizer lock should not be poisoned")
        .clone()
}

pub fn install_story_access_authorizer(authorizer: Arc<dyn StoryAccessAuthorizer>) {
    *STORY_ACCESS_AUTHORIZER
        .get_or_init(|| RwLock::new(Arc::new(ScopeStoryAccessAuthorizer)))
        .write()
        .unwrap_or_else(std::sync::PoisonError::into_inner) = authorizer;
}

pub(super) async fn ensure_story_read_capability(
    actor: &AuthenticatedActor,
    ctx: &AppContext,
    request_ctx: &RequestContext,
) -> Result<(), ApiErrorResponse> {
    let access_actor = match &actor.0 {
        ActorContext::Anonymous => StoryAccessActor::Anonymous,
        ActorContext::Service { .. } => StoryAccessActor::Service,
        ActorContext::System => StoryAccessActor::System,
        ActorContext::User { user_id, scopes } => StoryAccessActor::User { user_id, scopes },
    };
    let authorized = story_access_authorizer()
        .has_story_access(access_actor, ctx)
        .await
        .map_err(|error| ApiErrorResponse::with_context(error, request_ctx))?;
    if authorized {
        Ok(())
    } else {
        Err(ApiErrorResponse::with_context(
            AppError::new(
                ErrorCode::Forbidden,
                format!("missing Console capability: {STORY_CONSOLE_CAPABILITY}"),
            ),
            request_ctx,
        ))
    }
}

pub(super) fn normalized_limit(limit: Option<i64>) -> i64 {
    limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT)
}

pub(super) fn normalized_bucket_seconds(bucket_seconds: Option<i64>) -> i64 {
    bucket_seconds.unwrap_or(300).clamp(60, 3600)
}

pub(super) fn page_info(limit: i64, next_created_before: Option<DateTime<Utc>>) -> PageInfo {
    PageInfo {
        limit,
        next_created_before,
    }
}

pub(super) fn story_not_found(
    request_ctx: &RequestContext,
    correlation_id: &str,
) -> ApiErrorResponse {
    ApiErrorResponse::with_context(
        AppError::new(
            ErrorCode::NotFound,
            format!("Runtime story {correlation_id} was not found"),
        ),
        request_ctx,
    )
}

pub(super) fn query_error(source: sqlx::Error, request_ctx: &RequestContext) -> ApiErrorResponse {
    ApiErrorResponse::with_context(
        AppError::new(ErrorCode::Internal, "Runtime story query failed").with_source(source),
        request_ctx,
    )
}
