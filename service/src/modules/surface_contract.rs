use std::collections::{BTreeMap, BTreeSet};

use axum::http::Method;
use serde_json::{Map, Value, json};
use sha2::{Digest, Sha256};

use crate::modules::system_registry::connection::SurfaceApiContractArtifact;

pub const SURFACE_API_CONTRACT_FORMAT: &str = "openapi_3_1_json";
const MAX_CONTRACT_BYTES: usize = 2 * 1024 * 1024;

#[derive(Debug, Clone)]
pub(super) struct ContractOperation {
    pub surface_method: Method,
    pub target_method: Method,
    pub target_path: String,
    pub capability: String,
    pub idempotency: String,
    pub display_name: Option<String>,
    parameters: Vec<ContractParameter>,
    request_body: Option<ContractRequestBody>,
    static_body: Option<Value>,
    response_schemas: BTreeMap<String, Value>,
}

#[derive(Debug, Clone)]
struct ContractParameter {
    name: String,
    location: ParameterLocation,
    required: bool,
    schema: Value,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ParameterLocation {
    Path,
    Query,
}

#[derive(Debug, Clone)]
struct ContractRequestBody {
    schema: Value,
    property_names: BTreeSet<String>,
}

#[derive(Debug, Clone)]
pub(super) struct TargetCall {
    pub method: Method,
    pub path: String,
    pub query: Vec<(String, String)>,
    pub body: Option<Value>,
    pub path_params: Value,
}

pub(super) fn validate_contract_artifact(
    artifact: &SurfaceApiContractArtifact,
    expected_digest: &str,
    operation_ids: &[String],
) -> Result<(), String> {
    let document = parse_document(artifact, expected_digest)?;
    for operation_id in operation_ids {
        resolve_operation_from_document(&document, operation_id)?;
    }
    Ok(())
}

pub(super) fn resolve_operation(
    artifact: &SurfaceApiContractArtifact,
    expected_digest: &str,
    operation_id: &str,
) -> Result<ContractOperation, String> {
    let document = parse_document(artifact, expected_digest)?;
    resolve_operation_from_document(&document, operation_id)
}

pub(super) fn build_target_call(
    operation: &ContractOperation,
    input: &Value,
) -> Result<TargetCall, String> {
    let object = input
        .as_object()
        .ok_or_else(|| "Surface operation input must be a JSON object".to_owned())?;
    let mut consumed = BTreeSet::new();
    let mut path = operation.target_path.clone();
    let mut query = Vec::new();
    let mut path_params = Map::new();

    for parameter in &operation.parameters {
        let value = object.get(&parameter.name);
        if value.is_none() && parameter.required {
            return Err(format!(
                "Surface operation input is missing required {} parameter: {}",
                parameter_location_name(parameter.location),
                parameter.name
            ));
        }
        let Some(value) = value else {
            continue;
        };
        validate_instance(&parameter.schema, value, "Surface operation parameter")?;
        consumed.insert(parameter.name.clone());
        let encoded = scalar_string(value).ok_or_else(|| {
            format!(
                "Surface operation {} parameter must be a string, number, or boolean: {}",
                parameter_location_name(parameter.location),
                parameter.name
            )
        })?;
        match parameter.location {
            ParameterLocation::Path => {
                if encoded.is_empty() || !safe_path_segment(&encoded) {
                    return Err(format!(
                        "Surface operation path parameter is unsafe: {}",
                        parameter.name
                    ));
                }
                let placeholder = format!("{{{}}}", parameter.name);
                if !path.contains(&placeholder) {
                    return Err(format!(
                        "Surface operation target path does not declare parameter: {}",
                        parameter.name
                    ));
                }
                path = path.replace(&placeholder, &encoded);
                path_params.insert(parameter.name.clone(), value.clone());
            }
            ParameterLocation::Query => query.push((parameter.name.clone(), encoded)),
        }
    }

    if path.contains('{') || path.contains('}') {
        return Err("Surface operation target path has unresolved parameters".to_owned());
    }

    let remaining = object
        .iter()
        .filter(|(name, _)| !consumed.contains(name.as_str()))
        .map(|(name, value)| (name.clone(), value.clone()))
        .collect::<Map<_, _>>();
    let body = build_body(operation, remaining)?;

    Ok(TargetCall {
        method: operation.target_method.clone(),
        path,
        query,
        body,
        path_params: Value::Object(path_params),
    })
}

pub(super) fn validate_output(
    operation: &ContractOperation,
    status: u16,
    output: &Value,
) -> Result<(), String> {
    let exact = status.to_string();
    let schema = operation
        .response_schemas
        .get(&exact)
        .or_else(|| operation.response_schemas.get("default"))
        .or_else(|| {
            operation
                .response_schemas
                .iter()
                .find(|(code, _)| code.starts_with('2'))
                .map(|(_, schema)| schema)
        });
    let Some(schema) = schema else {
        return Ok(());
    };
    validate_instance(schema, output, "Connected Module response")
}

pub(super) fn document_digest(document: &str) -> String {
    format!("sha256:{:x}", Sha256::digest(document.as_bytes()))
}

fn parse_document(
    artifact: &SurfaceApiContractArtifact,
    expected_digest: &str,
) -> Result<Value, String> {
    if artifact.format != SURFACE_API_CONTRACT_FORMAT {
        return Err(format!(
            "Surface API contract format must be {SURFACE_API_CONTRACT_FORMAT}"
        ));
    }
    if artifact.document.len() > MAX_CONTRACT_BYTES {
        return Err("Surface API contract exceeds the 2 MiB limit".to_owned());
    }
    if document_digest(&artifact.document) != expected_digest {
        return Err("Surface API contract digest does not match its exact document".to_owned());
    }
    let document: Value = serde_json::from_str(&artifact.document)
        .map_err(|error| format!("Surface API contract is invalid JSON: {error}"))?;
    if document
        .get("openapi")
        .and_then(Value::as_str)
        .is_none_or(|version| !version.starts_with("3.1."))
    {
        return Err("Surface API contract must use OpenAPI 3.1".to_owned());
    }
    if document.get("paths").and_then(Value::as_object).is_none() {
        return Err("Surface API contract has no paths".to_owned());
    }
    Ok(document)
}

fn resolve_operation_from_document(
    document: &Value,
    operation_id: &str,
) -> Result<ContractOperation, String> {
    let paths = document
        .get("paths")
        .and_then(Value::as_object)
        .ok_or_else(|| "Surface API contract has no paths".to_owned())?;
    let mut resolved = None;
    for path_item in paths.values().filter_map(Value::as_object) {
        for method_name in ["get", "post", "patch", "put", "delete"] {
            let Some(operation) = path_item.get(method_name).and_then(Value::as_object) else {
                continue;
            };
            if operation.get("operationId").and_then(Value::as_str) != Some(operation_id) {
                continue;
            }
            if resolved.is_some() {
                return Err(format!(
                    "Surface operation is declared more than once: {operation_id}"
                ));
            }
            resolved = Some(parse_operation(
                document,
                path_item,
                operation,
                operation_id,
                method_name,
            )?);
        }
    }
    resolved.ok_or_else(|| {
        format!("Surface operation is not in the committed contract: {operation_id}")
    })
}

fn parse_operation(
    document: &Value,
    path_item: &Map<String, Value>,
    operation: &Map<String, Value>,
    operation_id: &str,
    surface_method: &str,
) -> Result<ContractOperation, String> {
    let target = operation
        .get("x-lenso-connected-route")
        .and_then(Value::as_object)
        .ok_or_else(|| format!("Surface operation {operation_id} has no target route"))?;
    let method = target
        .get("method")
        .and_then(Value::as_str)
        .ok_or_else(|| format!("Surface operation {operation_id} has no target method"))?;
    let target_method = Method::from_bytes(method.as_bytes()).map_err(|error| {
        format!("Surface operation {operation_id} has an invalid target method: {error}")
    })?;
    if ![
        Method::GET,
        Method::POST,
        Method::PATCH,
        Method::PUT,
        Method::DELETE,
    ]
    .contains(&target_method)
    {
        return Err(format!(
            "Surface operation {operation_id} uses an unsupported target method"
        ));
    }
    let target_path = target
        .get("path")
        .and_then(Value::as_str)
        .ok_or_else(|| format!("Surface operation {operation_id} has no target path"))?;
    validate_target_path(target_path)?;
    let capability = operation
        .get("x-lenso-capability")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| format!("Surface operation {operation_id} has no capability"))?;
    let idempotency = operation
        .get("x-lenso-idempotency")
        .and_then(Value::as_str)
        .filter(|value| matches!(*value, "idempotent" | "requires_key"))
        .ok_or_else(|| {
            format!("Surface operation {operation_id} has no valid idempotency policy")
        })?;
    let parameters = parse_parameters(document, path_item, operation, operation_id)?;
    let request_body = parse_request_body(document, operation, operation_id)?;
    let static_body = target.get("body").cloned();
    if static_body.as_ref().is_some_and(|body| !body.is_object()) {
        return Err(format!(
            "Surface operation {operation_id} target body must be a JSON object"
        ));
    }
    let response_schemas = parse_response_schemas(document, operation, operation_id)?;
    let surface_method = Method::from_bytes(surface_method.as_bytes()).map_err(|error| {
        format!("Surface operation {operation_id} has an invalid method: {error}")
    })?;

