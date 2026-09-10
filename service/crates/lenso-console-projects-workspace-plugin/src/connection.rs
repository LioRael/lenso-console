//! Fixed-operation adapter. The Host selects the origin; credentials never reach the browser.
use serde_json::{Value, json};
use std::{
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};
use tokio::sync::Mutex;
use zeroize::Zeroizing;
pub const OPERATIONS: &[&str] = &[
    "connection_status",
    "begin_connection",
    "poll_connection",
    "disconnect",
    "list_projects",
    "get_project",
    "create_project",
    "list_issues",
    "get_issue",
    "list_activity",
    "list_teams",
    "list_project_statuses",
    "list_workflow_states",
];
#[derive(Default)]
pub struct Connection {
    attempt: Option<Attempt>,
    grant: Option<Grant>,
}
impl std::fmt::Debug for Connection {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ProjectsConnection").finish_non_exhaustive()
    }
}
struct Attempt {
    id: String,
    remote_id: String,
    secret: Zeroizing<String>,
    url: String,
    expires: u128,
}
struct Grant {
    credential: Zeroizing<String>,
    subject: Option<String>,
    expires: u128,
}
fn now() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}
pub fn valid_origin(origin: &str) -> bool {
    reqwest::Url::parse(origin).is_ok_and(|u| {
        u.origin().ascii_serialization() == origin
            && u.username().is_empty()
            && u.password().is_none()
            && (u.scheme() == "https"
                || u.scheme() == "http"
                    && matches!(u.host_str(), Some("127.0.0.1" | "localhost" | "[::1]")))
    })
}
fn status(origin: &str, state: &Connection) -> Value {
    json!({"connected":state.grant.as_ref().is_some_and(|g|g.expires>now()),"label":origin,"subject":state.grant.as_ref().and_then(|g|g.subject.clone())})
}
async fn read(mut response: reqwest::Response, secret: Option<&str>) -> Result<(u16, Value), ()> {
    let code = response.status().as_u16();
    let mut bytes = Zeroizing::new(Vec::new());
    if response.content_length().is_some_and(|n| n > 4_194_304) {
        return Err(());
    }
    while let Some(chunk) = response.chunk().await.map_err(|_| ())? {
        if bytes.len() + chunk.len() > 4_194_304 {
            return Err(());
        }
        bytes.extend_from_slice(&chunk);
    }
    if secret.is_some_and(|s| !s.is_empty() && bytes.windows(s.len()).any(|w| w == s.as_bytes())) {
        return Err(());
    }
    Ok((code, serde_json::from_slice(&bytes).map_err(|_| ())?))
}
pub async fn invoke(
    origin: &str,
    state: &Arc<Mutex<Connection>>,
    operation: &str,
    body: Value,
) -> Result<Value, ()> {
    if !valid_origin(origin) {
        return Err(());
    }
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|_| ())?;
    // Serializes account replacement with in-flight operations. No mutation retry.
    let mut state = state.lock().await;
    match operation {
        "connection_status" => return Ok(status(origin, &state)),
        "disconnect" => {
            state.grant = None;
            state.attempt = None;
            return Ok(status(origin, &state));
        }
        "begin_connection" => return begin(origin, &client, &mut state).await,
        "poll_connection" => {
            let a = state
                .attempt
                .as_ref()
                .filter(|a| Some(a.id.as_str()) == body["attempt_id"].as_str() && a.expires > now())
                .ok_or(())?;
            let (code, value) = read(
                client
                    .post(format!("{origin}/auth/agent/connection/poll"))
                    .json(&json!({"attempt_id":a.remote_id,"polling_secret":a.secret.as_str()}))
                    .send()
                    .await
                    .map_err(|_| ())?,
                Some(a.secret.as_str()),
            )
            .await?;
            if code != 200 {
                return Err(());
            }
            if let Some(grant) = value.get("grant").filter(|g| !g.is_null()) {
                let expires = time::OffsetDateTime::parse(
                    grant["expires_at"].as_str().ok_or(())?,
                    &time::format_description::well_known::Rfc3339,
                )
                .map_err(|_| ())?
                .unix_timestamp_nanos()
                    / 1_000_000;
                let expires = u128::try_from(expires).map_err(|_| ())?;
                if expires <= now() || expires > now() + 3_600_000 {
                    return Err(());
                }
                let credential = grant["credential"]
                    .as_str()
                    .filter(|v| !v.is_empty() && v.len() <= 512)
                    .ok_or(())?;
                state.grant = Some(Grant {
                    credential: Zeroizing::new(credential.into()),
                    subject: grant["subject"].as_str().map(str::to_owned),
                    expires,
                });
                state.attempt = None;
            } else if value["state"].as_str().is_some_and(|v| v != "pending") {
                state.attempt = None;
                return Err(());
            }
            return Ok(status(origin, &state));
        }
        _ => {}
    }
    let Some(grant) = state.grant.as_ref().filter(|g| g.expires > now()) else {
        return Ok(json!({"status":401,"body":{}}));
    };
    let (url, method) = endpoint(origin, operation, &body)?;
    let mut request = client
        .request(method.clone(), url)
        .bearer_auth(grant.credential.as_str());
    if method == reqwest::Method::POST {
        request = request.header(reqwest::header::ORIGIN, origin).json(&body);
    }
    let (code, value) = read(
        request.send().await.map_err(|_| ())?,
        Some(grant.credential.as_str()),
    )
    .await?;
    if code == 401 {
        state.grant = None;
    }
    Ok(json!({"status":code,"body":value}))
}
async fn begin(
    origin: &str,
    client: &reqwest::Client,
    state: &mut Connection,
) -> Result<Value, ()> {
    if let Some(a) = state.attempt.as_ref().filter(|a| a.expires > now()) {
        return Ok(json!({"attempt_id":a.id,"authorization_url":a.url}));
    }
    let (code, value) = read(
        client
            .post(format!("{origin}/auth/agent/connection/begin"))
            .send()
            .await
            .map_err(|_| ())?,
        None,
    )
    .await?;
    if code != 200 {
        return Err(());
    }
    let url = value["authorization_url"].as_str().ok_or(())?;
    let parsed = reqwest::Url::parse(url).map_err(|_| ())?;
    if parsed.origin().ascii_serialization() != origin
        || parsed.path() != "/auth/agent/authorize"
        || !parsed.username().is_empty()
        || parsed.password().is_some()
    {
        return Err(());
    }
    let expires = value["expires_at_millis"]
        .as_str()
        .ok_or(())?
        .parse::<u128>()
        .map_err(|_| ())?;
    if expires <= now() || expires > now() + 600_000 {
        return Err(());
    }
    let secret = value["polling_secret"]
        .as_str()
        .filter(|v| !v.is_empty() && v.len() <= 512)
        .ok_or(())?;
    let attempt = Attempt {
        id: uuid::Uuid::new_v4().to_string(),
        remote_id: value["attempt_id"]
            .as_str()
            .filter(|v| v.len() <= 128)
            .ok_or(())?
            .into(),
        secret: Zeroizing::new(secret.into()),
        url: url.into(),
        expires,
    };
    let result = json!({"attempt_id":attempt.id,"authorization_url":attempt.url});
    state.attempt = Some(attempt);
    Ok(result)
}

