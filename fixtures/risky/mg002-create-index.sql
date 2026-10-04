-- expect: MG002
SET lock_timeout = '5s';
CREATE INDEX idx_users_email ON users (email);
