//! Project registry and local process supervision. Agent business state stays in each Home.
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    sync::Arc,
    time::Duration,
};

use axum::extract::Query;
use serde::{Deserialize, Serialize};
use tokio::{
    process::{Child, Command},
    sync::Mutex,
};

use super::{
    AgentCatalog, AppAgentAdapter, AxumPath, Bytes, HeaderMap, Json, Method, OriginalUri, Response,
    Router, State, StatusCode, allowed_agent_route_with_capabilities, any, get, problem,
    proxy_agent_request,
};

const MAX_PROJECTS: usize = 8;
const MAX_TEMPLATE_BYTES: usize = 32 * 1024 * 1024;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Project {
    pub id: String,
    pub path: PathBuf,
    pub profile: Option<String>,
}

#[derive(Debug)]
struct ProjectRuntime {
    project: Project,
    running: Mutex<Option<(Child, AppAgentAdapter)>>,
}

#[derive(Debug)]
pub struct LocalProjects {
    root: PathBuf,
    template: PathBuf,
    binary: PathBuf,
    projects: Mutex<BTreeMap<String, Arc<ProjectRuntime>>>,
    creation: Mutex<()>,
}

impl LocalProjects {
    pub fn load(root: PathBuf, template: PathBuf, binary: PathBuf) -> anyhow::Result<Arc<Self>> {
        private_directory(&root)?;
        let stored: Vec<Project> = match std::fs::read(root.join("projects.json")) {
            Ok(bytes) => serde_json::from_slice(&bytes)?,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Vec::new(),
            Err(error) => return Err(error.into()),
        };
        anyhow::ensure!(
            stored.len() <= MAX_PROJECTS,
            "Project registry exceeds its limit"
        );
        let mut projects = BTreeMap::new();
        for project in stored {
            anyhow::ensure!(
                uuid::Uuid::parse_str(&project.id).is_ok() && project.path.is_absolute(),
                "Invalid project registry"
            );
            let key = project.id.clone();
            anyhow::ensure!(
                projects
                    .insert(
                        key,
                        Arc::new(ProjectRuntime {
                            project,
                            running: Mutex::new(None)
                        })
                    )
                    .is_none(),
                "Duplicate project identity"
            );
        }
        Ok(Arc::new(Self {
            root,
            template,
            binary,
            projects: Mutex::new(projects),
            creation: Mutex::new(()),
        }))
    }

    async fn list(&self) -> Vec<Project> {
        self.projects
            .lock()
            .await
            .values()
            .map(|entry| entry.project.clone())
            .collect()
    }

    async fn open(&self, path: PathBuf, source: &AppAgentAdapter) -> anyhow::Result<Project> {
        let _creation = self.creation.lock().await;
        anyhow::ensure!(path.is_absolute(), "Choose an absolute directory path");
        let path = path.canonicalize()?;
        anyhow::ensure!(
            path.is_dir() && path.to_str().is_some(),
            "Choose an existing UTF-8 directory"
        );
        if let Some(existing) = self
            .list()
            .await
            .into_iter()
            .find(|project| project.path == path)
        {
            self.adapter(&existing.id).await?;
            return Ok(existing);
        }
        anyhow::ensure!(
            self.list().await.len() < MAX_PROJECTS,
            "At most eight projects can be opened by this launcher"
        );
        // Readiness verifies the source before copying its visible configuration.
        source.require_ready().await?;
        let mut url = source.origin.clone();
        url.set_path("/api/console/v1/agent/bootstrap");
        let mut request = source.client.get(url).timeout(Duration::from_secs(2));
        if let Some(token) = &source.authorization {
            request = request.header("authorization", token);
        }
        let bootstrap: serde_json::Value = request.send().await?.error_for_status()?.json().await?;
        let profile = bootstrap["profile"].as_str().map(str::to_owned);
        anyhow::ensure!(
            profile
                .as_deref()
                .is_none_or(|name| matches!(name, "plan" | "code" | "code-sandbox")),
            "This project launcher supports the standard coding Profiles"
        );
        let project = Project {
            profile,
            id: uuid::Uuid::new_v4().to_string(),
            path,
        };
        let home = self.root.join(&project.id);
        seed_home(&self.template, &home)?;
        let runtime = Arc::new(ProjectRuntime {
            project: project.clone(),
            running: Mutex::new(None),
        });
        if let Err(error) = self.start(&runtime).await {
            let _ = std::fs::remove_dir_all(&home);
            return Err(error);
        }
        let mut entries = self.list().await;
        entries.push(project.clone());
        if let Err(error) = publish_registry(&self.root, &entries) {
            stop_runtime(&runtime).await;
            return Err(error);
        }
        self.projects
            .lock()
            .await
            .insert(project.id.clone(), runtime);
        Ok(project)
    }

