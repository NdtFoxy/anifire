-- Per-line tokens, so the player can underline the exact surface form in the
-- exact cue. Kept as JSON on the pack rather than a row per token: it is written
-- once, always read whole, and a 700-token episode is a few kilobytes.
ALTER TABLE study_pack ADD COLUMN tokens jsonb;
