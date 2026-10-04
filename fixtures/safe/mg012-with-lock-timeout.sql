-- expect: none
SET lock_timeout = '5s';
ALTER TABLE users ADD COLUMN nickname text;
