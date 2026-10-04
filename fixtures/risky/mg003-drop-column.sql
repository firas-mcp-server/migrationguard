-- expect: MG003
SET lock_timeout = '5s';
ALTER TABLE users DROP COLUMN legacy_flag;
