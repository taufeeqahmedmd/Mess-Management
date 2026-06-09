#!/usr/bin/env bash
# Nightly Postgres backup for the single-box deploy (Option A).
# The ledger is append-only money data — the one thing you cannot lose.
# Dumps from the Docker Postgres, keeps the last 14 locally, and (optionally)
# copies to S3 if BACKUP_S3_BUCKET is set.
#
# Schedule via cron (as the app user):
#   0 2 * * *  /home/ubuntu/mess-management/deploy/backup.sh >> /var/log/mess-backup.log 2>&1
set -euo pipefail

DB_CONTAINER="mess-postgres"
DB_USER="mess"
DB_NAME="mess_management"
BACKUP_DIR="${BACKUP_DIR:-/home/ubuntu/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
# Optional: set to an s3://bucket/prefix to also push offsite.
BACKUP_S3_BUCKET="${BACKUP_S3_BUCKET:-}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT="$BACKUP_DIR/mess_${STAMP}.sql.gz"

echo "[$(date -Is)] dumping $DB_NAME -> $OUT"
docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner \
  | gzip > "$OUT"

if [[ -n "$BACKUP_S3_BUCKET" ]]; then
  echo "[$(date -Is)] uploading to ${BACKUP_S3_BUCKET}/"
  aws s3 cp "$OUT" "${BACKUP_S3_BUCKET%/}/$(basename "$OUT")"
fi

# Prune local dumps older than retention.
find "$BACKUP_DIR" -name 'mess_*.sql.gz' -mtime "+${RETENTION_DAYS}" -delete
echo "[$(date -Is)] done"
