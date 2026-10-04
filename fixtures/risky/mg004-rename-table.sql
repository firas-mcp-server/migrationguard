-- expect: MG004
SET lock_timeout = '5s';
ALTER TABLE users RENAME TO people;
