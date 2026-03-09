use serde::{Deserialize, Serialize};

/// User type - corresponds to TypeScript UserData interface.
/// Serialized to JSON for cross-language communication.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub id: u64,
    pub name: String,
    pub company_email: String,
}
