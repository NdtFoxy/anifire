-- Country attribution, so the regions panel can answer "who is actually there?".
-- Both columns are nullable on purpose: rows written before this migration have
-- no country, and a request without a trusted proxy header never gets one.
ALTER TABLE app_users ADD COLUMN signup_country varchar(2);
ALTER TABLE watch_events ADD COLUMN country varchar(2);

CREATE INDEX ix_app_users_country ON app_users (signup_country, created_at DESC);
CREATE INDEX ix_watch_events_country ON watch_events (country, watched_at DESC);
