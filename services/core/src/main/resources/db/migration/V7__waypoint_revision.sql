-- Coordinate overrides are operational projections; supplied raw records stay immutable.
ALTER TABLE routing_points ADD COLUMN revision integer NOT NULL DEFAULT 0 CHECK(revision>=0);
