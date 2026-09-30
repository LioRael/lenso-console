//! An event-scoped bridge to the selected owner's finite D1 adapter.
use crate::{
    Error,
    storage::{Journal, JournalRequest, JournalResponse},
};
use futures::future::LocalBoxFuture;
use js_sys::Promise;
use serde::Serialize;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(typescript_type = "object")]
    type Store;
    #[wasm_bindgen(method, catch, js_name = call)]
    fn call(this: &Store, request: JsValue) -> Result<Promise, JsValue>;
    #[wasm_bindgen(method, catch, js_name = qualifies)]
    fn qualifies(this: &Store, deployment: &str, subject: &str) -> Result<Promise, JsValue>;
}
#[derive(Clone)]
pub struct WorkersJournal(JsValue);
impl std::fmt::Debug for WorkersJournal {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("WorkersJournal(event-scoped)")
    }
}
impl WorkersJournal {
    /// The private factory receives an object already scoped by the Host.
    pub fn from_binding(binding: &JsValue) -> Result<Self, Error> {
        if !binding.is_object() || binding.is_null() {
            return Err(Error::Unavailable);
        }
        Ok(Self(binding.clone()))
    }
    pub async fn is_qualified(&self, deployment: &str, subject: &str) -> Result<bool, Error> {
        let store: &Store = self.0.unchecked_ref();
        let promise = store
            .qualifies(deployment, subject)
            .map_err(|_| Error::Unavailable)?;
        let value = JsFuture::from(promise)
            .await
            .map_err(|_| Error::Unavailable)?;
        let wire: serde_json::Value =
            serde_wasm_bindgen::from_value(value).map_err(|_| Error::Unavailable)?;
        wire.get("qualified")
            .and_then(serde_json::Value::as_bool)
            .ok_or(Error::Unavailable)
    }
}
impl Journal for WorkersJournal {
    fn execute(
        &self,
        request: JournalRequest,
    ) -> LocalBoxFuture<'_, Result<JournalResponse, Error>> {
        Box::pin(async move {
            let wire = request
                .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
                .map_err(|_| Error::Unavailable)?;
            let store: &Store = self.0.unchecked_ref();
            let promise = store.call(wire).map_err(|_| Error::Unavailable)?;
            let value = JsFuture::from(promise)
                .await
                .map_err(|_| Error::Unavailable)?;
            let wire: serde_json::Value =
                serde_wasm_bindgen::from_value(value).map_err(|_| Error::Unavailable)?;
            if let Some(error) = wire.get("error").and_then(serde_json::Value::as_str) {
                return Err(match error {
                    "not_found" => Error::NotFound,
                    "invalid_input" => Error::InvalidInput,
                    _ => Error::Unavailable,
                });
            }
            serde_json::from_value(wire).map_err(|_| Error::Unavailable)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{IntentParameters, InvocationState, InvokeResponse, Record};
    use js_sys::{JSON, Object, Reflect};
    use serde_json::json;
    use wasm_bindgen_test::wasm_bindgen_test;

    #[wasm_bindgen_test]
    async fn durable_record_keeps_required_nulls_and_object_parameters() {
        let store = Object::new();
        let boundary = Closure::wrap(Box::new(move |packet: JsValue| -> Promise {
            let durable =
                JSON::parse(&JSON::stringify(&packet).unwrap().as_string().unwrap()).unwrap();
            let record = Reflect::get(&durable, &JsValue::from_str("record")).unwrap();
            let reply = Object::new();
            Reflect::set(
                &reply,
                &JsValue::from_str("kind"),
                &JsValue::from_str("record"),
            )
            .unwrap();
            Reflect::set(&reply, &JsValue::from_str("value"), &record).unwrap();
            let reply: JsValue = reply.into();
            Promise::resolve(&reply)
        }) as Box<dyn FnMut(JsValue) -> Promise>);
        Reflect::set(&store, &JsValue::from_str("call"), boundary.as_ref()).unwrap();
        let journal = WorkersJournal::from_binding(&store.into()).unwrap();
        let parameters = json!({"nested": {"value": 47}, "array": [{"present": true}]});
        let response = InvokeResponse {
            operation_id: Some("operation".into()),
            state: InvocationState::PendingApproval,
            result_json: None,
            receipt: None,
            audit_pending: true,
        };
        let outcome = journal
            .execute(JournalRequest::Reserve {
                deployment: "deployment".into(),
                key: "key".into(),
                record: Record {
                    subject: "alice".into(),
                    entry_id: "state.update".into(),
                    digest: "digest".into(),
                    binding_digest: "binding".into(),
                    expires_at: "2030-01-01T00:00:00Z".into(),
                    parameters: IntentParameters {
                        input: parameters.clone(),
                        expected_revision: Some("0".into()),
                    },
                    response: response.clone(),
                    execution_until_ms: None,
                },
            })
            .await
            .unwrap();
        let JournalResponse::Record(durable) = outcome else {
            panic!("the durable Owner boundary must return the stored record");
        };
        assert_eq!(durable.response, response);
        assert_eq!(durable.parameters.input, parameters);
        assert_eq!(durable.parameters.expected_revision.as_deref(), Some("0"));
        assert_eq!(durable.execution_until_ms, None);
    }
}