    async fn adapter(&self, id: &str) -> anyhow::Result<AppAgentAdapter> {
        let runtime = self
            .projects
            .lock()
            .await
            .get(id)
            .cloned()
            .ok_or_else(|| anyhow::anyhow!("Project was not found"))?;
        self.start(&runtime).await
    }

    async fn start(&self, runtime: &ProjectRuntime) -> anyhow::Result<AppAgentAdapter> {
        let mut running = runtime.running.lock().await;
        if let Some((child, adapter)) = running.as_mut()
            && child.try_wait()?.is_none()
        {
            return Ok(adapter.clone());
        }
        *running = None;
        let directory = runtime.project.path.canonicalize()?;
        anyhow::ensure!(
            directory == runtime.project.path && directory.is_dir(),
            "Project directory moved or is unavailable"
        );
        let home = self.root.join(&runtime.project.id);
        let listener = std::net::TcpListener::bind("127.0.0.1:0")?;
        let address = listener.local_addr()?;
        drop(listener);
        let token = uuid::Uuid::new_v4().to_string();
        let mut adapter =
            AppAgentAdapter::parse_as("app", &format!("http://{address}"), "Lenso Agent")
                .map_err(anyhow::Error::msg)?
                .ok_or_else(|| anyhow::anyhow!("Project adapter is unavailable"))?;
        adapter.activity = Some(Arc::default());
        adapter.authorization = Some(format!("Bearer {token}"));
        let mut command = Command::new(&self.binary);
        command
            .current_dir(&directory)
            .args([
                "--listen",
                &address.to_string(),
                "--plugin-control",
                "--plugin-configuration-store",
            ])
            .arg(home.join("plugin-configuration.sqlite3"))
            .arg("--tool-policy")
            .arg(home.join("tool-policy.json"))
            .env("LENSO_AGENT_HOME", &home)
            .env("LENSO_AGENT_WEB_TOKEN", &token)
            .env("LENSO_AGENT_CONTROL_TOKEN", &token)
            .env_remove("LENSO_AGENT_PROFILE")
            .kill_on_drop(true);
        let initialized = home.join("project-ready").is_file();
        if initialized && let Some(profile) = &runtime.project.profile {
            command.arg("--profile").arg(profile);
        }
        let mut child = command.spawn()?;
        let result = tokio::time::timeout(Duration::from_secs(60), async {
            loop {
                anyhow::ensure!(
                    child.try_wait()?.is_none(),
                    "Project Agent exited before readiness"
                );
                if adapter.require_ready().await.is_ok() {
                    if !initialized {
                        initialize_profile(&adapter, runtime.project.profile.as_deref()).await?;
                        std::fs::write(home.join("project-ready"), b"1")?;
                    }
                    return Ok(());
                }
                tokio::time::sleep(Duration::from_millis(100)).await;
            }
        })
        .await
        .unwrap_or_else(|_| Err(anyhow::anyhow!("Project Agent readiness timed out")));
        if let Err(error) = result {
            let _ = child.kill().await;
            let _ = child.wait().await;
            return Err(error);
        }
        *running = Some((child, adapter.clone()));
        Ok(adapter)
    }

    pub async fn shutdown(&self) {
        let entries: Vec<_> = self.projects.lock().await.values().cloned().collect();
        for runtime in entries {
            stop_runtime(&runtime).await;
        }
    }
}

async fn initialize_profile(
    adapter: &AppAgentAdapter,
    profile: Option<&str>,
) -> anyhow::Result<()> {
    let Some(profile) = profile else {
        return Ok(());
    };
    let token = adapter
        .authorization
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("Project authorization is unavailable"))?;
    let base = adapter.origin.join("api/console/v1/agent/")?;
    let configuration: serde_json::Value = adapter
        .client
        .get(base.join("control/plugins")?)
        .header("authorization", token)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    let inventory: serde_json::Value = adapter
        .client
        .get(base.join("plugins")?)
        .header("authorization", token)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    adapter.client.post(base.join("control/profiles/import")?).header("authorization", token).json(&serde_json::json!({"expectedRevision":configuration["revision"],"expectedStreamId":inventory["streamId"]})).send().await?.error_for_status()?;
    adapter
        .client
        .post(base.join("control/profile")?)
        .header("authorization", token)
        .json(&serde_json::json!({"profile":profile}))
        .send()
        .await?
        .error_for_status()?;
    Ok(())
}

async fn stop_runtime(runtime: &ProjectRuntime) {
    if let Some((mut child, _)) = runtime.running.lock().await.take() {
        let _ = child.kill().await;
        let _ = child.wait().await;
    }
}

fn private_directory(path: &Path) -> anyhow::Result<()> {
    std::fs::create_dir_all(path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700))?;
    }
    Ok(())
}

