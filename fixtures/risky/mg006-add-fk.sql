-- expect: MG006
SET lock_timeout = '5s';
CREATE INDEX CONCURRENTLY idx_orders_user_id ON orders (user_id);
ALTER TABLE orders ADD CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users (id);