fn endpoint(
    origin: &str,
    operation: &str,
    body: &Value,
) -> Result<(reqwest::Url, reqwest::Method), ()> {
    let (path, id, fields, method): (&str, Option<&str>, &[&str], reqwest::Method) = match operation
    {
        "list_projects" => (
            "/api/projects",
            None,
            &["organization_id", "include_archived", "limit", "after"],
            reqwest::Method::GET,
        ),
        "create_project" => ("/api/projects", None, &[], reqwest::Method::POST),
        "get_project" => (
            "/api/projects",
            Some("project_id"),
            &["organization_id"],
            reqwest::Method::GET,
        ),
        "list_issues" => (
            "/api/projects",
            Some("project_id"),
            &["organization_id", "include_archived", "limit", "after"],
            reqwest::Method::GET,
        ),
        "get_issue" | "list_activity" => (
            "/api/issues",
            Some("issue_id"),
            &["organization_id", "limit", "after"],
            reqwest::Method::GET,
        ),
        "list_teams" => (
            "/api/projects/catalog/teams",
            None,
            &["organization_id", "limit", "after"],
            reqwest::Method::GET,
        ),
        "list_project_statuses" => (
            "/api/projects/catalog/project-statuses",
            None,
            &["organization_id", "limit", "after"],
            reqwest::Method::GET,
        ),
        "list_workflow_states" => (
            "/api/projects/catalog/workflow-states",
            None,
            &["organization_id", "team_id", "limit", "after"],
            reqwest::Method::GET,
        ),
        _ => return Err(()),
    };
    let obj = body.as_object().ok_or(())?;
    if obj.keys().any(|key| {
        matches!(
            key.as_str(),
            "origin" | "url" | "headers" | "credential" | "actor" | "actor_subject"
        )
    }) {
        return Err(());
    }
    let mut url = reqwest::Url::parse(&format!("{origin}{path}")).map_err(|_| ())?;
    if let Some(field) = id {
        let value = body[field]
            .as_str()
            .filter(|v| !v.is_empty() && v.len() <= 256 && *v != "." && *v != "..")
            .ok_or(())?;
        url.path_segments_mut()?.push(value);
    }
    if operation == "list_issues" {
        url.path_segments_mut()?.push("issues");
    }
    if operation == "list_activity" {
        url.path_segments_mut()?.push("activity");
    }
    for field in fields {
        if let Some(value) = obj.get(*field).filter(|v| !v.is_null()) {
            let text = match value {
                Value::String(s) => s.clone(),
                Value::Bool(b) => b.to_string(),
                Value::Number(n) => n.to_string(),
                _ => return Err(()),
            };
            url.query_pairs_mut().append_pair(field, &text);
        }
    }
    Ok((url, method))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn disconnected_requests_do_not_contact_the_business_app() {
        let state = Arc::new(Mutex::new(Connection::default()));
        let response = invoke(
            "http://127.0.0.1:1",
            &state,
            "get_issue",
            json!({"issue_id":"x"}),
        )
        .await
        .unwrap();
        assert_eq!(response["status"], 401);
    }
    #[tokio::test]
    async fn status_and_disconnect_never_return_credentials() {
        let state = Arc::new(Mutex::new(Connection {
            attempt: None,
            grant: Some(Grant {
                credential: Zeroizing::new("private-test-grant".into()),
                subject: Some("user".into()),
                expires: now() + 60_000,
            }),
        }));
        let value = invoke("http://127.0.0.1:1", &state, "connection_status", json!({}))
            .await
            .unwrap();
        assert_eq!(value["connected"], true);
        assert!(!value.to_string().contains("private-test-grant"));
        assert!(!format!("{:?}", state.lock().await).contains("private-test-grant"));
        invoke("http://127.0.0.1:1", &state, "disconnect", json!({}))
            .await
            .unwrap();
        assert!(state.lock().await.grant.is_none());
    }
    #[test]
    fn fixed_origin_and_operation_cannot_be_retargeted() {
        assert!(!valid_origin("http://example.com"));
        assert!(!valid_origin("https://user@example.com"));
        assert!(!valid_origin("https://example.com/path"));
        assert!(valid_origin("http://127.0.0.1:55440"));
        assert!(endpoint("https://example.com", "unknown", &json!({})).is_err());
        assert!(
            endpoint(
                "https://example.com",
                "get_issue",
                &json!({"issue_id":"x","origin":"https://evil.test"})
            )
            .is_err()
        );
        let (url, _) = endpoint(
            "https://example.com",
            "get_issue",
            &json!({"issue_id":"a/b","organization_id":"org"}),
        )
        .unwrap();
        assert_eq!(
            url.as_str(),
            "https://example.com/api/issues/a%2Fb?organization_id=org"
        );
    }
}
