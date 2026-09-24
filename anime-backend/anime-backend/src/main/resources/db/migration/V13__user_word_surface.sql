-- The form as it appeared on screen. The lemma is the dictionary entry
-- (育む), but the line contains the inflected form (育んだ) — without this the
-- review prompt cannot blank out the word it is asking about.
ALTER TABLE user_word ADD COLUMN surface varchar(120);
