use crate::types::User;

pub mod types;

pub fn create_user(id: u32, name: String, company_email: String) -> User {
    User {
        id,
        name,
        company_email,
    }
}

pub fn get_user_name(user: &User) -> &str {
    &user.name
}
