-- expect: none
SET lock_timeout = '5s';
ALTER TABLE users ADD COLUMN status text NOT NULL DEFAULT 'active';
