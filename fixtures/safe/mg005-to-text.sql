-- expect: none
SET lock_timeout = '5s';
ALTER TABLE users ALTER COLUMN bio TYPE text;
