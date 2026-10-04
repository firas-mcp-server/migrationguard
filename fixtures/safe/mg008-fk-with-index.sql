-- expect: none
SET lock_timeout = '5s';
CREATE INDEX CONCURRENTLY idx_posts_author_id ON posts (author_id);
ALTER TABLE posts ADD CONSTRAINT fk_posts_author FOREIGN KEY (author_id) REFERENCES users (id) NOT VALID;
