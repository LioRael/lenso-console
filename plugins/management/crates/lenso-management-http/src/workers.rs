//! Scoped official MCP transport callback. Public actors and bearer values never cross it.
use crate::McpTransport;
use futures::future::LocalBoxFuture;
use js_sys::{Function, Promise};
use lenso_capability_http_endpoint as http;
use lenso_capability_management as management;
use lenso_kernel::InvocationContext;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::{JsFuture, future_to_promise};

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(typescript_type = "object")]
    type Transport;
    #[wasm_bindgen(method, catch, js_name = handle)]
    fn handle(this: &Transport, packet: JsValue, dispatch: &Function) -> Result<Promise, JsValue>;
}
#[derive(Clone)]
pub struct WorkersMcp {
    object: JsValue,
    resource: String,
}
impl std::fmt::Debug for WorkersMcp {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("WorkersMcp(event-scoped)")
    }
}
#[derive(Serialize)]
struct Packet {
    url: String,
    method: String,
    headers: Vec<(String, String)>,
    body: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Reply {
    status: i64,
    headers: Vec<(String, String)>,
    body: String,
}
#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "snake_case", deny_unknown_fields)]
enum Action {
    Catalog,
    Invoke { request: management::InvokeRequest },
    Status { request: management::StatusRequest },
}
impl WorkersMcp {
    pub fn from_binding(object: &JsValue, resource: String) -> Result<Self, &'static str> {
        if !object.is_object() || object.is_null() {
            return Err("MCP facility unavailable");
        }
        Ok(Self {
            object: object.clone(),
            resource,
        })
    }
}
impl McpTransport for WorkersMcp {
    fn handle(
        &self,
        context: InvocationContext,
        request: http::HandleRequest,
        management: management::ManagementClient,
    ) -> LocalBoxFuture<'_, Result<http::HandleResponse, ()>> {
        Box::pin(async move {
            let retained = context.clone();
            let dispatch = Closure::wrap(Box::new(move |input: JsValue| -> Promise {
                let context = retained.clone();
                let management = management.clone();
                future_to_promise(async move {
                    let action: Action = serde_wasm_bindgen::from_value(input)
                        .map_err(|_| JsValue::from_str("invalid_mcp_action"))?;
                    if context.is_cancelled() {
                        return Err(JsValue::from_str("request_cancelled"));
                    }
                    let value = match action {
                        Action::Catalog => match management
                            .catalog_with_context(context, management::CatalogRequest {})
                            .await
                        {
                            Ok(reply) => serde_json::to_value(reply)
                                .map_err(|_| JsValue::from_str("invalid_owner_reply"))?,
                            Err(management::ManagementCatalogInvocationError::Domain(
                                management::CatalogError::PermissionDenied,
                            )) => serde_json::json!({"error":"denied"}),
                            _ => serde_json::json!({"error":"unavailable"}),
                        },
                        Action::Invoke { request } => {
                            match management.invoke_with_context(context, request).await {
                                Ok(reply) => serde_json::to_value(reply)
                                    .map_err(|_| JsValue::from_str("invalid_owner_reply"))?,
                                Err(management::ManagementInvokeInvocationError::Domain(error)) => {
                                    match error {
                                        management::InvokeError::PermissionDenied => {
                                            serde_json::json!({"error":"denied"})
                                        }
                                        management::InvokeError::Conflict => {
                                            serde_json::json!({"error":"conflict"})
                                        }
                                        management::InvokeError::InvalidInput => {
                                            serde_json::json!({"error":"invalid_input"})
                                        }
                                        management::InvokeError::NotFound => {
                                            serde_json::json!({"error":"not_found"})
                                        }
                                        _ => serde_json::json!({"error":"unavailable"}),
                                    }
                                }
                                _ => serde_json::json!({"error":"unavailable"}),
                            }
                        }
                        Action::Status { request } => {
                            match management.status_with_context(context, request).await {
                                Ok(reply) => serde_json::to_value(reply)
                                    .map_err(|_| JsValue::from_str("invalid_owner_reply"))?,
                                Err(management::ManagementStatusInvocationError::Domain(error)) => {
                                    match error {
                                        management::StatusError::PermissionDenied => {
                                            serde_json::json!({"error":"denied"})
                                        }
                                        management::StatusError::Conflict => {
                                            serde_json::json!({"error":"conflict"})
                                        }
                                        management::StatusError::NotFound => {
                                            serde_json::json!({"error":"not_found"})
                                        }
                                        _ => serde_json::json!({"error":"unavailable"}),
                                    }
                                }
                                _ => serde_json::json!({"error":"unavailable"}),
                            }
                        }
                    };
                    serde_wasm_bindgen::to_value(&value)
                        .map_err(|_| JsValue::from_str("invalid_owner_reply"))
                })
            }) as Box<dyn FnMut(JsValue) -> Promise>);
            let packet = Packet {
                url: self.resource.clone(),
                method: request.method,
                // Protocol headers only. Authentication has already sealed the Rust context.
                headers: request
                    .headers
                    .into_iter()
                    .filter(|header| {
                        [
                            "content-type",
                            "accept",
                            "mcp-protocol-version",
                            "mcp-session-id",
                        ]
                        .iter()
                        .any(|name| header.name.eq_ignore_ascii_case(name))
                    })
                    .map(|header| (header.name, header.value))
                    .collect(),
                body: String::from_utf8(request.body.into_vec()).map_err(|_| ())?,
            };
            let packet = serde_wasm_bindgen::to_value(&packet).map_err(|_| ())?;
            let transport: &Transport = self.object.unchecked_ref();
            let promise = transport
                .handle(packet, dispatch.as_ref().unchecked_ref())
                .map_err(|_| ())?;
            let value = JsFuture::from(promise).await.map_err(|_| ())?;
            if context.is_cancelled() {
                return Err(());
            }
            let reply: Reply = serde_wasm_bindgen::from_value(value).map_err(|_| ())?;
            if !(100..=599).contains(&reply.status) || reply.body.len() > 1_048_576 {
                return Err(());
            }
            let mut headers = reply
                .headers
                .into_iter()
                .map(|(name, value)| http::HandleResponseHeadersItem { name, value })
                .collect::<Vec<_>>();
            headers.push(http::HandleResponseHeadersItem {
                name: "cache-control".into(),
                value: "no-store".into(),
            });
            Ok(http::HandleResponse {
                status: reply.status,
                body: reply.body.into_bytes().into(),
                headers,
            })
        })
    }
}
