-- Explicitly resets DEMO and imported S1 JUDGE orders only on the intended demo database.
-- Preserves shared network, accounts, raw source records and unrelated operational orders.
BEGIN;
SELECT pg_advisory_xact_lock(73429011);
CREATE TEMP TABLE reset_order_ids ON COMMIT DROP AS SELECT id FROM orders WHERE demo=true OR scenario='S1';
CREATE TEMP TABLE reset_trip_ids ON COMMIT DROP AS SELECT DISTINCT route_trip_id id FROM runs WHERE order_id IN (SELECT id FROM reset_order_ids) AND route_trip_id IS NOT NULL;
DELETE FROM issue_messages WHERE order_id IN (SELECT id FROM reset_order_ids);
DELETE FROM order_commands WHERE order_id IN (SELECT id FROM reset_order_ids);
DELETE FROM order_drafts WHERE submitted_order_id IN (SELECT id FROM reset_order_ids) OR account_id IN (SELECT id FROM accounts WHERE demo);
DELETE FROM route_stops WHERE order_id IN (SELECT id FROM reset_order_ids);
DELETE FROM sync_conflicts WHERE order_id IN (SELECT id FROM reset_order_ids);
DELETE FROM processed_sync_actions WHERE order_id IN (SELECT id FROM reset_order_ids);
DELETE FROM audit_events WHERE order_id IN (SELECT id FROM reset_order_ids);
DELETE FROM receipts WHERE order_id IN (SELECT id FROM reset_order_ids);
DELETE FROM proofs WHERE order_id IN (SELECT id FROM reset_order_ids);
DELETE FROM loading_issues WHERE run_id IN (SELECT id FROM runs WHERE order_id IN (SELECT id FROM reset_order_ids));
DELETE FROM deferrals WHERE order_id IN (SELECT id FROM reset_order_ids);
DELETE FROM runs WHERE order_id IN (SELECT id FROM reset_order_ids);
DELETE FROM route_trips WHERE id IN (SELECT id FROM reset_trip_ids);
DELETE FROM plan_revisions p WHERE NOT EXISTS (SELECT 1 FROM route_trips t WHERE t.plan_id=p.id)
 AND EXISTS (SELECT 1 FROM jsonb_path_query(p.request,'$.trips[*].stops[*].orderId') j WHERE (j #>> '{}')::uuid IN (SELECT id FROM reset_order_ids))
 AND NOT EXISTS (SELECT 1 FROM jsonb_path_query(p.request,'$.trips[*].stops[*].orderId') j WHERE (j #>> '{}')::uuid NOT IN (SELECT id FROM reset_order_ids));
DELETE FROM plan_revisions p WHERE NOT EXISTS (SELECT 1 FROM route_trips t WHERE t.plan_id=p.id)
 AND jsonb_array_length(p.request->'trips')=0
 AND EXISTS (SELECT 1 FROM jsonb_path_query(p.request,'$.deferred[*].orderId') j WHERE (j #>> '{}')::uuid IN (SELECT id FROM reset_order_ids))
 AND NOT EXISTS (SELECT 1 FROM jsonb_path_query(p.request,'$.deferred[*].orderId') j WHERE (j #>> '{}')::uuid NOT IN (SELECT id FROM reset_order_ids));
DELETE FROM planning_days d WHERE NOT EXISTS (SELECT 1 FROM plan_revisions p WHERE p.depot_code=d.depot_code AND p.day=d.day);
DELETE FROM order_lines WHERE order_id IN (SELECT id FROM reset_order_ids);
DELETE FROM orders WHERE id IN (SELECT id FROM reset_order_ids);
COMMIT;
-- Restart core to restore six legacy fixtures and the private S1 orders if prepared.
