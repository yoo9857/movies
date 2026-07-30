#!/usr/bin/env bash
# Nightly logical backup of the CinePixo database.
#
#   ops/postgres/backup.sh
#   RETAIN_DAYS=30 BACKUP_DIR=/mnt/big/cinepixo ops/postgres/backup.sh
#
# pg_dump runs *inside* the container so the client version always matches the
# server — a mismatched pg_dump is the classic reason a restore fails at 3am.
#
# The dump is written and verified inside the container before being copied out.
# A custom-format archive is not streamable for verification: pg_restore has to
# seek within it, which it cannot do on a pipe.
set -euo pipefail

CONTAINER=cinepixo-postgres
DB=cinepixo
DB_USER=cinepixo
DEST="${BACKUP_DIR:-$HOME/backups/cinepixo}"
RETAIN_DAYS="${RETAIN_DAYS:-14}"

stamp=$(date -u +%Y%m%dT%H%M%SZ)
inner="/tmp/cinepixo-$stamp.dump"
final="$DEST/cinepixo-$stamp.dump"

mkdir -p "$DEST"

cleanup() { docker exec "$CONTAINER" rm -f "$inner" >/dev/null 2>&1 || true; }
trap cleanup EXIT

if [ "$(docker inspect --format '{{.State.Running}}' "$CONTAINER" 2>/dev/null)" != "true" ]; then
  echo "[backup] $CONTAINER is not running — nothing to back up" >&2
  exit 1
fi

docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB" \
  --format=custom --compress=9 --no-owner --no-acl --file="$inner"

# A valid archive can be listed, and a real one has a table of contents.
entries=$(docker exec "$CONTAINER" pg_restore --list "$inner" 2>/dev/null | grep -c '^[0-9]' || true)
if [ "${entries:-0}" -lt 1 ]; then
  echo "[backup] dump did not verify (no restorable entries) — not publishing it" >&2
  exit 1
fi

docker cp "$CONTAINER:$inner" "$final"
size=$(du -h "$final" | cut -f1)
echo "[backup] wrote $final ($size, $entries entries)"

# ── Uploads ──────────────────────────────────────────────────────
# User images (avatars, review images) live on disk, not in the database — a
# dump that restores perfectly still loses every picture without this. Only
# taken when the local driver is in use; with object storage the bucket is the
# durable copy. Objects are immutable and never renamed, so tar needs no
# consistency tricks.
UPLOADS="${UPLOAD_DIR:-$HOME/cinepixo/var/uploads}"
if [ -d "$UPLOADS" ] && [ -n "$(ls -A "$UPLOADS" 2>/dev/null)" ]; then
  uploads_final="$DEST/cinepixo-uploads-$stamp.tar.gz"
  tar -czf "$uploads_final" -C "$(dirname "$UPLOADS")" "$(basename "$UPLOADS")"
  # Same rule as the dump: verify before counting it as a backup.
  if tar -tzf "$uploads_final" >/dev/null 2>&1; then
    echo "[backup] wrote $uploads_final ($(du -h "$uploads_final" | cut -f1))"
  else
    rm -f "$uploads_final"
    echo "[backup] uploads archive did not verify — not publishing it" >&2
    exit 1
  fi
else
  echo "[backup] no local uploads directory — skipping uploads archive"
fi

# Prune old dumps. Retention only ever removes files that were published, so a
# failed run can never delete a good backup.
deleted=$(find "$DEST" -maxdepth 1 -name 'cinepixo-*.dump' -type f -mtime "+$RETAIN_DAYS" -print -delete | wc -l)
echo "[backup] pruned $deleted dump(s) older than ${RETAIN_DAYS}d"
deleted_uploads=$(find "$DEST" -maxdepth 1 -name 'cinepixo-uploads-*.tar.gz' -type f -mtime "+$RETAIN_DAYS" -print -delete | wc -l)
echo "[backup] pruned $deleted_uploads uploads archive(s) older than ${RETAIN_DAYS}d"

# An empty backup directory is how people discover they have no backups. Say so.
count=$(find "$DEST" -maxdepth 1 -name 'cinepixo-*.dump' -type f | wc -l)
if [ "$count" -eq 0 ]; then
  echo "[backup] no dumps remain after pruning — check RETAIN_DAYS" >&2
  exit 1
fi
echo "[backup] $count dump(s) retained in $DEST"
