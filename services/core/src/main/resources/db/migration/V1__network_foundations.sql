CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE brands (
    code varchar(16) PRIMARY KEY,
    name varchar(100) NOT NULL,
    outlet_count integer NOT NULL CHECK (outlet_count > 0)
);

CREATE TABLE depots (
    code varchar(32) PRIMARY KEY,
    name varchar(120) NOT NULL
);

-- Brief-level reference data only. Shared dataset imports follow in later migrations.
INSERT INTO brands VALUES
    ('FRESH', 'Waypoint Fresh', 80),
    ('STYLE', 'Waypoint Style', 25),
    ('TECH', 'Waypoint Tech', 15);
INSERT INTO depots VALUES
    ('PELIYAGODA', 'Peliyagoda Distribution Centre'),
    ('KANDY', 'Kandy Regional Hub');
