-- expect: MG010
SET lock_timeout = '5s';
ALTER TABLE users ADD COLUMN api_token uuid DEFAULT gen_random_uuid();
