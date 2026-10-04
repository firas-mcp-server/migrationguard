-- expect: MG001
SET lock_timeout = '5s';
ALTER TABLE users ADD COLUMN age integer NOT NULL;