fn publish_registry(root: &Path, projects: &[Project]) -> anyhow::Result<()> {
    let temporary = root.join(format!("projects-{}.tmp", uuid::Uuid::new_v4()));
    std::fs::write(&temporary, serde_json::to_vec_pretty(projects)?)?;
    std::fs::rename(temporary, root.join("projects.json"))?;
    Ok(())
}

fn validate_roots(value: &toml::Value) -> anyhow::Result<()> {
    match value {
        toml::Value::Table(table) => {
            for (key, value) in table {
                if key == "root" {
                    anyhow::ensure!(
                        value.as_str() == Some("."),
                        "Project Tool roots must use root = dot"
                    );
                }
                validate_roots(value)?;
            }
        }
        toml::Value::Array(values) => {
            for value in values {
                validate_roots(value)?;
            }
        }
        _ => {}
    }
    Ok(())
}

fn snapshot_files(root: &Path) -> anyhow::Result<BTreeMap<PathBuf, Vec<u8>>> {
    fn visit(
        base: &Path,
        path: &Path,
        files: &mut BTreeMap<PathBuf, Vec<u8>>,
        total: &mut usize,
    ) -> anyhow::Result<()> {
        anyhow::ensure!(
            path.strip_prefix(base)?.components().count() <= 16,
            "Project template nesting exceeds its limit"
        );
        let metadata = std::fs::symlink_metadata(path)?;
        anyhow::ensure!(
            !metadata.file_type().is_symlink(),
            "Project template cannot contain symlinks"
        );
        if metadata.is_dir() {
            for entry in std::fs::read_dir(path)? {
                visit(base, &entry?.path(), files, total)?;
            }
        } else {
            anyhow::ensure!(
                metadata.is_file() && metadata.len() <= 1024 * 1024 && files.len() < 4096,
                "Project template contains an unsupported file"
            );
            let bytes = std::fs::read(path)?;
            *total += bytes.len();
            anyhow::ensure!(
                *total <= MAX_TEMPLATE_BYTES,
                "Project template is too large"
            );
            if let Ok(text) = std::str::from_utf8(&bytes) {
                if path
                    .extension()
                    .is_some_and(|extension| extension == "toml")
                {
                    validate_roots(&toml::from_str::<toml::Value>(text)?)?;
                }
                anyhow::ensure!(
                    !text.contains(base.to_string_lossy().as_ref()),
                    "Project configuration refers to private Agent Home; use portable configuration before opening a project"
                );
            }
            files.insert(path.strip_prefix(base)?.to_path_buf(), bytes);
        }
        Ok(())
    }
    let mut files = BTreeMap::new();
    let mut total = 0;
    for name in [
        "plugins",
        "profiles",
        "tool-policy.json",
        "runtime/model-catalog/openai-codex-direct.json",
    ] {
        let path = root.join(name);
        if path.exists() {
            visit(root, &path, &mut files, &mut total)?;
        }
    }
    Ok(files)
}

fn seed_home(template: &Path, home: &Path) -> anyhow::Result<()> {
    let files = snapshot_files(template)?;
    anyhow::ensure!(
        files == snapshot_files(template)?,
        "Agent configuration changed; open the project again"
    );
    private_directory(home)?;
    for (path, bytes) in files {
        let target = home.join(path);
        private_directory(
            target
                .parent()
                .ok_or_else(|| anyhow::anyhow!("Invalid template path"))?,
        )?;
        std::fs::write(target, bytes)?;
    }
    Ok(())
}

pub(super) fn routes(catalog: AgentCatalog) -> Router {
    Router::new()
        .route(
            "/api/console/v1/agents/{agent_id}/projects",
            get(list).post(open),
        )
        .route(
            "/api/console/v1/agents/{agent_id}/projects/directories",
            get(directories),
        )
        .route(
            "/api/console/v1/agents/{agent_id}/projects/{project_id}/{*path}",
            any(proxy),
        )
        .layer(axum::extract::DefaultBodyLimit::max(
            super::MAX_AGENT_REQUEST_BYTES,
        ))
        .layer(super::RequestBodyLimitLayer::new(
            super::MAX_AGENT_REQUEST_BYTES,
        ))
        .with_state(catalog)
}

#[allow(clippy::result_large_err)] // Axum handlers return complete HTTP errors.
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

#[allow(clippy::result_large_err)] // Axum handlers return complete HTTP errors.
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
    AxumPath(agent_id): AxumPath<String>,
) -> Response {
    match manager(&catalog, &agent_id) {
        Ok(manager) => Json(serde_json::json!({"projects":manager.list().await,"defaultPath":std::env::current_dir().ok()})).into_response(),
        Err(error) => error,
    }
}

