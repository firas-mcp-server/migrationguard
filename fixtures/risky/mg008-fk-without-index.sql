-- expect: MG008
SET lock_timeout = '5s';
ALTER TABLE posts ADD CONSTRAINT fk_posts_author FOREIGN KEY (author_id) REFERENCES users (id) NOT VALID;
