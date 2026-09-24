-- When the password was last set. Backfilled from creation time: for accounts
-- that never rotated it, that IS the moment the current password came into use,
-- which is exactly what an operator wants to see ("unchanged since sign-up").
ALTER TABLE app_users ADD COLUMN password_changed_at timestamp(6) with time zone;
UPDATE app_users SET password_changed_at = created_at WHERE password_changed_at IS NULL;
