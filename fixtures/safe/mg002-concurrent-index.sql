-- expect: none
SET lock_timeout = '5s';
CREATE INDEX CONCURRENTLY idx_users_email ON users (email);
