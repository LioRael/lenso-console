//! An event-scoped bridge to the selected owner's finite D1 adapter.
use crate::{
    Error,
    storage::{Journal, JournalRequest, JournalResponse},
};
use futures::future::LocalBoxFuture;
use js_sys::Promise;
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
            let wire = serde_wasm_bindgen::to_value(&request).map_err(|_| Error::Unavailable)?;
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
