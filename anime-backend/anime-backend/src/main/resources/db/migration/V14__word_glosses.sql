-- Dictionary meaning, resolved once when the pack is built and copied onto the
-- word the moment a viewer saves it. Copying rather than joining is deliberate:
-- a saved word must keep the meaning it was shown with even if the dictionary
-- is later rebuilt, and the personal list must not depend on packs surviving.
ALTER TABLE study_word ADD COLUMN reading varchar(120);
ALTER TABLE study_word ADD COLUMN gloss_en varchar(400);
ALTER TABLE study_word ADD COLUMN gloss_ru varchar(400);

ALTER TABLE user_word ADD COLUMN reading varchar(120);
ALTER TABLE user_word ADD COLUMN gloss varchar(400);
