#!/bin/sh
# Restores a dump produced by backup.sh into the database at $DATABASE_URL.
#
#   docker compose -f compose.prod.yaml exec backup restore.sh /backups/anifire-<stamp>.dump
#
# Stop the backend first so nothing writes while tables are being replaced.
set -eu
dump="${1:?usage: restore.sh <dump file>}"
pg_restore --clean --if-exists --no-owner --exit-on-error --dbname="$DATABASE_URL" "$dump"
echo "[restore] done: $dump"
