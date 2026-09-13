//! Generated observability query Capability.

include!("generated.rs");

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn descriptor_identity_and_stream_are_stable() {
        assert_eq!(CAPABILITY_ID, "lenso.observability.query@1");
        assert_eq!(DESCRIPTOR_VERSION, "1.1.0");
        assert_eq!(WATCH_REQUESTS_OPERATION, "watch_requests");
    }

    #[test]
    fn unknown_domain_errors_remain_representable() {
        let value = ListRequestsError::Unknown(UnknownDomainError {
            code: "future_error".to_owned(),
            payload: Some(serde_json::json!({ "detail": "preserved" })),
            extra: std::collections::BTreeMap::new(),
        });
        let encoded = serde_json::to_value(&value).unwrap();
        assert_eq!(encoded["code"], "future_error");
        assert_eq!(encoded["payload"]["detail"], "preserved");
    }
}