    Ok(ContractOperation {
        surface_method,
        target_method,
        target_path: target_path.to_owned(),
        capability: capability.to_owned(),
        idempotency: idempotency.to_owned(),
        display_name: operation
            .get("summary")
            .and_then(Value::as_str)
            .map(str::to_owned),
        parameters,
        request_body,
        static_body,
        response_schemas,
    })
}

fn parse_parameters(
    document: &Value,
    path_item: &Map<String, Value>,
    operation: &Map<String, Value>,
    operation_id: &str,
) -> Result<Vec<ContractParameter>, String> {
    let mut parameters = BTreeMap::new();
    for source in [path_item.get("parameters"), operation.get("parameters")]
        .into_iter()
        .flatten()
    {
        let items = source.as_array().ok_or_else(|| {
            format!("Surface operation {operation_id} parameters must be an array")
        })?;
        for item in items {
            let item = item.as_object().ok_or_else(|| {
                format!("Surface operation {operation_id} has an invalid parameter")
            })?;
            let name = item
                .get("name")
                .and_then(Value::as_str)
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| {
                    format!("Surface operation {operation_id} has an unnamed parameter")
                })?;
            let location = match item.get("in").and_then(Value::as_str) {
                Some("path") => ParameterLocation::Path,
                Some("query") => ParameterLocation::Query,
                _ => {
                    return Err(format!(
                        "Surface operation {operation_id} parameter {name} must be path or query"
                    ));
                }
            };
            let required = item
                .get("required")
                .and_then(Value::as_bool)
                .unwrap_or(false)
                || location == ParameterLocation::Path;
            let schema = compiled_schema(
                document,
                item.get("schema").ok_or_else(|| {
                    format!("Surface operation {operation_id} parameter {name} has no schema")
                })?,
            )?;
            parameters.insert(
                (parameter_location_name(location), name.to_owned()),
                ContractParameter {
                    name: name.to_owned(),
                    location,
                    required,
                    schema,
                },
            );
        }
    }
    Ok(parameters.into_values().collect())
}

