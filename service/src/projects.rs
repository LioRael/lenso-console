//! Console HTTP routes for the local Agent launcher.
use super::{
    AgentCatalog, AppAgentAdapter, Bytes, HeaderMap, Json, Method, OriginalUri, Response, State,
    StatusCode, allowed_agent_route_with_capabilities, problem, proxy_agent_request,
};
use crate::http::{IntoResponse as _, Path as HttpPath, Query, Request};
#[cfg(test)]
use lenso_local_agent_launcher::Project;
use serde::Deserialize;
#[cfg(test)]
use std::time::Duration;
use std::{path::PathBuf, sync::Arc};

pub type LocalProjects = lenso_local_agent_launcher::LocalProjects<AppAgentAdapter>;

pub(super) async fn handle(catalog: &AgentCatalog, request: &Request) -> Option<Response> {
    let tail = request.path.strip_prefix("/api/console/v1/agents/")?;
    let (agent_id, rest) = tail.split_once('/')?;
    let agent_id = crate::http::decode_path(agent_id)?;
    if !rest.starts_with("projects") {
        return None;
    }
    if request.body.len() > super::MAX_AGENT_REQUEST_BYTES {
        return Some(problem(
            StatusCode::PAYLOAD_TOO_LARGE,
            "Project request body is too large",
        ));
    }
    if rest == "projects" {
        return Some(match request.method {
            Method::GET => list(State(catalog.clone()), HttpPath(agent_id)).await,
            Method::POST => match serde_json::from_slice(&request.body) {
                Ok(value) => {
                    open(
                        State(catalog.clone()),
                        HttpPath(agent_id),
                        &request.headers,
                        Json(value),
                    )
                    .await
                }
                Err(_) => problem(StatusCode::BAD_REQUEST, "Invalid project request"),
            },
            _ => StatusCode::METHOD_NOT_ALLOWED.into_response(),
        });
    }
    if rest == "projects/directories" {
        return Some(if request.method == Method::GET {
            match serde_urlencoded::from_str(request.query.as_deref().unwrap_or_default()) {
                Ok(value) => directories(
                    State(catalog.clone()),
                    HttpPath(agent_id),
                    &request.headers,
                    Query(value),
                ),
                Err(_) => problem(StatusCode::BAD_REQUEST, "Invalid directory query"),
            }
        } else {
            StatusCode::METHOD_NOT_ALLOWED.into_response()
        });
    }
    let tail = rest.strip_prefix("projects/")?;
    let (project_id, path) = tail.split_once('/')?;
    Some(
        proxy(
            State(catalog.clone()),
            HttpPath((
                agent_id,
                crate::http::decode_path(project_id)?,
                crate::http::decode_path(path)?,
            )),
            OriginalUri(request.uri()),
            request.method.clone(),
            request.headers.clone(),
            request.body.clone(),
        )
        .await,
    )
}

#[allow(clippy::result_large_err)] // HTTP handlers return complete errors.
fn manager(catalog: &AgentCatalog, agent_id: &str) -> Result<Arc<LocalProjects>, Response> {
    if agent_id != "app" {
        return Err(problem(
            StatusCode::NOT_FOUND,
            "Local projects are unavailable for this Agent",
        ));
    }
    catalog.projects.clone().ok_or_else(|| {
        problem(
            StatusCode::NOT_FOUND,
            "This Agent does not support local projects",
        )
    })
}

#[allow(clippy::result_large_err)] // HTTP handlers return complete errors.
fn require_intent(headers: &HeaderMap) -> Result<(), Response> {
    if headers
        .get("x-lenso-console-projects")
        .is_some_and(|value| value == "1")
    {
        Ok(())
    } else {
        Err(problem(
            StatusCode::FORBIDDEN,
            "Project requests require the Console UI",
        ))
    }
}

