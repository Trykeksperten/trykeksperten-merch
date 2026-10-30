INSERT INTO users(id,company_id,username,password_hash,role,enabled,created_at) VALUES('system','smerch','system-pf','', 'production',0,'1970-01-01T00:00:00Z');
CREATE UNIQUE INDEX file_order_version ON files(order_id,version);
CREATE INDEX proofs_order_version ON proofs(order_id,version);
CREATE INDEX shipments_order ON shipments(order_id);
CREATE INDEX quote_customer ON quotes(company_id,customer_id);
