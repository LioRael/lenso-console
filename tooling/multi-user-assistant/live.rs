//! Cross-repository acceptance: real Account/Password, ingress, proxy, Agent and HTTP models.
//! Prevents identity being dropped by the ordinary proxy, global slow-turn blocking,
//! and cross-owner history/cancellation/provider changes; unit mocks cannot prove this path.
use super::*;
use lenso_app_plan::authoring::{PluginRootInstance, PluginRootSnapshot, resolve_plugin_root};
use lenso_console_password_session_consumer::{CSRF_COOKIE, CSRF_HEADER, SESSION_COOKIE};
use lenso_console_plugin::ConsolePluginConfig;
use lenso_postgres_kit::sqlx::{AssertSqlSafe, Executor, PgPool};
use serde_json::{Value, json};
use std::{
    path::Path,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

const ISSUER: &str = "console-assistant-synthetic";
const TOKEN: &str = "synthetic-local-agent-data-plane-only";
const KEY_A: &str = "synthetic-provider-a-key";
const KEY_B: &str = "synthetic-provider-b-key";

struct AgentProcess(std::process::Child);
impl Drop for AgentProcess {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

#[derive(Clone)]
struct Login {
    subject: String,
    cookie: String,
    csrf: String,
}
impl Login {
    fn request(
        &self,
        client: &reqwest::Client,
        method: reqwest::Method,
        url: String,
    ) -> reqwest::RequestBuilder {
        client
            .request(method, url)
            .header("cookie", &self.cookie)
            .header(CSRF_HEADER, &self.csrf)
    }
}

#[derive(Clone)]
struct ModelState {
    calls: Arc<Mutex<Vec<(String, String, Instant)>>>,
    provider: &'static str,
}
async fn model(
    axum::extract::State(state): axum::extract::State<ModelState>,
    headers: axum::http::HeaderMap,
    axum::Json(body): axum::Json<Value>,
) -> axum::response::Response {
    use axum::response::IntoResponse as _;
    let key = headers.get("authorization").unwrap().to_str().unwrap();
    assert!(
        key == format!(
            "Bearer {}",
            if state.provider == "a" { KEY_A } else { KEY_B }
        ) || (state.provider == "a" && key == "Bearer synthetic-alice-byok")
    );
    let input = body["messages"]
        .as_array()
        .unwrap()
        .iter()
        .rev()
        .find(|message| message["role"] == "user")
        .unwrap()["content"]
        .as_str()
        .unwrap()
        .to_owned();
    if input == "byok-proof" {
        assert!(
            key == "Bearer synthetic-alice-byok",
            "the actual model request must use the owner's synthetic BYOK credential"
        );
    }
    state
        .calls
        .lock()
        .unwrap()
        .push((state.provider.into(), input.clone(), Instant::now()));
    if input.contains("slow") {
        tokio::time::sleep(Duration::from_millis(1200)).await;
    }
    if input == "interaction-owner-proof"
        && !body["messages"]
            .as_array()
            .unwrap()
            .iter()
            .any(|message| message["role"] == "tool")
    {
        assert!(
            body["tools"]
                .as_array()
                .unwrap()
                .iter()
                .any(|tool| tool["function"]["name"] == "ask_user")
        );
        let arguments=json!({"questions":[{"id":"ownership","header":"Ownership","question":"Continue the synthetic owner proof?","options":[{"label":"Continue","description":"Only the owner can answer."}]}]}).to_string();
        let chunk = json!({"id":"synthetic","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"synthetic-owner-question","type":"function","function":{"name":"ask_user","arguments":arguments}}]},"finish_reason":null}]});
        let finish = json!({"id":"synthetic","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}});
        return (
            [(axum::http::header::CONTENT_TYPE, "text/event-stream")],
            format!("data: {chunk}\n\ndata: {finish}\n\ndata: [DONE]\n\n"),
        )
            .into_response();
    }
    let content = format!("provider-{}:{input}", state.provider);
    let chunk = json!({"id":"synthetic","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant","content":content},"finish_reason":null}]});
    let finish = json!({"id":"synthetic","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}});
    (
        [(axum::http::header::CONTENT_TYPE, "text/event-stream")],
        format!("data: {chunk}\n\ndata: {finish}\n\ndata: [DONE]\n\n"),
    )
        .into_response()
}

fn plugin_file(home: &Path, plugin: &str, file: &str, configuration: String) {
    let directory = home.join("plugins").join(plugin);
    std::fs::create_dir_all(&directory).unwrap();
    std::fs::write(directory.join(file), configuration).unwrap();
}
fn model_home(
    home: &Path,
    base_url: &str,
    database: &Path,
    public_key: &str,
    key_environment: &str,
) {
    plugin_file(
        home,
        "lenso.agent.model.openai-compatible",
        "model.toml",
        format!(
            "base_url = {}\nmodel = \"synthetic-model\"\nallowed_models = []\napi_key_ref = \"model/openai-api-key\"\n",
            json!(base_url)
        ),
    );
    plugin_file(
        home,
        "lenso.agent.loop",
        "agent.toml",
        "model = \"synthetic-model\"\n".into(),
    );
    plugin_file(
        home,
        "lenso.agent.session.sqlite",
        "sessions.toml",
        format!(
            "database = {}\n[authentication]\nissuer = {}\nverification_key = {}\n",
            json!(database),
            json!(ISSUER),
            json!(public_key)
        ),
    );
    plugin_file(
        home,
        "lenso.secrets.env",
        "user.toml",
        format!(
            "[references]\n\"model/openai-api-key\" = {}\n",
            json!(key_environment)
        ),
    );
    let authentication = format!(
        "[authentication]\nissuer = {}\nverification_key = {}\n",
        json!(ISSUER),
        json!(public_key)
    );
    plugin_file(
        home,
        "lenso.agent.artifact.file",
        "artifacts.toml",
        format!(
            "directory = {}\nmax_artifact_bytes = 1048576\nmax_total_bytes = 10485760\nmax_items = 100\n{authentication}",
            json!(home.parent().unwrap().join("artifacts"))
        ),
    );
    plugin_file(
        home,
        "lenso.agent.user-interaction.local",
        "local-interaction.toml",
        format!("max_pending = 16\ntimeout_ms = 300000\n{authentication}"),
    );
}
fn unused_address() -> std::net::SocketAddr {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    listener.local_addr().unwrap()
}
fn assert_no_plaintext_secret(directory: &Path, secret: &[u8]) {
    for entry in std::fs::read_dir(directory).unwrap() {
        let path = entry.unwrap().path();
        if path.is_dir() {
            assert_no_plaintext_secret(&path, secret);
        } else {
            let bytes = std::fs::read(path).unwrap();
            assert!(!bytes.windows(secret.len()).any(|window| window == secret));
        }
    }
}
#[allow(clippy::too_many_arguments)] // One subprocess receives the complete immutable fixture configuration.
fn launch_agent(
    binary: &Path,
    home: &Path,
    address: std::net::SocketAddr,
    authority: &Path,
    scheduling: &Path,
    providers: &Path,
    log: &Path,
) -> AgentProcess {
    let output = std::fs::File::create(log).unwrap();
    AgentProcess(
        std::process::Command::new(binary)
            .arg("--listen")
            .arg(address.to_string())
            .arg("--assistant-authority")
            .arg(authority)
            .arg("--assistant-scheduling")
            .arg(scheduling)
            .arg("--assistant-providers")
            .arg(providers)
            .arg("--allow-tool")
            .arg("ask_user")
            .env("LENSO_AGENT_HOME", home)
            .env("LENSO_AGENT_WEB_TOKEN", TOKEN)
            .env("SYNTHETIC_PROVIDER_A_KEY", KEY_A)
            .env("SYNTHETIC_PROVIDER_B_KEY", KEY_B)
            .env(
                "SYNTHETIC_BYOK_PASSPHRASE",
                "synthetic-byok-fixture-encryption-only",
            )
            .stdout(output.try_clone().unwrap())
            .stderr(output)
            .spawn()
            .unwrap(),
    )
}
async fn wait_agent(
    client: &reqwest::Client,
    origin: &str,
    process: &mut AgentProcess,
    log: &Path,
) {
    for _ in 0..300 {
        if let Some(status) = process.0.try_wait().unwrap() {
            panic!(
                "Agent exited {status}: {}",
                std::fs::read_to_string(log).unwrap()
            );
        }
        if client
            .get(format!("{origin}/api/console/v1/agent/bootstrap"))
            .bearer_auth(TOKEN)
            .send()
            .await
            .is_ok()
        {
            return;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    panic!(
        "Agent startup timed out: {}",
        std::fs::read_to_string(log).unwrap()
    );
}

async fn start_console(
    config: &ConsolePluginConfig,
    address: std::net::SocketAddr,
    accounts: &str,
    passwords: &str,
    public_key: &str,
    policy: Value,
) -> NativeApp {
    let mut host_config = ConsoleAppConfig::from_plugin(config).unwrap();
    host_config.address = address;
    let host = console_host_catalog(&host_config).unwrap();
    let root = PluginRootSnapshot::new([], [
        PluginRootInstance::new("lenso.console.web","default").with_configuration(json!({"require_user_session":true,"member_workspace_ids":["welcome"],"assistant_access":policy})),
        PluginRootInstance::new("lenso.web-ingress","default").with_configuration(json!({"session_cookie":{"name":SESSION_COOKIE,"csrf_cookie_name":CSRF_COOKIE,"csrf_header_name":CSRF_HEADER}})),
        PluginRootInstance::new("lenso.auth.account","default").with_configuration(json!({"schema":accounts,"issuer":ISSUER,"assertion_public_key":public_key,"database_url_secret":"database","assertion_signing_key_secret":"signing","token_pepper_secret":"pepper","assertion_ttl_seconds":120})),
        PluginRootInstance::new("lenso.auth.password","default").with_configuration(json!({"schema":passwords,"database_url_secret":"database","audience":audiences(),"session_ttl_seconds":600,"max_failures":5,"failure_window_seconds":60})),
        PluginRootInstance::new("lenso.console.test-password-session","default"),
        PluginRootInstance::new("lenso.secrets.env","default").with_configuration(json!({"references":{"database":"LENSO_POSTGRES_TEST_URL","signing":"CONSOLE_TEST_SECRET","pepper":"CONSOLE_TEST_SECRET"}})),
    ], []);
    let selected = resolve_plugin_root(&host, &root).unwrap();
    let host = http_admission_catalog(host, selected.plan()).unwrap();
    let resolved = resolve_plugin_root(&host, &root).unwrap();
    auth_plugins::validate_browser_session(resolved.plan()).unwrap();
    Kernel::start_native(
        resolved.plan().clone(),
        TokioDriver::new(),
        console_registry(),
    )
    .await
    .unwrap()
}
fn audiences() -> Vec<String> {
    let mut result = vec![
        "lenso.console@1:access".into(),
        "lenso.http.endpoint@1:handle".into(),
        "lenso.http.stream-endpoint@1:stream".into(),
        "lenso.agent@3:run_turn".into(),
        "lenso.agent.model@4:complete".into(),
        "lenso.agent.tools@2:execute_stream".into(),
        "lenso.agent.tool-provider@2:execute".into(),
        "lenso.agent.tool-hook@1:before_execute".into(),
        "lenso.agent.tool-hook@1:after_execute".into(),
        "lenso.ui.workspace-service@1:invoke".into(),
    ];
    for (capability, operations) in [
        (
            "lenso.agent.session@1",
            &["open", "append", "read", "list", "rename", "fork"][..],
        ),
        ("lenso.agent.artifact@1", &["put", "read"][..]),
        (
            "lenso.agent.user-interaction@2",
            &["ask", "pending", "answer"][..],
        ),
    ] {
        result.extend(
            operations
                .iter()
                .map(|operation| format!("{capability}:{operation}")),
        );
    }
    result
}
async fn login(app: &NativeApp, name: &str) -> Login {
    use lenso_capability_password_auth as password;
    let caller = "lenso.console.test-password-session/default";
    let identifier = format!("{name}@assistant.example.test");
    let passphrase = format!("Synthetic-strong-{name}-password-2026");
    app.handle::<password::PasswordRegister>(caller)
        .unwrap()
        .invoke(
            password::REGISTER_OPERATION,
            password::RegisterRequest {
                identifier: identifier.clone(),
                password: passphrase.clone(),
            },
        )
        .await
        .unwrap()
        .unwrap();
    let result = app
        .handle::<password::PasswordLogin>(caller)
        .unwrap()
        .invoke(
            password::LOGIN_OPERATION,
            password::LoginRequest {
                identifier,
                password: passphrase,
            },
        )
        .await
        .unwrap()
        .unwrap();
    let csrf = uuid::Uuid::new_v4().simple().to_string();
    Login {
        subject: result.subject,
        cookie: format!(
            "{SESSION_COOKIE}={}; {CSRF_COOKIE}={csrf}",
            result.credential
        ),
        csrf,
    }
}
async fn turn(
    client: &reqwest::Client,
    user: &Login,
    origin: &str,
    request: &str,
    session: Option<&str>,
    input: &str,
) -> String {
    let response = user
        .request(
            client,
            reqwest::Method::POST,
            format!("{origin}/api/console/v1/agent/turns"),
        )
        .json(&json!({"request_id":request,"session_id":session,"input":input}))
        .send()
        .await
        .unwrap();
    let status = response.status();
    let text = response.text().await.unwrap();
    assert_eq!(status, 200, "{text}");
    assert!(text.contains("turn_completed"), "{text}");
    for key in [KEY_A, KEY_B, "synthetic-alice-byok"] {
        assert!(!text.contains(key));
    }
    text
}
async fn verify_authentication_burst(client: &reqwest::Client, user: &Login, origin: &str) {
    let mut requests = tokio::task::JoinSet::new();
    for _ in 0..8 {
        let request = user.request(
            client,
            reqwest::Method::GET,
            format!("{origin}/api/console/v1/session"),
        );
        requests.spawn(async move {
            let response = request.send().await.unwrap();
            let status = response.status();
            let body = response.json::<Value>().await.unwrap();
            assert_eq!(status, 200, "authenticated browser burst: {body}");
            assert_eq!(body["authenticated"], true);
            assert_eq!(body["administrator"], false);
            assert_eq!(body["assistant_enabled"], true);
        });
    }
    while let Some(result) = requests.join_next().await {
        result.unwrap();
    }
    println!("eight concurrent authenticated Console session requests succeeded");
}
fn session(text: &str) -> String {
    text.lines()
        .filter_map(|line| line.strip_prefix("data:"))
        .filter_map(|value| serde_json::from_str::<Value>(value.trim()).ok())
        .find_map(|event| event["session_id"].as_str().map(str::to_owned))
        .expect("completed event with session_id")
}

async fn verify_actual_interaction(
    client: &reqwest::Client,
    alice: &Login,
    bob: &Login,
    origin: &str,
) {
    let dialog = turn(
        client,
        alice,
        origin,
        "alice-real-interaction",
        None,
        "interaction-owner-proof",
    );
    let answer = async {
        let pending_url =
            format!("{origin}/api/console/v1/agent/turns/alice-real-interaction/interactions");
        let mut pending = None;
        let mut last = String::new();
        for _ in 0..100 {
            let response = alice
                .request(client, reqwest::Method::GET, pending_url.clone())
                .send()
                .await
                .unwrap();
            let status = response.status();
            last = response.text().await.unwrap();
            if status == 200 {
                let value = serde_json::from_str::<Value>(&last).unwrap();
                if !value["interactions"].as_array().unwrap().is_empty() {
                    pending = Some(value);
                    break;
                }
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        let pending = pending.unwrap_or_else(||panic!("real ask_user produced no owner-scoped pending interaction; latest pending response: {last}"));
        let interaction = &pending["interactions"][0];
        let interaction_id = interaction["interactionId"].as_str().unwrap();
        let question = &interaction["questions"][0];
        let answers = json!({"answers":[{"questionId":question["questionId"],"selectedOptionIds":[question["options"][0]["optionId"]],"other":null}]});
        let status = bob
            .request(client, reqwest::Method::GET, pending_url)
            .send()
            .await
            .unwrap()
            .status();
        assert!(status == 403 || status == 404);
        let answer_url = format!(
            "{origin}/api/console/v1/agent/turns/alice-real-interaction/interactions/{interaction_id}/answer"
        );
        let status = bob
            .request(client, reqwest::Method::POST, answer_url.clone())
            .json(&answers)
            .send()
            .await
            .unwrap()
            .status();
        assert!(
            status == 403 || status == 404,
            "foreign answer to known real interaction: {status}"
        );
        assert_eq!(
            alice
                .request(client, reqwest::Method::POST, answer_url)
                .json(&answers)
                .send()
                .await
                .unwrap()
                .status(),
            204
        );
    };
    let (dialog, ()) = tokio::join!(dialog, answer);
    assert!(dialog.contains("provider-a:interaction-owner-proof"));
    println!(
        "real ask_user pending interaction: foreign query/known-ID answer rejected, owner answered and completed"
    );
}

#[tokio::test(flavor = "current_thread")]
#[ignore = "requires LENSO_POSTGRES_TEST_URL, CONSOLE_TEST_SECRET and LENSO_ASSISTANT_AGENT_BINARY"]
#[allow(clippy::too_many_lines)]
async fn real_two_login_users_parallel_owned_providers_and_byok() {
    tokio::task::LocalSet::new().run_until(Box::pin(async {
        link(); auth_plugins::link(); lenso_console_password_session_consumer::link_plugin();
        let url = std::env::var("LENSO_POSTGRES_TEST_URL").unwrap();
        let key = lenso_auth_account_plugin::assertion_public_key(std::env::var("CONSOLE_TEST_SECRET").unwrap());
        let suffix = uuid::Uuid::new_v4().simple().to_string();
        let accounts=format!("assistant_accounts_{suffix}"); let passwords=format!("assistant_passwords_{suffix}");
        lenso_auth_account_plugin::AccountAuthOperator::setup(&url,&accounts).await.unwrap();
        lenso_auth_password_plugin::PasswordAuthOperator::setup(&url,&passwords).await.unwrap();
        let directory = tempfile::tempdir().unwrap(); let root=directory.path();
        std::fs::write(root.join("index.html"),"<!doctype html><title>Assistant acceptance</title>").unwrap();
        let calls=Arc::new(Mutex::new(Vec::new()));
        let listener=tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let upstream=format!("http://{}",listener.local_addr().unwrap());
        let router=axum::Router::new().route("/a/v1/chat/completions",axum::routing::post(model).with_state(ModelState{calls:calls.clone(),provider:"a"})).route("/b/v1/chat/completions",axum::routing::post(model).with_state(ModelState{calls:calls.clone(),provider:"b"}));
        let model_server=tokio::spawn(async move {axum::serve(listener,router).await.unwrap();});
        let home_a=root.join("provider-a"); let home_b=root.join("provider-b"); let home_base=root.join("base-agent");
        model_home(&home_base,&format!("{upstream}/a/v1"),&root.join("sessions.sqlite"),&key,"SYNTHETIC_PROVIDER_A_KEY");
        model_home(&home_a,&format!("{upstream}/a/v1"),&root.join("sessions.sqlite"),&key,"SYNTHETIC_PROVIDER_A_KEY");
        model_home(&home_b,&format!("{upstream}/b/v1"),&root.join("sessions.sqlite"),&key,"SYNTHETIC_PROVIDER_B_KEY");
        let authority=root.join("authority.json"); let scheduling=root.join("scheduling.json"); let providers=root.join("providers.json"); let log=root.join("agent.log");
        std::fs::write(&authority,json!({"issuer":ISSUER,"public_key":key}).to_string()).unwrap();
        std::fs::write(&scheduling,json!({"global_running":4,"per_user_running":2,"global_queue":16,"per_user_queue":8,"fair":true,"queue_policy":"queue"}).to_string()).unwrap();
        let mut provider_config=json!({"providers":[{"id":"a","label":"Synthetic A","agent_home":home_a,"model":"synthetic-model","byok":{"secrets_instance":"user","credential_reference":"model/openai-api-key","key_environment_variable":"SYNTHETIC_BYOK_PASSPHRASE"}},{"id":"b","label":"Synthetic B","agent_home":home_b,"model":"synthetic-model"}],"users":{},"byok_enabled":true,"settings_database":root.join("settings.sqlite"),"byok_root":root.join("byok")});
        for provider in provider_config["providers"].as_array_mut().unwrap(){provider["allowed_tools"]=json!(["ask_user"]);}
        std::fs::write(&providers,provider_config.to_string()).unwrap();
        let agent_address=unused_address(); let agent_origin=format!("http://{agent_address}"); let client=reqwest::Client::new();
        let binary=std::path::PathBuf::from(std::env::var("LENSO_ASSISTANT_AGENT_BINARY").unwrap());
        let mut agent=launch_agent(&binary,&home_base,agent_address,&authority,&scheduling,&providers,&log); wait_agent(&client,&agent_origin,&mut agent,&log).await;
        let token_file=root.join("agent-token"); crate::store_agent_control_token(&token_file,TOKEN).unwrap();
        let mut config=ConsolePluginConfig::defaults(); config.web_root=std::env::var("LENSO_ASSISTANT_WEB_ROOT").unwrap_or_else(|_|root.to_str().unwrap().into()); config.agent_home=root.join("console-agent").to_str().unwrap().into(); config.console_agent_url=agent_origin.clone(); config.agent_control_token_file=Some(token_file.to_str().unwrap().into());
        let console_address=unused_address(); let origin=format!("http://{console_address}");
        let app=start_console(&config,console_address,&accounts,&passwords,&key,json!({"enabled":false})).await;
        let alice=login(&app,"alice").await; let bob=login(&app,"bob").await; let denied=login(&app,"denied").await;
        assert_ne!(alice.subject,bob.subject);
        assert_eq!(alice.request(&client,reqwest::Method::GET,format!("{origin}/api/console/v1/agent/bootstrap")).send().await.unwrap().status(),403);
        assert_eq!(app.shutdown(Duration::from_secs(3)).await,ShutdownOutcome::Clean); drop(agent);
        provider_config["users"][json!([ISSUER,alice.subject]).to_string()]=json!(["a"]); provider_config["users"][json!([ISSUER,bob.subject]).to_string()]=json!(["b"]);
        std::fs::write(&providers,provider_config.to_string()).unwrap();
        let mut agent=launch_agent(&binary,&home_base,agent_address,&authority,&scheduling,&providers,&log); wait_agent(&client,&agent_origin,&mut agent,&log).await;
        let app=start_console(&config,console_address,&accounts,&passwords,&key,json!({"enabled":true,"subjects":[alice.subject,bob.subject],"allow_administrators":false})).await;
        let denied_session=denied.request(&client,reqwest::Method::GET,format!("{origin}/api/console/v1/session")).send().await.unwrap(); assert_eq!(denied_session.status(),200); let denied_session=denied_session.json::<Value>().await.unwrap(); assert_eq!(denied_session["authenticated"],true); assert_eq!(denied_session["administrator"],false); assert_eq!(denied_session["assistant_enabled"],false);
        for forged in [None,Some("e30")] {let request=client.get(format!("{agent_origin}/api/console/v1/agent/sessions")).bearer_auth(TOKEN);let request=if let Some(actor)=forged{request.header("x-lenso-actor-assertion",actor)}else{request};let status=request.send().await.unwrap().status();assert!(status==401||status==403,"unsigned/forged actor: {status}");}
        for path in ["agent/bootstrap","agent/sessions","assistant/settings"] {assert_eq!(denied.request(&client,reqwest::Method::GET,format!("{origin}/api/console/v1/{path}")).send().await.unwrap().status(),403);}
        assert_eq!(denied.request(&client,reqwest::Method::POST,format!("{origin}/api/console/v1/agent/turns")).json(&json!({"request_id":"denied-turn","input":"must-not-run"})).send().await.unwrap().status(),403);
        for user in [&alice,&bob] {let session=user.request(&client,reqwest::Method::GET,format!("{origin}/api/console/v1/session")).send().await.unwrap().json::<Value>().await.unwrap(); assert_eq!(session["administrator"],false); assert_eq!(session["assistant_enabled"],true); assert_eq!(user.request(&client,reqwest::Method::POST,format!("{origin}/api/console/v1/agent/terminal/executions")).json(&json!({"requestId":"denied-terminal","commandLine":"echo forbidden"})).send().await.unwrap().status(),403);}
        verify_authentication_burst(&client,&alice,&origin).await;
        let start=Instant::now();
        let slow=turn(&client,&alice,&origin,"independent-owner-request",None,"alice-private-slow");
        let fast=async {tokio::time::sleep(Duration::from_millis(100)).await; let text=turn(&client,&bob,&origin,"independent-owner-request",None,"bob-private-fast").await; assert!(start.elapsed()<Duration::from_millis(1100),"slow Alice blocked Bob"); println!("parallel different owners/providers: fast completed in {} ms with a 1200 ms upstream delay",start.elapsed().as_millis()); text};
        let (alice_turn,bob_turn)=tokio::join!(slow,fast);
        assert!(alice_turn.contains("provider-a:alice-private-slow")); assert!(bob_turn.contains("provider-b:bob-private-fast"));
        let same_provider_start=Instant::now();
        let shared_slow=turn(&client,&alice,&origin,"alice-shared-slow",None,"shared-host-slow");
        let shared_fast=async {tokio::time::sleep(Duration::from_millis(100)).await; let text=turn(&client,&alice,&origin,"alice-shared-fast",None,"shared-host-fast").await; assert!(same_provider_start.elapsed()<Duration::from_millis(1100),"one provider Host still serialized different sessions"); println!("parallel same owner/provider, separate sessions: fast completed in {} ms",same_provider_start.elapsed().as_millis()); text};
        let (shared_slow,shared_fast)=tokio::join!(shared_slow,shared_fast); assert!(shared_slow.contains("provider-a:shared-host-slow")); assert!(shared_fast.contains("provider-a:shared-host-fast")); assert_ne!(session(&shared_slow),session(&shared_fast));
        let alice_session=session(&alice_turn); let bob_session=session(&bob_turn);
        assert_ne!(alice_session,bob_session);
        let history=alice.request(&client,reqwest::Method::GET,format!("{origin}/api/console/v1/agent/sessions")).send().await.unwrap().text().await.unwrap(); assert!(history.contains(&alice_session)); assert!(!history.contains(&bob_session));
        for path in [format!("sessions/{alice_session}"),format!("sessions/{alice_session}/trajectory")] {let status=bob.request(&client,reqwest::Method::GET,format!("{origin}/api/console/v1/agent/{path}")).send().await.unwrap().status(); assert!(status==403||status==404,"cross-owner {path}: {status}");}
        let spoof=bob.request(&client,reqwest::Method::GET,format!("{origin}/api/console/v1/agent/sessions/{alice_session}")).header("x-lenso-actor-assertion","e30").header("x-lenso-subject",&alice.subject).send().await.unwrap().status(); assert!(spoof==403||spoof==404,"client actor spoof: {spoof}");
        let active=turn(&client,&alice,&origin,"alice-cancel-protected",Some(&alice_session),"cancel-private-slow");
        let attacks=async {tokio::time::sleep(Duration::from_millis(150)).await; for path in ["turns/alice-cancel-protected/cancel","turns/alice-cancel-protected/interactions"] {let method=if path.ends_with("cancel"){reqwest::Method::POST}else{reqwest::Method::GET};let status=bob.request(&client,method,format!("{origin}/api/console/v1/agent/{path}")).send().await.unwrap().status(); assert!(status==403||status==404,"cross-owner {path}: {status}");}};
        tokio::join!(active,attacks);
        let cancellable=async {let response=alice.request(&client,reqwest::Method::POST,format!("{origin}/api/console/v1/agent/turns")).json(&json!({"request_id":"alice-own-cancel","session_id":alice_session,"input":"own-cancel-slow"})).send().await.unwrap(); assert_eq!(response.status(),200); let text=response.text().await.unwrap(); assert!(text.contains("turn_cancelled"),"{text}");};
        let cancel=async {tokio::time::sleep(Duration::from_millis(200)).await; assert_eq!(alice.request(&client,reqwest::Method::POST,format!("{origin}/api/console/v1/agent/turns/alice-own-cancel/cancel")).send().await.unwrap().status(),202);};
        tokio::join!(cancellable,cancel);
        let bob_after_cancel=turn(&client,&bob,&origin,"bob-after-cancel",Some(&bob_session),"bob-after-cancel").await; assert!(bob_after_cancel.contains("provider-b:bob-after-cancel"));
        let first=turn(&client,&alice,&origin,"alice-ordered-one",Some(&alice_session),"ordered-one-slow");
        let second=async {tokio::time::sleep(Duration::from_millis(100)).await; turn(&client,&alice,&origin,"alice-ordered-two",Some(&alice_session),"ordered-two").await};
        tokio::join!(first,second);
        {let timestamps=calls.lock().unwrap(); let first_time=timestamps.iter().find(|(_,input,_)|input=="ordered-one-slow").unwrap().2; let second_time=timestamps.iter().find(|(_,input,_)|input=="ordered-two").unwrap().2; assert!(second_time.duration_since(first_time)>=Duration::from_millis(1100)); println!("same-session ordered upstream starts separated by {} ms",second_time.duration_since(first_time).as_millis());}
        let settings_url=format!("{origin}/api/console/v1/assistant/settings");
        verify_actual_interaction(&client,&alice,&bob,&origin).await;
        let alice_settings=alice.request(&client,reqwest::Method::GET,settings_url.clone()).send().await.unwrap().json::<Value>().await.unwrap(); let bob_settings=bob.request(&client,reqwest::Method::GET,settings_url.clone()).send().await.unwrap().json::<Value>().await.unwrap();
        assert_eq!(alice_settings["providers"][0]["id"],"a"); assert_eq!(bob_settings["providers"][0]["id"],"b");
        assert_eq!(bob.request(&client,reqwest::Method::PUT,settings_url.clone()).json(&json!({"provider_id":"a"})).send().await.unwrap().status(),403);
        let response=alice.request(&client,reqwest::Method::PUT,settings_url.clone()).json(&json!({"provider_id":"a","byok":{"provider_id":"a","api_key":"synthetic-alice-byok"}})).send().await.unwrap(); assert_eq!(response.status(),200); let settings=response.text().await.unwrap(); assert!(!settings.contains("synthetic-alice-byok")); assert!(serde_json::from_str::<Value>(&settings).unwrap()["has_byok"].as_bool().unwrap());
        assert_no_plaintext_secret(&root.join("byok"),b"synthetic-alice-byok");
        let bob_settings=bob.request(&client,reqwest::Method::GET,settings_url).send().await.unwrap().text().await.unwrap(); assert!(!bob_settings.contains("synthetic-alice-byok")); assert_eq!(serde_json::from_str::<Value>(&bob_settings).unwrap()["has_byok"],false);
        let byok=turn(&client,&alice,&origin,"alice-byok",None,"byok-proof").await; assert!(byok.contains("provider-a:byok-proof"));
        if let Some(path) = std::env::var_os("LENSO_ASSISTANT_UI_EVIDENCE_DIR") {
            let path=std::path::PathBuf::from(path); assert!(path.is_absolute()); std::fs::create_dir_all(&path).unwrap();
            let evidence=json!({"origin":origin,"agent_origin":agent_origin,"runtime_root":root,"alice":{"subject":alice.subject,"cookie":alice.cookie,"csrf":alice.csrf},"bob":{"subject":bob.subject,"cookie":bob.cookie,"csrf":bob.csrf},"denied":{"subject":denied.subject,"cookie":denied.cookie,"csrf":denied.csrf}});
            let mut options=std::fs::OpenOptions::new(); options.write(true).create_new(true);
            #[cfg(unix)] {use std::os::unix::fs::OpenOptionsExt as _; options.mode(0o600);}
            options.open(path.join("service.json")).unwrap().write_all(evidence.to_string().as_bytes()).unwrap();
            for _ in 0..600 {if path.join("finish").exists(){break;} tokio::time::sleep(Duration::from_secs(1)).await;}
        }
        assert_eq!(app.shutdown(Duration::from_secs(3)).await,ShutdownOutcome::Clean); drop(agent); model_server.abort();
        let pool=PgPool::connect(&url).await.unwrap(); for schema in [accounts,passwords] {pool.execute(AssertSqlSafe(format!("DROP SCHEMA \"{schema}\" CASCADE"))).await.unwrap();} pool.close().await;
        println!("PASS: real Auth -> Console -> Agent; parallel owners, slow upstream, ordered session, history/cancel/provider isolation, denied member, synthetic BYOK redaction");
    })).await;
}