async fn list(
    State(catalog): State<AgentCatalog>,
    HttpPath(agent_id): HttpPath<String>,
) -> Response {
    match manager(&catalog, &agent_id) {
        Ok(manager) => Json(serde_json::json!({"projects":manager.list().await,"defaultPath":std::env::current_dir().ok()})).into_response(),
        Err(error) => error,
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct OpenProject {
    path: PathBuf,
}

async fn open(
    State(catalog): State<AgentCatalog>,
    HttpPath(agent_id): HttpPath<String>,
    headers: &HeaderMap,
    Json(request): Json<OpenProject>,
) -> Response {
    if let Err(error) = require_intent(headers) {
        return error;
    }
    let manager = match manager(&catalog, &agent_id) {
        Ok(manager) => manager,
        Err(error) => return error,
    };
    let Some(source) = catalog.app_agents.iter().find(|agent| agent.id == agent_id) else {
        return problem(StatusCode::NOT_FOUND, "Agent was not found");
    };
    match manager.open(request.path, source).await {
        Ok(project) => Json(project).into_response(),
        Err(error) => problem(
            StatusCode::BAD_REQUEST,
            &format!("Could not open project: {error}"),
        ),
    }
}

#[derive(Deserialize)]
struct DirectoryQuery {
    path: PathBuf,
}

fn directories(
    State(catalog): State<AgentCatalog>,
    HttpPath(agent_id): HttpPath<String>,
    headers: &HeaderMap,
    Query(query): Query<DirectoryQuery>,
) -> Response {
    if let Err(error) = require_intent(headers) {
        return error;
    }
    if let Err(error) = manager(&catalog, &agent_id) {
        return error;
    }
    let result = LocalProjects::directories(&query.path);
    match result {
        Ok(value) => Json(value).into_response(),
        Err(error) => problem(
            StatusCode::BAD_REQUEST,
            &format!("Could not list directories: {error}"),
        ),
    }
}

async fn proxy(
    State(catalog): State<AgentCatalog>,
    HttpPath((agent_id, project_id, path)): HttpPath<(String, String, String)>,
    OriginalUri(incoming): OriginalUri,
    method: Method,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let manager = match manager(&catalog, &agent_id) {
        Ok(manager) => manager,
        Err(error) => return error,
    };
    if !manager.contains(&project_id).await {
        return problem(StatusCode::NOT_FOUND, "Project was not found");
    }
    if !(method == Method::GET && path == "activity"
        || allowed_agent_route_with_capabilities(&method, &path, true, false))
    {
        return problem(StatusCode::NOT_FOUND, "Project Agent route was not found");
    }
    match manager.adapter(&project_id).await {
        Ok(adapter) => {
            if method == Method::GET && path == "activity" {
                return super::project_activity::snapshot(
                    adapter.activity.as_ref().expect("project activity"),
                );
            }
            proxy_agent_request(adapter, path, incoming, method, headers, body).await
        }
        Err(error) => problem(
            StatusCode::SERVICE_UNAVAILABLE,
            &format!("Project is unavailable: {error}"),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn run_real_turn(manager: &LocalProjects, project: &Project) -> String {
        std::fs::write(project.path.join("proof.txt"), "before\n").unwrap();
        let adapter = manager.adapter(&project.id).await.unwrap();
        let activity = adapter.activity.clone().unwrap();
        let response = super::super::project_activity::relay(adapter.clone(), HeaderMap::new(), Bytes::from(serde_json::to_vec(&serde_json::json!({
            "request_id":uuid::Uuid::new_v4().to_string(),
            "model":"gpt-5.6-luna", "reasoning_effort":"low",
            "input":format!("In the current project only, read proof.txt then use the edit tool to replace before with {}. This change is authorized. Do not inspect other files or run shell commands. Finish after this edit.", project.id)
        })).unwrap())).await;
        assert!(response.status().is_success());
        drop(response);
        tokio::time::timeout(Duration::from_secs(120), async {
            loop {
                let state = activity.snapshot();
                if !state.running {
                    assert!(state.detail.is_none(), "{:?}", state.detail);
                    break;
                }
                if let Some(id) = &state.request_id {
                    let pending: serde_json::Value = adapter
                        .client
                        .get(
                            adapter
                                .origin
                                .join(&format!("api/console/v1/agent/turns/{id}/interactions"))
                                .unwrap(),
                        )
                        .header("authorization", adapter.authorization.as_ref().unwrap())
                        .send()
                        .await
                        .unwrap()
                        .json()
                        .await
                        .unwrap();
                    for interaction in pending["interactions"].as_array().unwrap() {
                        for question in interaction["questions"].as_array().unwrap() {
                            assert_eq!(question["questionId"], "approval");
                            let prompt = question["prompt"].as_str().unwrap();
                            let approve = question["options"].as_array().unwrap().iter().find(|option| option["optionId"] == "approve").unwrap();
                            let arguments: serde_json::Value = serde_json::from_str(approve["preview"].as_str().unwrap()).unwrap();
                            assert!((matches!(prompt, "Allow `read` to run once?" | "Allow `edit` to run once?") && arguments["path"] == "proof.txt") || prompt.starts_with("Allow `checkpoint_"), "Unexpected fixture Tool approval: {prompt}");
                        }
                        let interaction_id = interaction["interactionId"].as_str().unwrap();
                        adapter.client.post(adapter.origin.join(&format!("api/console/v1/agent/turns/{id}/interactions/{interaction_id}/answer")).unwrap()).header("authorization", adapter.authorization.as_ref().unwrap()).json(&serde_json::json!({"answers":[{"questionId":"approval","selectedOptionIds":["approve"]}]})).send().await.unwrap().error_for_status().unwrap();
                    }
                }
                tokio::time::sleep(Duration::from_secs(1)).await;
            }
        })
        .await
        .unwrap();
        assert_eq!(
            std::fs::read_to_string(project.path.join("proof.txt"))
                .unwrap()
                .trim(),
            project.id
        );
        std::fs::remove_file(project.path.join("proof.txt")).unwrap();
        activity.snapshot().session_id.unwrap()
    }

    #[tokio::test]
    #[ignore = "requires PROJECT_TEST_BINARY, PROJECT_TEST_TEMPLATE and a ready PROJECT_TEST_SOURCE_ORIGIN (defaults to 8787)"]
    async fn real_project_processes_keep_directories_and_registry() {
        let root = tempfile::tempdir().unwrap();
        let template = PathBuf::from(std::env::var_os("PROJECT_TEST_TEMPLATE").unwrap());
        let binary = PathBuf::from(std::env::var_os("PROJECT_TEST_BINARY").unwrap());
        let registry = root.path().join("registry");
        let manager =
            LocalProjects::load(registry.clone(), template.clone(), binary.clone()).unwrap();
        let origin = std::env::var("PROJECT_TEST_SOURCE_ORIGIN")
            .unwrap_or_else(|_| "http://127.0.0.1:8787".to_owned());
        let source = AppAgentAdapter::parse_as("app", &origin, "Source")
            .unwrap()
            .unwrap();
        let first = root.path().join("first");
        let second = root.path().join("second");
        std::fs::create_dir_all(&first).unwrap();
        std::fs::create_dir_all(&second).unwrap();
        let (a, b) = tokio::join!(manager.open(first, &source), manager.open(second, &source));
        let a = a.unwrap();
        let b = b.unwrap();
        assert_ne!(a.id, b.id);
        for project in [&a, &b] {
            let adapter = manager.adapter(&project.id).await.unwrap();
            let value: serde_json::Value = adapter
                .client
                .get(
                    adapter
                        .origin
                        .join("api/console/v1/agent/bootstrap")
                        .unwrap(),
                )
                .header("authorization", adapter.authorization.unwrap())
                .send()
                .await
                .unwrap()
                .error_for_status()
                .unwrap()
                .json()
                .await
                .unwrap();
            assert_eq!(value["workspace"]["path"], project.path.to_str().unwrap());
            assert_eq!(value["profile"].as_str(), project.profile.as_deref());
        }
        assert!(
            manager
                .open(root.path().join("missing"), &source)
                .await
                .is_err()
        );
        if std::env::var_os("PROJECT_TEST_TURNS").is_some() {
            let (first_session, second_session) =
                tokio::join!(run_real_turn(&manager, &a), run_real_turn(&manager, &b));
            assert_ne!(first_session, second_session);
            for (project, own, other) in [
                (&a, &first_session, &second_session),
                (&b, &second_session, &first_session),
            ] {
                let adapter = manager.adapter(&project.id).await.unwrap();
                let sessions = adapter
                    .client
                    .get(
                        adapter
                            .origin
                            .join("api/console/v1/agent/sessions")
                            .unwrap(),
                    )
                    .header("authorization", adapter.authorization.unwrap())
                    .send()
                    .await
                    .unwrap()
                    .text()
                    .await
                    .unwrap();
                assert!(sessions.contains(own));
                assert!(!sessions.contains(other));
            }
        }
        assert!(manager.adapter("unknown").await.is_err());
        assert_eq!(manager.list().await.len(), 2);
        manager.shutdown().await;
        let restored = LocalProjects::load(registry, template, binary).unwrap();
        assert_eq!(restored.list().await.len(), 2);
        assert!(restored.adapter(&a.id).await.is_ok());
        restored.shutdown().await;
        std::fs::remove_dir(&b.path).unwrap();
        assert!(restored.adapter(&b.id).await.is_err());
    }
}

#[cfg(test)]
mod route_tests {
    use super::*;

    #[tokio::test]
    async fn project_routes_do_not_fall_through_to_default_agent() {
        let root = tempfile::tempdir().unwrap();
        let manager = LocalProjects::load(
            root.path().join("registry"),
            root.path().join("template"),
            root.path().join("binary"),
        )
        .unwrap();
        let console = AppAgentAdapter::parse_console("http://127.0.0.1:1", None).unwrap();
        let mut catalog = AgentCatalog::new(console, Vec::new());
        catalog.projects = Some(manager);
        for path in ["app/projects/unknown/bootstrap", "console/projects"] {
            assert_eq!(
                handle(
                    &catalog,
                    &Request::new(Method::GET, &format!("/api/console/v1/agents/{path}"),),
                )
                .await
                .unwrap()
                .status(),
                StatusCode::NOT_FOUND
            );
        }
        assert_eq!(
            handle(
                &catalog,
                &Request::new(Method::GET, "/api/console/v1/agents/app/projects"),
            )
            .await
            .unwrap()
            .status(),
            StatusCode::OK
        );
        assert_eq!(
            handle(
                &catalog,
                &Request::new(Method::POST, "/api/console/v1/agents/app/projects")
                    .with_body(br#"{"path":"/tmp"}"#.as_slice()),
            )
            .await
            .unwrap()
            .status(),
            StatusCode::FORBIDDEN
        );
    }
}
