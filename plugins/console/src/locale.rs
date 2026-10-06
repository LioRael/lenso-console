//! Account locale policy. Storage remains a Plan-bound capability, never browser state.
use crate::http::{IntoResponse, Json, Request, Response};
use http::{Method, StatusCode, header};
use lenso_capability_console_locale_store as store;
use serde::Deserialize;
use serde_json::{Value, json};

#[derive(Clone, Debug, Default)]
pub(super) struct LocaleService {
    pub store: Option<store::LocaleStoreClient>,
    pub access: Option<lenso_capability_access_control::AccessControlClient>,
    pub scope: Option<crate::session::AssistantPermission>,
}

pub(super) fn is_locale_path(path: &str) -> bool {
    matches!(
        path,
        "/api/console/v1/locale"
            | "/api/console/v1/locale/preference"
            | "/api/console/v1/locale/default"
    )
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct PreferenceInput {
    preference: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct DefaultInput {
    #[serde(deserialize_with = "required_locale")]
    locale: Option<String>,
}

fn required_locale<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<String>, D::Error> {
    Option::<String>::deserialize(deserializer)
}

fn identity(request: &Request) -> Option<(String, String)> {
    // Only the session boundary attaches this sealed extension after Auth succeeds.
    let assertion = request
        .context
        .sealed_extension(lenso_auth_sdk::ACTOR_ASSERTION_EXTENSION)?;
    let value: Value = serde_json::from_slice(assertion.value()).ok()?;
    let authority = value["issuer"].as_str()?;
    if authority != assertion.issuer() || value["actor_kind"] != "user" {
        return None;
    }
    Some((authority.into(), value["subject"].as_str()?.into()))
}

fn response(value: Value) -> Response {
    (
        StatusCode::OK,
        [(header::CACHE_CONTROL, "no-store")],
        Json(value),
    )
        .into_response()
}

impl LocaleService {
    /// Public Shell bootstrap contains no account preference or authorization metadata.
    pub async fn shell_html(&self, request: &Request, bytes: Vec<u8>) -> Vec<u8> {
        let global = if let Some(store) = &self.store {
            store
                .read_default_with_context(request.context.clone(), store::ReadDefaultRequest {})
                .await
                .ok()
                .and_then(|result| result.locale)
                .filter(|locale| matches!(locale.as_str(), "en" | "zh-CN"))
        } else {
            None
        };
        let locale = global.as_deref().unwrap_or_else(|| browser_locale(request));
        let bootstrap = format!(
            "<script type=\"application/json\" id=\"lenso-console-locale\">{}</script>",
            json!({"global_default":global,"locale":locale})
        );
        let Ok(html) = String::from_utf8(bytes) else {
            return Vec::new();
        };
        let html = html.replace("<html lang=\"en\"", &format!("<html lang=\"{locale}\""));
        if let Some(position) = html.find("<head>") {
            let position = position + "<head>".len();
            format!("{}{}{}", &html[..position], bootstrap, &html[position..]).into_bytes()
        } else {
            format!("{bootstrap}{html}").into_bytes()
        }
    }

    async fn can_manage(&self, request: &Request, subject: &str) -> Result<bool, Box<Response>> {
        let Some(scope) = &self.scope else {
            return Ok(false);
        };
        let Some(access) = &self.access else {
            return Ok(false);
        };
        access
            .check_permission_with_context(
                request.context.clone(),
                lenso_capability_access_control::CheckPermissionRequest {
                    subject: subject.into(),
                    scope: lenso_capability_access_control::CheckPermissionRequestScope {
                        kind: scope.scope_kind.clone(),
                        id: scope.scope_id.clone(),
                    },
                    permission: "console.locale.default.manage".into(),
                },
            )
            .await
            .map(|result| result.allowed)
            .map_err(|_| {
                crate::session::problem(
                    StatusCode::SERVICE_UNAVAILABLE,
                    "authorization_unavailable",
                )
            })
    }

    pub async fn handle(&self, request: &Request) -> Option<Response> {
        if !is_locale_path(&request.path) {
            return None;
        }
        Some(
            self.handle_locale(request)
                .await
                .unwrap_or_else(|response| *response),
        )
    }

    #[allow(clippy::too_many_lines)] // One request boundary keeps all write authorization before storage.
    async fn handle_locale(&self, request: &Request) -> Result<Response, Box<Response>> {
        let read = request.path == "/api/console/v1/locale" && request.method == Method::GET;
        let preference_write =
            request.path == "/api/console/v1/locale/preference" && request.method == Method::PUT;
        let default_write =
            request.path == "/api/console/v1/locale/default" && request.method == Method::PUT;
        if !read && !preference_write && !default_write {
            return Err(crate::session::problem(
                StatusCode::METHOD_NOT_ALLOWED,
                "method_not_allowed",
            ));
        }
        let account = identity(request);
        if !read && account.is_none() {
            return Err(crate::session::problem(
                StatusCode::UNAUTHORIZED,
                "authentication_required",
            ));
        }
        let can_manage = if let Some((_, subject)) = &account {
            if default_write {
                self.can_manage(request, subject).await?
            } else {
                self.can_manage(request, subject).await.unwrap_or(false)
            }
        } else {
            false
        };
        if default_write && !can_manage {
            return Err(crate::session::problem(
                StatusCode::FORBIDDEN,
                "locale_default_permission_required",
            ));
        }
        let Some(store) = &self.store else {
            return Err(crate::session::problem(
                StatusCode::SERVICE_UNAVAILABLE,
                "locale_store_unavailable",
            ));
        };
        if preference_write {
            let input: PreferenceInput = serde_json::from_slice(&request.body).map_err(|_| {
                crate::session::problem(StatusCode::BAD_REQUEST, "invalid_locale_preference")
            })?;
            if !matches!(input.preference.as_str(), "global" | "en" | "zh-CN") {
                return Err(crate::session::problem(
                    StatusCode::BAD_REQUEST,
                    "invalid_locale_preference",
                ));
            }
            let (authority, subject) = account.as_ref().expect("authenticated write");
            let input = serde_json::from_value(
                json!({"authority":authority,"subject":subject,"preference":input.preference}),
            )
            .map_err(|_| {
                crate::session::problem(StatusCode::BAD_REQUEST, "invalid_locale_preference")
            })?;
            store
                .write_preference_with_context(request.context.clone(), input)
                .await
                .map_err(|_| {
                    crate::session::problem(
                        StatusCode::SERVICE_UNAVAILABLE,
                        "locale_store_unavailable",
                    )
                })?;
        }
        if default_write {
            let input: DefaultInput = serde_json::from_slice(&request.body)
                .map_err(|_| crate::session::problem(StatusCode::BAD_REQUEST, "invalid_locale"))?;
            if input
                .locale
                .as_deref()
                .is_some_and(|locale| !matches!(locale, "en" | "zh-CN"))
            {
                return Err(crate::session::problem(
                    StatusCode::BAD_REQUEST,
                    "invalid_locale",
                ));
            }
            let input = serde_json::from_value(json!({"locale":input.locale}))
                .map_err(|_| crate::session::problem(StatusCode::BAD_REQUEST, "invalid_locale"))?;
            store
                .write_default_with_context(request.context.clone(), input)
                .await
                .map_err(|_| {
                    crate::session::problem(
                        StatusCode::SERVICE_UNAVAILABLE,
                        "locale_store_unavailable",
                    )
                })?;
        }
        let defaults = store
            .read_default_with_context(request.context.clone(), store::ReadDefaultRequest {})
            .await
            .map_err(|_| {
                crate::session::problem(StatusCode::SERVICE_UNAVAILABLE, "locale_store_unavailable")
            })?;
        let defaults = serde_json::to_value(defaults).map_err(|_| {
            crate::session::problem(StatusCode::BAD_GATEWAY, "invalid_locale_store_response")
        })?;
        let preference = if let Some((authority, subject)) = account {
            let value = store
                .read_preference_with_context(
                    request.context.clone(),
                    store::ReadPreferenceRequest { authority, subject },
                )
                .await
                .map_err(|_| {
                    crate::session::problem(
                        StatusCode::SERVICE_UNAVAILABLE,
                        "locale_store_unavailable",
                    )
                })?;
            serde_json::to_value(value).map_err(|_| {
                crate::session::problem(StatusCode::BAD_GATEWAY, "invalid_locale_store_response")
            })?["preference"]
                .clone()
        } else {
            json!("global")
        };
        let global = defaults["locale"].clone();
        let locale = if preference != "global" {
            preference.clone()
        } else if !global.is_null() {
            global.clone()
        } else {
            Value::Null
        };
        Ok(response(
            json!({"global_default":global,"preference":preference,"locale":locale,"can_manage_default":can_manage,"available":true}),
        ))
    }
}

fn browser_locale(request: &Request) -> &'static str {
    let mut languages = request
        .headers
        .get(header::ACCEPT_LANGUAGE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .split(',')
        .filter_map(|range| {
            let mut parts = range.trim().split(';');
            let language = parts.next()?.trim().to_ascii_lowercase();
            let locale = if language == "zh" || language.starts_with("zh-") {
                "zh-CN"
            } else if language == "en" || language.starts_with("en-") {
                "en"
            } else {
                return None;
            };
            let quality = parts
                .find_map(|part| part.trim().strip_prefix("q="))
                .map_or(Some(1.0_f32), |value| value.parse::<f32>().ok())?;
            (quality > 0.0 && quality <= 1.0).then_some((locale, quality))
        })
        .collect::<Vec<_>>();
    languages.sort_by(|a, b| b.1.total_cmp(&a.1));
    languages.first().map_or("en", |(locale, _)| *locale)
}

#[cfg(test)]
mod tests {
    use super::*;

    // Prevent the HTML bootstrap from disagreeing with supported browser priorities
    // before client bundles load; API preference tests cannot exercise this response.
    #[tokio::test]
    async fn public_shell_bootstrap_uses_supported_language_quality() {
        let request = Request::new(Method::GET, "/settings")
            .with_header(header::ACCEPT_LANGUAGE, "fr, en;q=0.2, zh-TW;q=0.9");
        let html = LocaleService::default()
            .shell_html(&request, b"<html lang=\"en\"><head></head>".to_vec())
            .await;
        let html = String::from_utf8(html).unwrap();
        assert!(html.contains("<html lang=\"zh-CN\""));
        assert!(
            html.contains(r#"id="lenso-console-locale">{"global_default":null,"locale":"zh-CN"}"#)
        );
        assert_eq!(
            browser_locale(
                &Request::new(Method::GET, "/").with_header(header::ACCEPT_LANGUAGE, "zh;q=0, de")
            ),
            "en"
        );
    }

    // Prevent client-supplied subject/authority from selecting another account.
    // Existing session tests authenticate actors but do not exercise locale input.
    #[test]
    fn preference_input_rejects_account_overrides() {
        assert!(serde_json::from_value::<DefaultInput>(json!({})).is_err());
        assert!(
            serde_json::from_value::<PreferenceInput>(json!({"preference":"en","subject":"other"}))
                .is_err()
        );
        assert!(
            serde_json::from_value::<PreferenceInput>(
                json!({"preference":"en","authority":"other"})
            )
            .is_err()
        );
    }

    // Prevent unsupported locales and absent stores from being reported as persisted.
    #[tokio::test]
    async fn missing_store_is_unavailable_and_anonymous_writes_are_denied() {
        let service = LocaleService::default();
        assert_eq!(
            service
                .handle(&Request::new(Method::GET, "/api/console/v1/locale"))
                .await
                .unwrap()
                .status(),
            StatusCode::SERVICE_UNAVAILABLE
        );
        assert_eq!(
            service
                .handle(
                    &Request::new(Method::PUT, "/api/console/v1/locale/preference")
                        .with_body(r#"{"preference":"en"}"#)
                )
                .await
                .unwrap()
                .status(),
            StatusCode::UNAUTHORIZED
        );
    }
}

#[cfg(test)]
#[path = "locale/tests.rs"]
mod generated_store_tests;