fn parse_request_body(
    document: &Value,
    operation: &Map<String, Value>,
    operation_id: &str,
) -> Result<Option<ContractRequestBody>, String> {
    let Some(request_body) = operation.get("requestBody").and_then(Value::as_object) else {
        return Ok(None);
    };
    let schema = request_body
        .get("content")
        .and_then(|content| content.get("application/json"))
        .and_then(|content| content.get("schema"))
        .ok_or_else(|| {
            format!("Surface operation {operation_id} request body has no JSON schema")
        })?;
    let property_names = resolved_schema(document, schema)?
        .get("properties")
        .and_then(Value::as_object)
        .map(|properties| properties.keys().cloned().collect())
        .unwrap_or_default();
    Ok(Some(ContractRequestBody {
        schema: compiled_schema(document, schema)?,
        property_names,
    }))
}

fn parse_response_schemas(
    document: &Value,
    operation: &Map<String, Value>,
    operation_id: &str,
) -> Result<BTreeMap<String, Value>, String> {
    let responses = operation
        .get("responses")
        .and_then(Value::as_object)
        .ok_or_else(|| format!("Surface operation {operation_id} has no responses"))?;
    let mut schemas = BTreeMap::new();
    for (status, response) in responses {
        let Some(schema) = response
            .get("content")
            .and_then(|content| content.get("application/json"))
            .and_then(|content| content.get("schema"))
        else {
            continue;
        };
        schemas.insert(status.clone(), compiled_schema(document, schema)?);
    }
    Ok(schemas)
}

fn compiled_schema(document: &Value, schema: &Value) -> Result<Value, String> {
    let compiled = json!({
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "components": document.get("components").cloned().unwrap_or_else(|| json!({})),
        "allOf": [schema.clone()]
    });
    jsonschema::validator_for(&compiled)
        .map_err(|error| format!("Surface API contract schema is invalid: {error}"))?;
    Ok(compiled)
}

