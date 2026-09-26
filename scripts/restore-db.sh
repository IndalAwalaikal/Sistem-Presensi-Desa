#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 1 ]]; then
  echo "Pemakaian: $0 <berkas-backup.sql.gz>" >&2
  exit 2
fi

backup="$(realpath "$1")"
if [[ ! -f "$backup" ]]; then
  echo "Berkas backup tidak ditemukan: $backup" >&2
  exit 2
fi
gzip -t "$backup"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

read -r -p "Pemulihan akan MENIMPA basis data aktif. Ketik PULIHKAN untuk lanjut: " confirm
if [[ "$confirm" != "PULIHKAN" ]]; then
  echo "Pemulihan dibatalkan."
  exit 1
fi

gzip -dc "$backup" | docker compose exec -T db sh -c \
  'exec mysql --default-character-set=utf8mb4 -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"'

echo "Pemulihan selesai. Periksa log API dan lakukan pemeriksaan aplikasi sebelum digunakan kembali."
