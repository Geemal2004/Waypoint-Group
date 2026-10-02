CREATE TABLE accounts (
    id varchar(64) PRIMARY KEY, username varchar(80) UNIQUE NOT NULL,
    display_name varchar(120) NOT NULL, password_hash varchar(100) NOT NULL,
    role varchar(24) NOT NULL CHECK (role IN ('MANAGER','DISPATCHER','LOADER','DRIVER')),
    depot_code varchar(32) REFERENCES depots(code), demo boolean NOT NULL DEFAULT false,
    enabled boolean NOT NULL DEFAULT true
);
CREATE TABLE outlets (
    id varchar(64) PRIMARY KEY, name varchar(120) NOT NULL,
    brand_code varchar(16) NOT NULL REFERENCES brands(code), depot_code varchar(32) NOT NULL REFERENCES depots(code),
    district varchar(80) NOT NULL, access varchar(16) NOT NULL CHECK (access IN ('ANY','VAN_ONLY')),
    window_start time NOT NULL, window_end time NOT NULL CHECK (window_end > window_start),
    demo boolean NOT NULL DEFAULT false
);
CREATE TABLE account_outlets (
    account_id varchar(64) REFERENCES accounts(id), outlet_id varchar(64) REFERENCES outlets(id),
    PRIMARY KEY(account_id,outlet_id)
);
CREATE TABLE products (
    id varchar(64) PRIMARY KEY, name varchar(160) NOT NULL, brand_code varchar(16) NOT NULL REFERENCES brands(code),
    unit varchar(32) NOT NULL, weight_kg numeric(12,3) NOT NULL CHECK(weight_kg > 0),
    volume_m3 numeric(12,6) NOT NULL CHECK(volume_m3 > 0),
    temperature varchar(16) NOT NULL CHECK(temperature IN ('AMBIENT','CHILLED','FROZEN')),
    min_c numeric(5,2), max_c numeric(5,2), handling varchar(200) NOT NULL,
    demo boolean NOT NULL DEFAULT false,
    CHECK ((temperature='AMBIENT' AND min_c IS NULL AND max_c IS NULL) OR (min_c IS NOT NULL AND max_c IS NOT NULL AND max_c >= min_c))
);
CREATE TABLE operating_days (day date PRIMARY KEY, demo boolean NOT NULL DEFAULT false);
CREATE TABLE vehicles (
    id varchar(64) PRIMARY KEY, name varchar(120) NOT NULL, depot_code varchar(32) NOT NULL REFERENCES depots(code),
    kind varchar(16) NOT NULL CHECK(kind IN ('VAN','TRUCK')), refrigerated boolean NOT NULL,
    min_c numeric(5,2), max_c numeric(5,2), weight_kg numeric(12,3) NOT NULL CHECK(weight_kg>0),
    volume_m3 numeric(12,6) NOT NULL CHECK(volume_m3>0), weekly_fuel_l numeric(12,3) NOT NULL CHECK(weekly_fuel_l>0),
    driver_id varchar(64) NOT NULL REFERENCES accounts(id), available boolean NOT NULL DEFAULT true,
    demo boolean NOT NULL DEFAULT false,
    CHECK ((NOT refrigerated AND min_c IS NULL AND max_c IS NULL) OR (refrigerated AND ((min_c IS NULL AND max_c IS NULL) OR (min_c IS NOT NULL AND max_c >= min_c))))
);
CREATE TABLE orders (
    id uuid PRIMARY KEY, outlet_id varchar(64) NOT NULL REFERENCES outlets(id), created_by varchar(64) NOT NULL REFERENCES accounts(id),
    day date NOT NULL REFERENCES operating_days(day), temperature varchar(16) NOT NULL,
    status varchar(24) NOT NULL CHECK(status IN ('RECEIVED','SCHEDULED','LOADING','RELEASED','IN_TRANSIT','ARRIVED','DELIVERED','RECEIVED_AT_STORE','DEFERRED')),
    version integer NOT NULL DEFAULT 0 CHECK(version>=0), demo boolean NOT NULL DEFAULT false,
    schedule_reason varchar(500) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE order_lines (
    id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES orders(id), product_id varchar(64) NOT NULL REFERENCES products(id),
    ordered integer NOT NULL CHECK(ordered>0), loaded integer CHECK(loaded BETWEEN 0 AND ordered),
    delivered integer CHECK(delivered>=0 AND delivered<=loaded), received integer CHECK(received>=0 AND received<=delivered),
    UNIQUE(order_id,product_id), CHECK(delivered IS NULL OR loaded IS NOT NULL), CHECK(received IS NULL OR delivered IS NOT NULL)
);
CREATE TABLE runs (
    id uuid PRIMARY KEY, order_id uuid UNIQUE NOT NULL REFERENCES orders(id), vehicle_id varchar(64) NOT NULL REFERENCES vehicles(id),
    day date NOT NULL REFERENCES operating_days(day), trip integer NOT NULL CHECK(trip BETWEEN 1 AND 2),
    loader_id varchar(64) NOT NULL REFERENCES accounts(id), plan_version integer NOT NULL CHECK(plan_version>0),
    departure_at timestamptz NOT NULL, return_at timestamptz NOT NULL CHECK(return_at>departure_at),
    estimated_fuel_l numeric(12,3) NOT NULL CHECK(estimated_fuel_l>0), override_reason varchar(500) NOT NULL,
    partial_approved_by varchar(64) REFERENCES accounts(id), partial_reason varchar(500),
    acknowledged_loader boolean NOT NULL DEFAULT false, acknowledged_driver boolean NOT NULL DEFAULT false,
    released_at timestamptz, started_at timestamptz, arrived_at timestamptz,
    UNIQUE(vehicle_id,day,trip)
);
CREATE TABLE loading_issues (
    id uuid PRIMARY KEY, line_id uuid NOT NULL REFERENCES order_lines(id), run_id uuid NOT NULL REFERENCES runs(id),
    quantity integer NOT NULL CHECK(quantity>0), reason varchar(24) NOT NULL CHECK(reason IN ('SHORTAGE','DAMAGE')),
    created_by varchar(64) NOT NULL REFERENCES accounts(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE proofs (
    id uuid PRIMARY KEY, order_id uuid UNIQUE NOT NULL REFERENCES orders(id), account_id varchar(64) NOT NULL REFERENCES accounts(id),
    content_type varchar(32) NOT NULL, bytes bytea NOT NULL CHECK(octet_length(bytes) BETWEEN 1 AND 5242880),
    captured_at timestamptz NOT NULL, accepted_at timestamptz NOT NULL DEFAULT now(), notes varchar(500) NOT NULL
);
CREATE TABLE receipts (
    id uuid PRIMARY KEY, order_id uuid UNIQUE NOT NULL REFERENCES orders(id), account_id varchar(64) NOT NULL REFERENCES accounts(id),
    issue varchar(500) NOT NULL, accepted_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE deferrals (
    id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES orders(id), owner_id varchar(64) NOT NULL REFERENCES accounts(id),
    reason varchar(500) NOT NULL, decision_at timestamptz NOT NULL DEFAULT now(),
    next_day date NOT NULL REFERENCES operating_days(day), consecutive_skips integer NOT NULL CHECK(consecutive_skips>0)
);
CREATE TABLE audit_events (
    id bigserial PRIMARY KEY, account_id varchar(64) NOT NULL REFERENCES accounts(id), order_id uuid NOT NULL REFERENCES orders(id),
    event varchar(64) NOT NULL, details varchar(1000) NOT NULL, accepted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_outlet_day ON orders(outlet_id,day);
CREATE INDEX orders_status ON orders(status);
CREATE INDEX audit_order ON audit_events(order_id,accepted_at);
CREATE INDEX loading_run ON loading_issues(run_id);
CREATE INDEX runs_vehicle_day ON runs(vehicle_id,day);