fn resolved_schema<'a>(document: &'a Value, schema: &'a Value) -> Result<&'a Value, String> {
    let Some(reference) = schema.get("$ref").and_then(Value::as_str) else {
        return Ok(schema);
    };
    let pointer = reference
        .strip_prefix('#')
        .ok_or_else(|| "Surface API contract schema references must be local".to_owned())?;
    document
        .pointer(pointer)
        .ok_or_else(|| format!("Surface API contract schema reference was not found: {reference}"))
}

fn build_body(
    operation: &ContractOperation,
    remaining: Map<String, Value>,
) -> Result<Option<Value>, String> {
    let mut body = operation
        .static_body
        .as_ref()
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    if let Some(request_body) = &operation.request_body {
        if let Some(unsupported) = remaining
            .keys()
            .find(|name| !request_body.property_names.contains(name.as_str()))
        {
            return Err(format!(
                "Surface operation input contains a field outside the committed contract: {unsupported}"
            ));
        }
        for (name, value) in remaining {
            if body.contains_key(&name) {
                return Err(format!(
                    "Surface operation input cannot override target-bound field: {name}"
                ));
            }
            body.insert(name, value);
        }
        let body = Value::Object(body);
        validate_instance(
            &request_body.schema,
            &body,
            "Surface operation request body",
        )?;
        return Ok(Some(body));
    }
    if let Some(name) = remaining.keys().next() {
        return Err(format!(
            "Surface operation input contains a field outside the committed contract: {name}"
        ));
    }
    if body.is_empty() {
        Ok(None)
    } else {
        Ok(Some(Value::Object(body)))
    }
}

fn validate_instance(schema: &Value, value: &Value, subject: &str) -> Result<(), String> {
    let validator = jsonschema::validator_for(schema)
        .map_err(|error| format!("Surface API contract schema is invalid: {error}"))?;
    if validator.is_valid(value) {
        Ok(())
    } else {
        Err(format!("{subject} does not match the committed contract"))
    }
}

fn validate_target_path(path: &str) -> Result<(), String> {
    if !path.starts_with('/')
        || path.contains('\\')
        || path.contains('?')
        || path.contains('#')
        || path.split('/').any(|segment| segment == "..")
        || matches!(path, "/system-plane" | "/system-plane/")
        || path.starts_with("/system-plane/")
    {
        return Err("Surface operation target path is unsafe".to_owned());
    }
    Ok(())
}

fn scalar_string(value: &Value) -> Option<String> {
    match value {
        Value::String(value) => Some(value.clone()),
        Value::Number(value) => Some(value.to_string()),
        Value::Bool(value) => Some(value.to_string()),
        _ => None,
    }
}

fn safe_path_segment(value: &str) -> bool {
    value
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || b"._~-".contains(&byte))
}