use axum::response::IntoResponse;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct OpenProject {
    path: PathBuf,
}

async fn open(
    State(catalog): State<AgentCatalog>,
    AxumPath(agent_id): AxumPath<String>,
    headers: HeaderMap,
    Json(request): Json<OpenProject>,
) -> Response {
    if let Err(error) = require_intent(&headers) {
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

async fn directories(
    State(catalog): State<AgentCatalog>,
    AxumPath(agent_id): AxumPath<String>,
    headers: HeaderMap,
    Query(query): Query<DirectoryQuery>,
) -> Response {
    if let Err(error) = require_intent(&headers) {
        return error;
    }
    if let Err(error) = manager(&catalog, &agent_id) {
        return error;
    }
    let result = (|| -> anyhow::Result<serde_json::Value> {
        anyhow::ensure!(
            query.path.is_absolute(),
            "Choose an absolute directory path"
        );
        let path = query.path.canonicalize()?;
        let mut directories = Vec::new();
        let mut truncated = false;
        for (index, entry) in std::fs::read_dir(&path)?.take(1001).enumerate() {
            if index == 1000 {
                truncated = true;
                break;
            }
            let entry = entry?;
            if entry.file_type()?.is_dir() && !entry.file_name().to_string_lossy().starts_with('.')
            {
                directories.push(entry.path());
            }
        }
        directories.sort();
        Ok(
            serde_json::json!({"path":path,"parent":path.parent(),"directories":directories,"truncated":truncated}),
        )
    })();
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
    AxumPath((agent_id, project_id, path)): AxumPath<(String, String, String)>,
    OriginalUri(incoming): OriginalUri,
    method: Method,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let manager = match manager(&catalog, &agent_id) {
        Ok(manager) => manager,
        Err(error) => return error,
    };
    if !manager.projects.lock().await.contains_key(&project_id) {
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

    #[test]
    fn project_seed_excludes_history_and_rejects_shared_roots() {
        let root = tempfile::tempdir().unwrap();
        let source = root.path().join("source");
        let home = root.path().join("project");
        std::fs::create_dir_all(source.join("plugins/tool")).unwrap();
        std::fs::write(source.join("plugins/tool/default.toml"), "root = \".\"\n").unwrap();
        std::fs::write(source.join("sessions.json"), "private history").unwrap();
        std::fs::write(source.join("auth.json"), "private credentials").unwrap();
        seed_home(&source, &home).unwrap();
        assert!(home.join("plugins/tool/default.toml").is_file());
        assert!(!home.join("sessions.json").exists());
        assert!(!home.join("auth.json").exists());
        std::fs::write(
            source.join("plugins/tool/default.toml"),
            "root = \"/another/project\"\n",
        )
        .unwrap();
        assert!(seed_home(&source, &root.path().join("rejected")).is_err());
    }

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
                let state = activity.lock().unwrap().clone();
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
        activity.lock().unwrap().session_id.clone().unwrap()
    }

    #[tokio::test]
    #[ignore = "requires PROJECT_TEST_BINARY, PROJECT_TEST_TEMPLATE and a ready source Agent on 8787"]
    async fn real_project_processes_keep_directories_and_registry() {
        let root = tempfile::tempdir().unwrap();
        let template = PathBuf::from(std::env::var_os("PROJECT_TEST_TEMPLATE").unwrap());
        let binary = PathBuf::from(std::env::var_os("PROJECT_TEST_BINARY").unwrap());
        let registry = root.path().join("registry");
        let manager =
            LocalProjects::load(registry.clone(), template.clone(), binary.clone()).unwrap();
        let source = AppAgentAdapter::parse_as("app", "http://127.0.0.1:8787", "Source")
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
        let router = routes(catalog.clone()).merge(super::super::agent_catalog_routes(catalog));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            axum::serve(listener, router).await.unwrap();
        });
        let client = reqwest::Client::new();
        for path in ["app/projects/unknown/bootstrap", "console/projects"] {
            assert_eq!(
                client
                    .get(format!("http://{address}/api/console/v1/agents/{path}"))
                    .send()
                    .await
                    .unwrap()
                    .status(),
                StatusCode::NOT_FOUND
            );
        }
        assert_eq!(
            client
                .get(format!(
                    "http://{address}/api/console/v1/agents/app/projects"
                ))
                .send()
                .await
                .unwrap()
                .status(),
            StatusCode::OK
        );
        assert_eq!(
            client
                .post(format!(
                    "http://{address}/api/console/v1/agents/app/projects"
                ))
                .json(&serde_json::json!({"path":"/tmp"}))
                .send()
                .await
                .unwrap()
                .status(),
            StatusCode::FORBIDDEN
        );
        server.abort();
    }
}
