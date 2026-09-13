//! Generated contract for Plan-bound Workspace service dispatch.

include!("generated.rs");

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn request_projection_round_trips_portable_json() {
        let request = InvokeRequest {
            body_base64: "e30=".to_owned(),
            media_type: InvokeRequestMediaType::ApplicationJson,
            operation: "read".to_owned(),
            service_id: "example".to_owned(),
        };
        let wire = encode_invoke_request(&request).unwrap();

        assert_eq!(decode_invoke_request(&wire).unwrap(), request);
    }

    #[test]
    fn unknown_domain_errors_remain_representable() {
        assert!(matches!(
            decode_invoke_error("\"future_error\"").unwrap(),
            InvokeError::Unknown(_)
        ));
    }
}
