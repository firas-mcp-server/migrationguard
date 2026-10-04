-- expect: none
SET lock_timeout = '5s';
ALTER TABLE users ADD CONSTRAINT age_positive CHECK (age > 0) NOT VALID;
ALTER TABLE users VALIDATE CONSTRAINT age_positive;
CREATE UNIQUE INDEX CONCURRENTLY users_email_idx ON users (email);
ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE USING INDEX users_email_idx;
