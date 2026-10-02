CREATE TABLE processed_sync_actions (
    action_id uuid PRIMARY KEY,
    account_id varchar(64) NOT NULL REFERENCES accounts(id),
    device_id varchar(80) NOT NULL,
    order_id uuid NOT NULL REFERENCES orders(id),
    expected_version integer NOT NULL CHECK(expected_version>=0),
    payload_digest varchar(64) NOT NULL,
    captured_at timestamptz NOT NULL,
    accepted_at timestamptz NOT NULL DEFAULT now(),
    outcome varchar(16) NOT NULL CHECK(outcome IN ('accepted','rejected','conflict')),
    result jsonb NOT NULL
);
CREATE TABLE sync_conflicts (
    id uuid PRIMARY KEY, action_id uuid UNIQUE NOT NULL REFERENCES processed_sync_actions(action_id),
    order_id uuid NOT NULL REFERENCES orders(id),
    delivery_payload jsonb NOT NULL,
    evidence_type varchar(32) NOT NULL, evidence bytea NOT NULL CHECK(octet_length(evidence) BETWEEN 1 AND 5242880),
    captured_at timestamptz NOT NULL, accepted_at timestamptz NOT NULL DEFAULT now(),
    state varchar(16) NOT NULL CHECK(state IN ('OPEN','ACCEPTED','REJECTED')),
    resolved_by varchar(64) REFERENCES accounts(id), resolution_reason varchar(500), resolved_at timestamptz,
    CHECK ((state='OPEN' AND resolved_by IS NULL) OR (state<>'OPEN' AND resolved_by IS NOT NULL AND resolution_reason IS NOT NULL))
);
CREATE INDEX sync_actions_account ON processed_sync_actions(account_id,accepted_at);
CREATE INDEX conflicts_order_state ON sync_conflicts(order_id,state);
