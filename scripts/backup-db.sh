#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"
if [[ ! "$KEEP_DAYS" =~ ^[1-9][0-9]*$ ]]; then
  echo "BACKUP_KEEP_DAYS harus bilangan bulat positif." >&2
  exit 2
fi
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
umask 077

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
output="$BACKUP_DIR/presensi-$timestamp.sql.gz"
temporary="$output.tmp"
trap 'rm -f "$temporary"' EXIT

docker compose exec -T db sh -c \
  'exec mysqldump --single-transaction --routines --triggers --hex-blob --no-tablespaces -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
  | gzip -c > "$temporary"

gzip -t "$temporary"
mv "$temporary" "$output"
trap - EXIT
chmod 600 "$output"
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'presensi-*.sql.gz' -mtime "+$KEEP_DAYS" -delete
printf 'Backup berhasil: %s\n' "$output"
