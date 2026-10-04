-- expect: MG011
SET lock_timeout = '5s';
ALTER TABLE users ALTER COLUMN email SET NOT NULL;
