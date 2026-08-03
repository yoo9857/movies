#!/usr/bin/env bash
# Nightly logical backup of the CinePixo database.
#
#   ops/postgres/backup.sh
#   RETAIN_DAYS=30 BACKUP_DIR=/mnt/big/cinepixo ops/postgres/backup.sh
#   UPLOADS_RETAIN_DAYS=7 ops/postgres/backup.sh   # once uploads live in a bucket
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
# Uploads keep their own, much shorter window. A dump is ~90 MB and a fortnight
# of them is free; the uploads archive is a *full* tar of every image on disk,
# and once the poster and portrait passes had run it crossed 7 GB — fourteen of
# those is 100 GB on a 157 GB disk shared with ten other sites. Three days is
# still three independent copies of an immutable, append-only tree.
UPLOADS_RETAIN_DAYS="${UPLOADS_RETAIN_DAYS:-3}"

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
# dump that restores perfectly still loses every picture without this. Objects
# are immutable and never renamed, so tar needs no consistency tricks.
#
# "Only taken when the local driver is in use" is what this always claimed, and
# for a long time it was not what it did: the test was whether the directory had
# anything in it, so after the uploads were migrated to the bucket it would have
# gone on tarring 7.4 GB of second copies every night. The driver is now actually
# consulted — S3_BUCKET in the app's env means the bucket is the durable copy and
# this archive is redundant by definition.
#
# The tree itself is deliberately left alone. Skipping its backup and deleting it
# are separate decisions, and only one of them is reversible.
UPLOADS="${UPLOAD_DIR:-$HOME/cinepixo/var/uploads}"
APP_ENV="${APP_ENV_FILE:-$HOME/cinepixo/apps/web/.env.local}"
if [ -f "$APP_ENV" ] && grep -qE '^S3_BUCKET=.+' "$APP_ENV"; then
  echo "[backup] object storage is configured — skipping the uploads archive"
elif [ -d "$UPLOADS" ] && [ -n "$(ls -A "$UPLOADS" 2>/dev/null)" ]; then
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
deleted_uploads=$(find "$DEST" -maxdepth 1 -name 'cinepixo-uploads-*.tar.gz' -type f -mtime "+$UPLOADS_RETAIN_DAYS" -print -delete | wc -l)
echo "[backup] pruned $deleted_uploads uploads archive(s) older than ${UPLOADS_RETAIN_DAYS}d"

# An empty backup directory is how people discover they have no backups. Say so.
count=$(find "$DEST" -maxdepth 1 -name 'cinepixo-*.dump' -type f | wc -l)
if [ "$count" -eq 0 ]; then
  echo "[backup] no dumps remain after pruning — check RETAIN_DAYS" >&2
  exit 1
fi
echo "[backup] $count dump(s) retained in $DEST"
