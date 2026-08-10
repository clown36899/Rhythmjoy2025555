-- Cafe24 production MySQL does not provide JSON_UNQUOTE/JSON_EXTRACT.
-- The idempotent data migration is implemented by
-- scripts/migrate-push-subscription-record-keys.mjs, which parses data_json in
-- Node.js and performs the canonical insert + legacy delete in one transaction.
SELECT 1;
