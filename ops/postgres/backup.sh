#!/usr/bin/env bash
# Nightly logical backup of the CinePixo database.
#
#   ops/postgres/backup.sh            # write a dated dump, prune old ones
#   RETAIN_DAYS=30 ops/postgres/backup.sh
#
# Runs pg_dump *inside* the container, so the client version always matches the
# server — a mismatched pg_dump is the classic reason a restore fails at 3am.
# Output is a custom-format dump (compressed, restorable table by table).
set -euo pipefail

CONTAINER=cinepixo-postgres
DB=cinepixo
USER=cinepixo
DEST="${BACKUP_DIR:-$HOME/backups/cinepixo}"
RETAIN_DAYS="${RETAIN_DAYS:-14}"

stamp=$(date -u +%Y%m%dT%H%M%SZ)
file="$DEST/cinepixo-$stamp.dump"

mkdir -p "$DEST"

if ! docker inspect --format '{{.State.Running}}' "$CONTAINER" >/dev/null 2>&1; then
  echo "[backup] $CONTAINER is not running — nothing to back up" >&2
  exit 1
fi

# Dump to a temporary name first: a half-written file must never look like a
# finished backup to the restore procedure or to the pruner.
tmp="$file.partial"
docker exec "$CONTAINER" pg_dump -U "$USER" -d "$DB" --format=custom --no-owner --no-acl > "$tmp"

# A valid custom-format dump can be listed. If it cannot, the file is garbage
# and must not replace a good one or count toward retention.
if ! docker exec -i "$CONTAINER" pg_restore --list /dev/stdin < "$tmp" >/dev/null 2>&1; then
  echo "[backup] dump failed verification, keeping it as $tmp for inspection" >&2
  exit 1
fi

mv "$tmp" "$file"
size=$(du -h "$file" | cut -f1)
echo "[backup] wrote $file ($size)"

# Prune only verified dumps, never the .partial files.
deleted=$(find "$DEST" -name 'cinepixo-*.dump' -type f -mtime "+$RETAIN_DAYS" -print -delete | wc -l)
echo "[backup] pruned $deleted dump(s) older than ${RETAIN_DAYS}d"

# Fail loudly if retention has left us with nothing — a silent empty backup
# directory is how people discover they have no backups.
count=$(find "$DEST" -name 'cinepixo-*.dump' -type f | wc -l)
if [ "$count" -eq 0 ]; then
  echo "[backup] no dumps remain after pruning — check RETAIN_DAYS" >&2
  exit 1
fi
echo "[backup] $count dump(s) retained in $DEST"
