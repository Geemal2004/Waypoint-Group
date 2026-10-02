CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE source_records (
    file varchar(80) NOT NULL,
    source_key varchar(160) NOT NULL,
    payload jsonb NOT NULL,
    PRIMARY KEY(file,source_key)
);
CREATE TABLE seed_imports (
    digest varchar(64) PRIMARY KEY, accepted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE vehicles ADD COLUMN km_per_l numeric(10,3) CHECK(km_per_l>0);
ALTER TABLE vehicles ADD COLUMN fuel_type varchar(32);
ALTER TABLE outlets ADD COLUMN dock_type varchar(32);
ALTER TABLE outlets ADD COLUMN mall_window varchar(80);
