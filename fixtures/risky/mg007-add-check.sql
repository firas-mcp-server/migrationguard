-- expect: MG007
SET lock_timeout = '5s';
ALTER TABLE users ADD CONSTRAINT age_positive CHECK (age > 0);
