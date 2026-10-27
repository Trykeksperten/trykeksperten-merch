# PF e-proof API — appendix 1.2.1

Endpoint for PF: POST https://smerch.dk/api/pf-eproof, Content-Type application/json, dedicated Basic Auth. No browser session is needed on this callback. Staff dispatch requires an authenticated Smerch session and the existing admin CSRF/header checks.

Configuration (server secrets, never frontend):

- PF_EPROOF_ENABLED=1 (leave unset until PF connection is arranged)
- PF_EPROOF_MODE=test or live; must match the order's original Gateway Header.isTest
- PF_EPROOF_EXPECTED_SENDER_ID: exact inbound SenderId agreed with PF
- PF_EPROOF_CALLBACK_USERNAME / PF_EPROOF_CALLBACK_PASSWORD: new dedicated inbound credentials; password at least 32 characters
- PF_EPROOF_USERNAME / PF_EPROOF_PASSWORD: outbound credentials supplied/confirmed by PF
- PF_GATEWAY_SENDER_ID: our account's sender ID

Do not assume inbound SenderId equals our Gateway sender ID. PF must confirm this and the credentials. No production secrets or enablement are committed.

Flow: receive and validate PF JSON, match both order references and SKUs, store the actual proof locally, staff reviews and sends existing customer link, customer decides in Smerch, staff reviews and explicitly sends the decision via API. No customer action, scheduler or callback sends an approval automatically. Payment must still be active before an approval can be sent. No capture occurs here.

One callback may contain several files/configurations for the same order. The files are presented together in a PDF and every configuration reference is retained and sent separately. New artwork entered by staff applies to the rejected configurations. Customer attachments are not silently dropped: staff must supply artwork links if attachments exist. Original supplier URLs are echoed only to PF, never fetched server-side. Old mail/manual proofs stay on the existing manual path; they cannot be auto-converted into API approvals.

HTTP success is recorded as delivery, not as PF business acceptance or release of production. The manual does not specify the business acknowledgement. The existing staff confirmation of PF acceptance remains available after delivery. Obtain the response contract from PF before automating this confirmation.

Requests and IDs are saved before network I/O. A timeout, unknown response, partial multi-configuration delivery, or restart leaves dispatch blocked for manual reconciliation. No automatic retry. Inspect each saved request ID and compare with PF before resolving. Received duplicates do not create new versions. The deployment uses the existing single-writer order store/locking; do not run independent application writers against the JSON store.

Before enabling: arrange PF callback registration, confirm inbound SenderId and test credentials, send a PF test proof and verify customer review, staff gate, rejection/new artwork and approval with PF. Then configure live mode separately. Existing pilot order 7886901 must not be resent. Existing mailbox import remains as fallback; avoid enabling both PF push and mailbox auto-publication until the end-to-end test is complete.
