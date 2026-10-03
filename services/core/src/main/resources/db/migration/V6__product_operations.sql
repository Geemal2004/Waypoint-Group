-- Product commands preserve the operational states and immutable proof contract.
CREATE SEQUENCE order_reference_seq START WITH 1001;
ALTER TABLE orders ADD COLUMN reference varchar(32) UNIQUE NOT NULL DEFAULT ('WP-' || lpad(nextval('order_reference_seq')::text,6,'0'));
ALTER TABLE orders ADD COLUMN confirmation_required boolean NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN confirmed_at timestamptz;
ALTER TABLE orders ADD COLUMN cancelled_at timestamptz;
ALTER TABLE orders ADD COLUMN rescheduled_from uuid REFERENCES orders(id);
ALTER TABLE orders DROP CONSTRAINT orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK(status IN ('RECEIVED','SCHEDULED','LOADING','RELEASED','IN_TRANSIT','ARRIVED','DELIVERED','RECEIVED_AT_STORE','DEFERRED','CANCELLED'));
ALTER TABLE accounts ADD COLUMN phone varchar(32);
ALTER TABLE accounts ADD COLUMN administration_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE accounts ADD COLUMN network_read_all boolean NOT NULL DEFAULT false;
ALTER TABLE accounts ADD COLUMN revision integer NOT NULL DEFAULT 0;
ALTER TABLE outlets ADD COLUMN revision integer NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN revision integer NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN catalog_enabled boolean NOT NULL DEFAULT false;
UPDATE products SET catalog_enabled=true WHERE demo;
ALTER TABLE products ADD COLUMN provenance varchar(500) NOT NULL DEFAULT 'Supplied source record';
UPDATE products SET provenance='Supplemental judge catalogue; not verified source SKUs' WHERE demo;
ALTER TABLE vehicles ADD COLUMN revision integer NOT NULL DEFAULT 0;
ALTER TABLE depots ADD COLUMN revision integer NOT NULL DEFAULT 0;
ALTER TABLE outlets ADD COLUMN record_provenance varchar(500) NOT NULL DEFAULT 'Supplied source record';
ALTER TABLE vehicles ADD COLUMN record_provenance varchar(500) NOT NULL DEFAULT 'Supplied source record';
ALTER TABLE depots ADD COLUMN record_provenance varchar(500) NOT NULL DEFAULT 'Supplied challenge depot';
CREATE TABLE operational_audit (
 id bigserial PRIMARY KEY, account_id varchar(64) NOT NULL REFERENCES accounts(id),
 entity_type varchar(32) NOT NULL, entity_id varchar(80) NOT NULL,
 event varchar(64) NOT NULL, reason varchar(500) NOT NULL,
 changes jsonb NOT NULL, accepted_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE issue_messages (
 id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES orders(id),
 account_id varchar(64) NOT NULL REFERENCES accounts(id),
 command_id uuid UNIQUE NOT NULL, category varchar(32) NOT NULL CHECK(category IN ('GENERAL','DELAY','ACCESS','DAMAGE','TEMPERATURE','SHORTAGE')),
 body varchar(1000) NOT NULL CHECK(length(trim(body))>0),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_order ON issue_messages(order_id,created_at);
CREATE TABLE order_drafts (
 id uuid PRIMARY KEY, account_id varchar(64) NOT NULL REFERENCES accounts(id),
 outlet_id varchar(64) NOT NULL REFERENCES outlets(id), day date NOT NULL,
 items jsonb NOT NULL, version integer NOT NULL DEFAULT 0,
 submitted_order_id uuid REFERENCES orders(id), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE order_commands (
 command_id uuid PRIMARY KEY, account_id varchar(64) NOT NULL REFERENCES accounts(id),
 order_id uuid NOT NULL REFERENCES orders(id), operation varchar(32) NOT NULL,
 payload_digest varchar(64) NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
-- Source/production accounts receive no new privilege implicitly. Judge access is explicit.
UPDATE accounts SET administration_enabled=true,network_read_all=true WHERE id='DEMO-DISPATCHER' AND demo;
