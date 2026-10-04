-- expect: MG005
SET lock_timeout = '5s';
ALTER TABLE users ALTER COLUMN age TYPE bigint;
