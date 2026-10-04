-- expect: MG007
SET lock_timeout = '5s';
ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);
