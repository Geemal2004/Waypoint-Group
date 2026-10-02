-- Explicitly destructive to DEMO ORDERS ONLY. Run on the intended demo database.
-- Preserves shared network, accounts, source imports and all non-demo orders.
BEGIN;
SELECT pg_advisory_xact_lock(73429011);
CREATE TEMP TABLE reset_order_ids ON COMMIT DROP AS SELECT id FROM orders WHERE demo=true;
DELETE FROM sync_conflicts WHERE order_id IN (SELECT id FROM reset_order_ids);
DELETE FROM processed_sync_actions WHERE order_id IN (SELECT id FROM reset_order_ids);
DELETE FROM audit_events WHERE order_id IN (SELECT id FROM reset_order_ids);
DELETE FROM receipts WHERE order_id IN (SELECT id FROM reset_order_ids);
DELETE FROM proofs WHERE order_id IN (SELECT id FROM reset_order_ids);
DELETE FROM loading_issues WHERE run_id IN (SELECT id FROM runs WHERE order_id IN (SELECT id FROM reset_order_ids));
DELETE FROM deferrals WHERE order_id IN (SELECT id FROM reset_order_ids);
DELETE FROM runs WHERE order_id IN (SELECT id FROM reset_order_ids);
DELETE FROM order_lines WHERE order_id IN (SELECT id FROM reset_order_ids);
DELETE FROM orders WHERE id IN (SELECT id FROM reset_order_ids);
COMMIT;
-- Restart core after this explicit reset to restore its six idempotent fixture orders.
