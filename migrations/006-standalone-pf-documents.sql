-- Standalone supplier orders have no customer checkout/order row. Preserve that
-- distinction and attach their immutable documents directly to the PF record.
CREATE TABLE pf_documents(
 id TEXT PRIMARY KEY,
 company_id TEXT NOT NULL REFERENCES companies(id),
 namespace TEXT NOT NULL DEFAULT 'orders' CHECK(namespace='orders'),
 pf_order_id TEXT NOT NULL,
 type TEXT NOT NULL CHECK(type IN ('confirmation','basis','shipment','receipt')),
 version INTEGER NOT NULL,
 snapshot_json TEXT NOT NULL,
 pdf BLOB NOT NULL,
 created_at TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES users(id),
 FOREIGN KEY(namespace,pf_order_id) REFERENCES records(namespace,id),
 UNIQUE(pf_order_id,type,version)
);
CREATE INDEX pf_documents_order ON pf_documents(pf_order_id,created_at);