const fn parameter_location_name(location: ParameterLocation) -> &'static str {
    match location {
        ParameterLocation::Path => "path",
        ParameterLocation::Query => "query",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[allow(clippy::too_many_lines)]
    fn document() -> String {
        serde_json::to_string(&json!({
            "openapi": "3.1.0",
            "info": { "title": "Example API", "version": "v1" },
            "paths": {
                "/widgets": {
                    "get": {
                        "operationId": "example/http/GET:/widgets",
                        "summary": "List widgets",
                        "x-lenso-capability": "example.widgets.read",
                        "x-lenso-idempotency": "idempotent",
                        "x-lenso-connected-route": {
                            "method": "GET",
                            "path": "/modules/example/widgets"
                        },
                        "parameters": [
                            {
                                "name": "limit",
                                "in": "query",
                                "schema": { "type": "integer", "minimum": 1, "maximum": 100 }
                            }
                        ],
                        "responses": {
                            "200": {
                                "description": "Widget page",
                                "content": {
                                    "application/json": {
                                        "schema": { "$ref": "#/components/schemas/WidgetPage" }
                                    }
                                }
                            }
                        }
                    },
                    "post": {
                        "operationId": "example/http/POST:/widgets",
                        "summary": "Create widget",
                        "x-lenso-capability": "example.widgets.write",
                        "x-lenso-idempotency": "requires_key",
                        "x-lenso-connected-route": {
                            "method": "POST",
                            "path": "/modules/example/widgets"
                        },
                        "requestBody": {
                            "required": true,
                            "content": {
                                "application/json": {
                                    "schema": { "$ref": "#/components/schemas/CreateWidget" }
                                }
                            }
                        },
                        "responses": {
                            "201": {
                                "description": "Created widget",
                                "content": {
                                    "application/json": {
                                        "schema": { "$ref": "#/components/schemas/WidgetResult" }
                                    }
                                }
                            }
                        }
                    }
                },
                "/widgets/{widgetId}/archive": {
                    "post": {
                        "operationId": "example/http/POST:/widgets/{id}/archive",
                        "summary": "Archive widget",
                        "x-lenso-capability": "example.widgets.write",
                        "x-lenso-idempotency": "idempotent",
                        "x-lenso-connected-route": {
                            "method": "PATCH",
                            "path": "/modules/example/widgets/{widgetId}",
                            "body": { "status": "archived" }
                        },
                        "parameters": [
                            {
                                "name": "widgetId",
                                "in": "path",
                                "required": true,
                                "schema": { "type": "string", "minLength": 1 }
                            }
                        ],
                        "responses": {
                            "200": {
                                "description": "Archived widget",
                                "content": {
                                    "application/json": {
                                        "schema": { "$ref": "#/components/schemas/WidgetResult" }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            "components": {
                "schemas": {
                    "WidgetPage": {
                        "type": "object",
                        "required": ["records"],
                        "properties": { "records": { "type": "array" } }
                    },
                    "CreateWidget": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["name"],
                        "properties": { "name": { "type": "string", "minLength": 1 } }
                    },
                    "WidgetResult": {
                        "type": "object",
                        "required": ["widget"],
                        "properties": { "widget": { "type": "object" } }
                    }
                }
            }
        }))
        .expect("contract")
    }

    fn artifact() -> (SurfaceApiContractArtifact, String) {
        let document = document();
        let digest = document_digest(&document);
        (
            SurfaceApiContractArtifact {
                format: SURFACE_API_CONTRACT_FORMAT.to_owned(),
                document,
            },
            digest,
        )
    }

    #[test]
    fn resolves_and_maps_contract_operations_without_module_specific_code() {
        let (artifact, digest) = artifact();
        let list = resolve_operation(&artifact, &digest, "example/http/GET:/widgets")
            .expect("list operation");
        let list_call = build_target_call(&list, &json!({ "limit": 25 })).expect("list call");
        assert_eq!(list_call.path, "/modules/example/widgets");
        assert_eq!(list_call.query, vec![("limit".to_owned(), "25".to_owned())]);
        assert!(list_call.body.is_none());

        let create = resolve_operation(&artifact, &digest, "example/http/POST:/widgets")
            .expect("create operation");
        let create_call =
            build_target_call(&create, &json!({ "name": "First" })).expect("create call");
        assert_eq!(create_call.body, Some(json!({ "name": "First" })));
    }

    #[test]
    fn applies_only_contract_declared_path_and_static_body_bindings() {
        let (artifact, digest) = artifact();
        let operation = resolve_operation(
            &artifact,
            &digest,
            "example/http/POST:/widgets/{id}/archive",
        )
        .expect("archive operation");
        let call = build_target_call(&operation, &json!({ "widgetId": "widget_1" }))
            .expect("archive call");
        assert_eq!(call.path, "/modules/example/widgets/widget_1");
        assert_eq!(call.path_params, json!({ "widgetId": "widget_1" }));
        assert_eq!(call.body, Some(json!({ "status": "archived" })));
    }

    #[test]
    fn rejects_digest_mismatches_unknown_fields_and_invalid_outputs() {
        let (artifact, digest) = artifact();
        assert!(
            resolve_operation(
                &artifact,
                &format!("sha256:{}", "a".repeat(64)),
                "example/http/GET:/widgets"
            )
            .is_err()
        );

        let create = resolve_operation(&artifact, &digest, "example/http/POST:/widgets")
            .expect("create operation");
        assert!(
            build_target_call(&create, &json!({ "name": "First", "rawUrl": "/admin" })).is_err()
        );
        assert!(validate_output(&create, 201, &json!({ "wrong": true })).is_err());
        assert!(validate_output(&create, 201, &json!({ "widget": {} })).is_ok());
        assert!(validate_target_path("/system-plane/v1/status").is_err());
        assert!(validate_target_path("/v1/example/console/widgets").is_ok());
    }
}
