-- Preserve order handoffs and offline action identities; a trip now groups their runs.
ALTER TABLE products ALTER COLUMN weight_kg TYPE numeric(24,12);
ALTER TABLE products ALTER COLUMN volume_m3 TYPE numeric(24,12);
CREATE TABLE routing_points (
    point_id varchar(64) PRIMARY KEY,
    longitude numeric(11,7) NOT NULL CHECK(longitude BETWEEN -180 AND 180),
    latitude numeric(10,7) NOT NULL CHECK(latitude BETWEEN -90 AND 90),
    provenance varchar(500) NOT NULL,
    supplemental boolean NOT NULL
);
CREATE TABLE planning_days (
    depot_code varchar(32) REFERENCES depots(code), day date REFERENCES operating_days(day),
    version integer NOT NULL DEFAULT 0 CHECK(version>=0), PRIMARY KEY(depot_code,day)
);
CREATE TABLE plan_revisions (
    id uuid PRIMARY KEY, depot_code varchar(32) NOT NULL, day date NOT NULL,
    version integer NOT NULL CHECK(version>0), request jsonb NOT NULL, validation jsonb NOT NULL,
    created_by varchar(64) NOT NULL REFERENCES accounts(id), published_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(depot_code,day,version), FOREIGN KEY(depot_code,day) REFERENCES planning_days(depot_code,day)
);
CREATE TABLE route_trips (
    id uuid PRIMARY KEY, plan_id uuid NOT NULL REFERENCES plan_revisions(id),
    vehicle_id varchar(64) NOT NULL REFERENCES vehicles(id), day date NOT NULL REFERENCES operating_days(day),
    trip integer NOT NULL CHECK(trip BETWEEN 1 AND 2), loader_id varchar(64) NOT NULL REFERENCES accounts(id),
    departure_at timestamptz NOT NULL, return_at timestamptz NOT NULL CHECK(return_at>departure_at),
    fuel_l numeric(12,6) NOT NULL CHECK(fuel_l>0), distance_km numeric(12,6) NOT NULL CHECK(distance_km>0),
    booklet_minutes numeric(12,3) NOT NULL CHECK(booklet_minutes>0),
    brand_code varchar(16) NOT NULL, district varchar(80) NOT NULL,
    geometry jsonb NOT NULL, routing_metadata jsonb NOT NULL,
    UNIQUE(vehicle_id,day,trip)
);
ALTER TABLE runs DROP CONSTRAINT runs_vehicle_id_day_trip_key;
ALTER TABLE runs ADD COLUMN route_trip_id uuid REFERENCES route_trips(id);
CREATE UNIQUE INDEX legacy_runs_trip ON runs(vehicle_id,day,trip) WHERE route_trip_id IS NULL;
CREATE TABLE route_stops (
    id uuid PRIMARY KEY, route_trip_id uuid NOT NULL REFERENCES route_trips(id),
    order_id uuid UNIQUE NOT NULL REFERENCES orders(id), run_id uuid UNIQUE NOT NULL REFERENCES runs(id),
    sequence integer NOT NULL CHECK(sequence>0), loading_sequence integer NOT NULL CHECK(loading_sequence>0),
    arrival_at timestamptz NOT NULL, service_start_at timestamptz NOT NULL, service_end_at timestamptz NOT NULL,
    travel_seconds numeric(12,3) NOT NULL CHECK(travel_seconds>=0), distance_km numeric(12,6) NOT NULL CHECK(distance_km>=0),
    service_minutes numeric(12,3) NOT NULL CHECK(service_minutes>0),
    CHECK(service_start_at>=arrival_at AND service_end_at>service_start_at), UNIQUE(route_trip_id,sequence)
);
ALTER TABLE orders ADD COLUMN source_ref varchar(160);
ALTER TABLE orders ADD COLUMN scenario varchar(32);
ALTER TABLE orders ADD COLUMN source_weight_kg numeric(12,3) CHECK(source_weight_kg>0);
ALTER TABLE orders ADD COLUMN source_volume_m3 numeric(12,6) CHECK(source_volume_m3>0);
ALTER TABLE orders ADD COLUMN days_since_last_served integer CHECK(days_since_last_served>=0);
ALTER TABLE orders ADD COLUMN deferred_yesterday boolean NOT NULL DEFAULT false;
ALTER TABLE vehicles ADD COLUMN cold_capability_source varchar(500);
CREATE TABLE scenario_fleet (
    scenario varchar(32) NOT NULL, vehicle_id varchar(64) REFERENCES vehicles(id),
    status varchar(32) NOT NULL CHECK(status IN ('available','in_workshop')), PRIMARY KEY(scenario,vehicle_id)
);
CREATE INDEX route_stops_trip ON route_stops(route_trip_id,sequence);
