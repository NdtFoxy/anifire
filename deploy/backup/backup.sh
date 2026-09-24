#!/bin/sh
# Nightly logical backups of the Anifire database.
#
#   - pg_dump in custom format (compressed, restorable table by table);
#   - kept locally for BACKUP_KEEP_DAYS in the `backups` volume;
#   - copied off the database host to an S3-compatible bucket when BACKUP_S3_* is
#     set (MinIO in compose, or Yandex Object Storage / AWS for a real off-site copy).
#
# `backup.sh once` takes one backup and exits (used by restore drills and CI).
set -eu

INTERVAL_HOURS="${BACKUP_INTERVAL_HOURS:-24}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
DIR=/backups

run_backup() {
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  file="$DIR/anifire-$stamp.dump"
  echo "[backup] dumping to $file"
  pg_dump --format=custom --no-owner --file="$file.part" "$DATABASE_URL"
  # Refuse to keep a dump that cannot be read back: a silent bad backup is worse than none.
  pg_restore --list "$file.part" > /dev/null
  mv "$file.part" "$file"
  echo "[backup] ok $(du -h "$file" | cut -f1)"

  if [ -n "${BACKUP_S3_ENDPOINT:-}" ]; then
    mc alias set target "$BACKUP_S3_ENDPOINT" "$BACKUP_S3_ACCESS_KEY" "$BACKUP_S3_SECRET_KEY" > /dev/null
    mc cp --quiet "$file" "target/${BACKUP_S3_BUCKET}/$(basename "$file")"
    echo "[backup] uploaded to ${BACKUP_S3_BUCKET}"
  fi

  find "$DIR" -name 'anifire-*.dump' -mtime +"$KEEP_DAYS" -print -delete
}

if [ "${1:-}" = "once" ]; then
  run_backup
  exit 0
fi

while true; do
  run_backup || echo "[backup] FAILED" >&2
  sleep $((INTERVAL_HOURS * 3600))
done
