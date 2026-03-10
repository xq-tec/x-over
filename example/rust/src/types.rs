use serde::{Deserialize, Serialize};

/// User type - corresponds to TypeScript UserData interface.
/// Serialized to JSON for cross-language communication.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub id: u32,
    pub name: String,
    pub company_email: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanyData {
    pub id: u32,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "command", rename_all = "camelCase")]
pub enum PlayerCommand {
    Start,
    Stop,
    SeekToStart,
    SeekToTime { time: f64 },
}
