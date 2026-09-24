-- V5 declared the country codes as char(2). Postgres reports that as `bpchar`
-- and pads values to a fixed width, which both fails Hibernate's validation
-- against the varchar(2) mapping and makes equality comparisons depend on
-- padding. varchar(2) with the upper-case check is the honest type here.
ALTER TABLE geo_rules ALTER COLUMN country_code TYPE varchar(2);
ALTER TABLE geo_audit ALTER COLUMN country_code TYPE varchar(2);
