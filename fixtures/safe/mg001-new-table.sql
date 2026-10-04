-- expect: none
SET lock_timeout = '5s';
CREATE TABLE accounts (id integer);
ALTER TABLE accounts ADD COLUMN owner text NOT NULL;
