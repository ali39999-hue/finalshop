export interface UserRecord {
  id: string;
  email: string;
  name: string | null;
  createdAt: Date;
}

export interface UserRepository {
  /** Bootstrap-only: real auth provider integration replaces this (W1 open item). */
  create(input: { email: string; name?: string }): Promise<UserRecord>;
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
}
