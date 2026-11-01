-- A checkout can contain several supplier orders. A PF-originated document
-- belongs to its original supplier order, not implicitly to every sibling.
CREATE TABLE pf_document_bindings(
 document_id TEXT PRIMARY KEY REFERENCES documents(id),
 namespace TEXT NOT NULL DEFAULT 'orders' CHECK(namespace='orders'),
 pf_order_id TEXT NOT NULL,
 FOREIGN KEY(namespace,pf_order_id) REFERENCES records(namespace,id)
);
CREATE INDEX pf_document_bindings_order ON pf_document_bindings(pf_order_id);
