use lenso_contract_authoring as lenso;

#[derive(lenso::JsonSchema, serde::Deserialize)]
#[schemars(deny_unknown_fields)]
pub struct ReadIntentRequest {
    #[schemars(length(min = 1, max = 128))]
    pub operation_id: String,
}
#[derive(lenso::JsonSchema, serde::Deserialize)]
#[schemars(deny_unknown_fields)]
pub struct ReadIntentResponse {
    pub operation_id: String,
    pub requester: String,
    pub deployment: String,
    pub entry_id: String,
    pub target_instance: String,
    pub capability: String,
    pub version: String,
    pub operation: String,
    pub description: String,
    #[schemars(length(min = 64, max = 64))]
    pub intent_digest: String,
    pub expires_at: String,
    #[schemars(length(min = 2, max = 262_144))]
    pub parameters_json: String,
    pub status: IntentStatus,
}
#[derive(lenso::JsonSchema, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IntentStatus {
    Pending,
    Approved,
    Rejected,
    Cancelled,
    Expired,
}
#[derive(lenso::JsonSchema, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Decision {
    Approved,
    Rejected,
}
#[derive(lenso::JsonSchema, serde::Deserialize)]
#[schemars(deny_unknown_fields)]
pub struct DecideRequest {
    #[schemars(length(min = 1, max = 128))]
    pub operation_id: String,
    #[schemars(length(min = 64, max = 64))]
    pub intent_digest: String,
    pub decision: Decision,
}
#[derive(lenso::JsonSchema, serde::Deserialize)]
#[schemars(deny_unknown_fields)]
pub struct DecideResponse {
    pub operation_id: String,
    pub status: IntentStatus,
}
#[derive(lenso::DomainError)]
pub enum ReadIntentError {
    PermissionDenied,
    NotFound,
    Conflict,
    Unavailable,
}
#[derive(lenso::DomainError)]
pub enum DecideError {
    PermissionDenied,
    NotFound,
    Conflict,
    Unavailable,
}
#[lenso::capability(
    id = "lenso.management-human",
    major = 1,
    version = "1.0.0",
    portable = true,
    cross_lane_transfer = false
)]
pub trait ManagementHuman {
    async fn read_intent(
        &self,
        context: lenso::Ctx<'_>,
        request: ReadIntentRequest,
    ) -> Result<ReadIntentResponse, ReadIntentError>;
    async fn decide(
        &self,
        context: lenso::Ctx<'_>,
        request: DecideRequest,
    ) -> Result<DecideResponse, DecideError>;
}
