-- Extend the supported document types without changing historical migration checksums.
CREATE TABLE documents_v5(
 id TEXT PRIMARY KEY,
 company_id TEXT NOT NULL REFERENCES companies(id),
 order_id TEXT NOT NULL REFERENCES orders(id),
 type TEXT NOT NULL CHECK(type IN ('confirmation','basis','shipment','receipt')),
 version INTEGER NOT NULL,
 snapshot_json TEXT NOT NULL,
 pdf BLOB,
 created_at TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES users(id),
 UNIQUE(order_id,type,version)
);
INSERT INTO documents_v5 SELECT id,company_id,order_id,type,version,snapshot_json,pdf,created_at,created_by FROM documents;
DROP TABLE documents;
ALTER TABLE documents_v5 RENAME TO documents;
