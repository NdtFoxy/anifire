-- Catalogue metadata resolved server-side at import time, so list pages need no
-- per-title calls to AniList from every visitor's browser (which AniList
-- answers with 429 well before a 150-title catalogue has rendered).
ALTER TABLE animes ADD COLUMN title_ru      varchar(255);
ALTER TABLE animes ADD COLUMN title_en      varchar(255);
ALTER TABLE animes ADD COLUMN synopsis_ru   varchar(4000);
ALTER TABLE animes ADD COLUMN anilist_id    bigint;
ALTER TABLE animes ADD COLUMN cover_url     varchar(600);
ALTER TABLE animes ADD COLUMN banner_url    varchar(600);
ALTER TABLE animes ADD COLUMN season_year   integer;
-- When enrichment last ran; NULL means "never", which is what the backfill picks up.
ALTER TABLE animes ADD COLUMN enriched_at   timestamp(6) with time zone;

CREATE UNIQUE INDEX ux_animes_mal_id ON animes (mal_id) WHERE mal_id IS NOT NULL AND NOT is_deleted;
