/**
 * User type - corresponds to Rust User struct.
 * Deserialized from JSON produced by Rust.
 */
export interface UserData {
  id: number;
  name: string;
  companyEmail: string;
}

// Example usage creating referenceable locations for UserData
export function createUser(id: number, name: string, companyEmail: string): UserData {
  return { id, name, companyEmail };
}

export function getUserName(user: UserData): string {
  return user.name;
}
