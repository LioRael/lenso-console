use lenso_contract_authoring as lenso;

#[derive(serde::Deserialize)]
pub struct Nullable<T>(Option<T>);

impl<T: lenso::JsonSchema> lenso::JsonSchema for Nullable<T> {
    fn schema_name() -> std::borrow::Cow<'static, str> {
        format!("Nullable_{}", T::schema_name()).into()
    }
    fn schema_id() -> std::borrow::Cow<'static, str> {
        format!("Nullable<{}>", T::schema_id()).into()
    }
    fn json_schema(generator: &mut schemars::SchemaGenerator) -> schemars::Schema {
        <Option<T> as lenso::JsonSchema>::json_schema(generator)
    }
}

#[derive(lenso::JsonSchema, serde::Deserialize)]
#[schemars(deny_unknown_fields)]
pub struct CatalogRequest {}

#[derive(lenso::JsonSchema, serde::Deserialize)]
#[schemars(deny_unknown_fields)]
pub struct Entry {
    #[schemars(length(min = 1, max = 128))]
    pub id: String,
    #[schemars(length(min = 1, max = 128))]
    pub target_instance: String,
    #[schemars(length(min = 1, max = 128))]
    pub capability: String,
    #[schemars(length(min = 1, max = 64))]
    pub version: String,
    #[schemars(length(min = 1, max = 128))]
    pub operation: String,
    #[schemars(length(min = 2, max = 65_536))]
    pub input_schema_json: String,
    #[schemars(length(max = 4_096))]
    pub description: String,
    pub effect: Effect,
    pub requires_approval: bool,
}

#[derive(lenso::JsonSchema, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Effect {
    Read,
    Write,
}

#[derive(lenso::JsonSchema, serde::Deserialize)]
#[schemars(deny_unknown_fields)]
pub struct CatalogResponse {
    #[schemars(length(min = 1, max = 128))]
    pub deployment: String,
    #[schemars(length(min = 1, max = 128))]
    pub revision: String,
    #[schemars(length(max = 256))]
    pub entries: Vec<Entry>,
}

#[derive(lenso::DomainError)]
pub enum CatalogError {
    PermissionDenied,
    Unavailable,
}

#[derive(lenso::JsonSchema, serde::Deserialize)]
#[schemars(deny_unknown_fields)]
pub struct InvokeRequest {
    #[schemars(length(min = 1, max = 128))]
    pub entry_id: String,
    #[schemars(length(min = 1, max = 64))]
    pub version: String,
    #[schemars(length(min = 2, max = 262_144))]
    pub input_json: String,
    #[schemars(length(min = 1, max = 128))]
    pub idempotency_key: Nullable<String>,
    #[schemars(length(min = 1, max = 128))]
    pub expected_revision: Nullable<String>,
}

#[derive(lenso::JsonSchema, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InvocationState {
    PendingApproval,
    Ready,
    Executing,
    Succeeded,
    Failed,
    Unknown,
    Cancelled,
}

#[derive(lenso::JsonSchema, serde::Deserialize)]
#[schemars(deny_unknown_fields)]
pub struct InvokeResponse {
    #[schemars(length(min = 1, max = 128))]
    pub operation_id: Nullable<String>,
    pub state: InvocationState,
    #[schemars(length(min = 2, max = 1_048_576))]
    pub result_json: Nullable<String>,
    #[schemars(length(min = 1, max = 256))]
    pub receipt: Nullable<String>,
}

#[derive(lenso::DomainError)]
pub enum InvokeError {
    PermissionDenied,
    NotFound,
    InvalidInput,
    Conflict,
    Unavailable,
}

#[derive(lenso::JsonSchema, serde::Deserialize)]
#[schemars(deny_unknown_fields)]
pub struct StatusRequest {
    #[schemars(length(min = 1, max = 128))]
    pub operation_id: String,
}

#[derive(lenso::DomainError)]
pub enum StatusError {
    PermissionDenied,
    NotFound,
    Conflict,
    Unavailable,
}

#[lenso::capability(
    id = "lenso.management",
    major = 1,
    version = "1.0.0",
    portable = true,
    cross_lane_transfer = false
)]
pub trait Management {
    async fn catalog(
        &self,
        context: lenso::Ctx<'_>,
        request: CatalogRequest,
    ) -> Result<CatalogResponse, CatalogError>;
    async fn invoke(
        &self,
        context: lenso::Ctx<'_>,
        request: InvokeRequest,
    ) -> Result<InvokeResponse, InvokeError>;
    async fn status(
        &self,
        context: lenso::Ctx<'_>,
        request: StatusRequest,
    ) -> Result<InvokeResponse, StatusError>;
}
