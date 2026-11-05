CREATE TABLE accounting_bases (
 company_id TEXT NOT NULL REFERENCES companies(id),
 period TEXT NOT NULL,
 version INTEGER NOT NULL CHECK(version > 0),
 fingerprint TEXT NOT NULL,
 statement_reference TEXT NOT NULL,
 snapshot_json TEXT NOT NULL,
 reconciled_at TEXT NOT NULL,
 reconciled_by TEXT NOT NULL REFERENCES users(id),
 PRIMARY KEY(company_id, period, version)
);

-- Storage contract for a future adapter. No current route or job writes these tables.
CREATE TABLE accounting_posting_approvals (
 id TEXT PRIMARY KEY,
 company_id TEXT NOT NULL,
 period TEXT NOT NULL,
 basis_version INTEGER NOT NULL,
 method TEXT NOT NULL CHECK(method IN ('per_entry','monthly_summary')),
 mapping_version TEXT NOT NULL,
 plan_fingerprint TEXT NOT NULL,
 approved_at TEXT NOT NULL,
 approved_by TEXT NOT NULL REFERENCES users(id),
 UNIQUE(company_id,id),
 UNIQUE(company_id,period,basis_version,method,mapping_version,plan_fingerprint),
 FOREIGN KEY(company_id,period,basis_version) REFERENCES accounting_bases(company_id,period,version)
);

CREATE TABLE accounting_transfers (
 id TEXT PRIMARY KEY,
 company_id TEXT NOT NULL,
 approval_id TEXT NOT NULL,
 provider TEXT NOT NULL,
 agreement_ref TEXT NOT NULL,
 idempotency_key TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','sending','uncertain','failed','transferred')),
 external_reference TEXT,
 failure_code TEXT,
 updated_at TEXT NOT NULL,
 CHECK(status <> 'transferred' OR external_reference IS NOT NULL),
 UNIQUE(company_id,provider,agreement_ref,id),
 UNIQUE(company_id,provider,agreement_ref,idempotency_key),
 FOREIGN KEY(company_id,approval_id) REFERENCES accounting_posting_approvals(company_id,id)
);

CREATE TABLE accounting_transfer_sources (
 company_id TEXT NOT NULL,
 provider TEXT NOT NULL,
 agreement_ref TEXT NOT NULL,
 source_id TEXT NOT NULL,
 transfer_id TEXT NOT NULL,
 PRIMARY KEY(company_id,provider,agreement_ref,source_id),
 FOREIGN KEY(company_id,provider,agreement_ref,transfer_id)
  REFERENCES accounting_transfers(company_id,provider,agreement_ref,id)
);
