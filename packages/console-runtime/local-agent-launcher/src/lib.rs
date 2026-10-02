//! Local Agent process supervision; independent of Console and its HTTP transport.
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    future::Future,
    net::SocketAddr,
    path::{Path, PathBuf},
    sync::Arc,
    time::Duration,
};
use tokio::{
    process::{Child, Command},
    sync::Mutex,
};

/// Agent protocol operations used by the local launcher.
///
/// Implementations validate source readiness and supported Profiles before returning
/// a Profile. `connect` constructs an authenticated client without starting a process;
/// clones must share per-process state. This is a launcher interface, not a Lenso
/// Capability or Execution Adapter.
pub trait AgentClient: Clone + std::fmt::Debug + Send + Sync + 'static {
    fn connect(address: SocketAddr, token: String) -> anyhow::Result<Self>;
    fn require_ready(&self) -> impl Future<Output = anyhow::Result<()>> + Send;
    fn project_profile(&self) -> impl Future<Output = anyhow::Result<Option<String>>> + Send;
    fn initialize_profile(
        &self,
        profile: Option<&str>,
    ) -> impl Future<Output = anyhow::Result<()>> + Send;
}

const MAX_PROJECTS: usize = 8;
const MAX_TEMPLATE_BYTES: usize = 32 * 1024 * 1024;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Project {
    pub id: String,
    pub path: PathBuf,
    pub profile: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryListing {
    pub path: PathBuf,
    pub parent: Option<PathBuf>,
    pub directories: Vec<PathBuf>,
    pub truncated: bool,
}

#[derive(Debug)]
struct ProjectRuntime<A> {
    project: Project,
    running: Mutex<Option<(Child, A)>>,
}

#[derive(Debug)]
pub struct LocalProjects<A> {
    root: PathBuf,
    template: PathBuf,
    binary: PathBuf,
    projects: Mutex<BTreeMap<String, Arc<ProjectRuntime<A>>>>,
    creation: Mutex<()>,
}

impl<A: AgentClient> LocalProjects<A> {
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

    pub fn directories(path: &Path) -> anyhow::Result<DirectoryListing> {
        anyhow::ensure!(path.is_absolute(), "Choose an absolute directory path");
        let path = path.canonicalize()?;
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
        Ok(DirectoryListing {
            parent: path.parent().map(Path::to_path_buf),
            path,
            directories,
            truncated,
        })
    }

    pub async fn contains(&self, id: &str) -> bool {
        self.projects.lock().await.contains_key(id)
    }

    pub async fn list(&self) -> Vec<Project> {
        self.projects
            .lock()
            .await
            .values()
            .map(|entry| entry.project.clone())
            .collect()
    }

    pub async fn open(&self, path: PathBuf, source: &A) -> anyhow::Result<Project> {
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
        let profile = source.project_profile().await?;
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

    pub async fn adapter(&self, id: &str) -> anyhow::Result<A> {
        let runtime = self
            .projects
            .lock()
            .await
            .get(id)
            .cloned()
            .ok_or_else(|| anyhow::anyhow!("Project was not found"))?;
        self.start(&runtime).await
    }

    async fn start(&self, runtime: &ProjectRuntime<A>) -> anyhow::Result<A> {
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
        let adapter = A::connect(address, token.clone())?;
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
                        adapter
                            .initialize_profile(runtime.project.profile.as_deref())
                            .await?;
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

async fn stop_runtime<A: AgentClient>(runtime: &ProjectRuntime<A>) {
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
}

#[cfg(all(test, unix))]
mod process_tests {
    use super::*;
    use std::{
        os::unix::fs::PermissionsExt,
        sync::atomic::{AtomicUsize, Ordering},
    };

    #[derive(Clone, Debug, Default)]
    struct Client {
        token: String,
        initializations: Arc<AtomicUsize>,
    }

    impl AgentClient for Client {
        fn connect(_address: SocketAddr, token: String) -> anyhow::Result<Self> {
            Ok(Self {
                token,
                ..Self::default()
            })
        }
        fn require_ready(&self) -> impl Future<Output = anyhow::Result<()>> + Send {
            std::future::ready(Ok(()))
        }
        fn project_profile(&self) -> impl Future<Output = anyhow::Result<Option<String>>> + Send {
            std::future::ready(Ok(Some("code".to_owned())))
        }
        fn initialize_profile(
            &self,
            profile: Option<&str>,
        ) -> impl Future<Output = anyhow::Result<()>> + Send {
            assert_eq!(profile, Some("code"));
            self.initializations.fetch_add(1, Ordering::SeqCst);
            std::future::ready(Ok(()))
        }
    }

    // The fixture is a real child process. Only the Agent wire handshake is stubbed;
    // authentication/readiness and HTTP routing are tested by the Console client.
    fn fixture(root: &Path) -> PathBuf {
        let binary = root.join("agent-fixture");
        std::fs::write(&binary, r#"#!/bin/sh
printf '%s\n' "$$" "$PWD" "$LENSO_AGENT_HOME" "$LENSO_AGENT_WEB_TOKEN" "$@" > "$LENSO_AGENT_HOME/process.txt"
exec sleep 60
"#).unwrap();
        std::fs::set_permissions(&binary, std::fs::Permissions::from_mode(0o700)).unwrap();
        binary
    }

    async fn process(home: &Path, token: &str) -> Vec<String> {
        tokio::time::timeout(Duration::from_secs(5), async {
            loop {
                if let Ok(text) = std::fs::read_to_string(home.join("process.txt")) {
                    let lines: Vec<String> = text.lines().map(str::to_owned).collect();
                    if lines.get(3).is_some_and(|value| value == token) {
                        return lines;
                    }
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .expect("fixture must start in its private Home")
    }

    fn alive(pid: &str) -> bool {
        std::process::Command::new("kill")
            .args(["-0", pid])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .unwrap()
            .success()
    }

    #[tokio::test]
    async fn processes_restart_and_shutdown_without_losing_project_state() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().canonicalize().unwrap();
        let registry = root.join("registry");
        let template = root.join("template");
        let directory = root.join("workspace");
        std::fs::create_dir_all(&directory).unwrap();
        std::fs::write(directory.join("keep.txt"), "user data").unwrap();
        let binary = fixture(&root);
        let manager =
            LocalProjects::load(registry.clone(), template.clone(), binary.clone()).unwrap();
        let project = manager
            .open(directory.clone(), &Client::default())
            .await
            .unwrap();
        let first = manager.adapter(&project.id).await.unwrap();
        let home = registry.join(&project.id);
        let info = process(&home, &first.token).await;
        assert_eq!(info[1], directory.to_str().unwrap());
        assert_eq!(info[2], home.to_str().unwrap());
        assert!(info.iter().any(|arg| arg == "--plugin-control"));
        assert!(!info.iter().any(|arg| arg == "--profile"));
        assert_eq!(first.initializations.load(Ordering::SeqCst), 1);
        assert_eq!(
            manager
                .open(directory.clone(), &Client::default())
                .await
                .unwrap()
                .id,
            project.id
        );
        assert_eq!(
            manager.adapter(&project.id).await.unwrap().token,
            first.token
        );
        assert!(manager.adapter("unknown").await.is_err());
        let stored = std::fs::read(registry.join("projects.json")).unwrap();
        assert!(alive(&info[0]));
        manager.shutdown().await;
        assert!(!alive(&info[0]));
        assert_eq!(
            std::fs::read(registry.join("projects.json")).unwrap(),
            stored
        );
        let restored = LocalProjects::<Client>::load(registry, template, binary).unwrap();
        assert_eq!(restored.list().await.len(), 1);
        let second = restored.adapter(&project.id).await.unwrap();
        assert_ne!(first.token, second.token);
        let info = process(&home, &second.token).await;
        assert!(info.windows(2).any(|args| args == ["--profile", "code"]));
        assert_eq!(second.initializations.load(Ordering::SeqCst), 0);
        restored.shutdown().await;
        assert!(!alive(&info[0]));
        assert_eq!(
            std::fs::read_to_string(directory.join("keep.txt")).unwrap(),
            "user data"
        );
        std::fs::remove_file(directory.join("keep.txt")).unwrap();
        std::fs::remove_dir(directory).unwrap();
        assert!(restored.adapter(&project.id).await.is_err());
    }

    #[tokio::test]
    async fn failed_start_does_not_publish_a_project_or_leave_its_home() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().canonicalize().unwrap();
        let registry = root.join("registry");
        let directory = root.join("workspace");
        std::fs::create_dir_all(&directory).unwrap();
        let manager = LocalProjects::<Client>::load(
            registry.clone(),
            root.join("template"),
            root.join("missing-binary"),
        )
        .unwrap();
        assert!(manager.open(directory, &Client::default()).await.is_err());
        assert!(manager.list().await.is_empty());
        assert_eq!(std::fs::read_dir(registry).unwrap().count(), 0);
    }
}
