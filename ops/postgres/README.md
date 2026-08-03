# CinePixo database operations

PostgreSQL 18, in its own container on the app server. Isolated from the other
databases on that host: separate container, volume, port and credentials.

| | |
|---|---|
| Container | `cinepixo-postgres` |
| Reachable at | `127.0.0.1:5435` — loopback only, never exposed |
| Database / role | `cinepixo` / `cinepixo` |
| Volume | `cinepixo_pgdata` |
| Password | `ops/postgres/.env` on the server, `chmod 600`, generated there |

## Day to day

```bash
cd ~/cinepixo/ops/postgres
docker compose ps                 # status and health
docker compose logs --tail=50     # slow queries (>500ms) and lock waits land here
docker compose restart            # safe: data is on a named volume
docker exec -it cinepixo-postgres psql -U cinepixo -d cinepixo
```

Application health, including a real query round trip:

```bash
curl -s https://cinepixo.com/api/v1/health
# {"status":"ok","database":"up","latencyMs":3}
```

## Migrations

Schema changes are files, applied in order, never hand-edited on the server.

```bash
# on your machine, against a scratch database
npm run db:migrate -w @cinepixo/db     # creates prisma/migrations/<stamp>_<name>
# on the server, as part of deploying
npm run db:deploy                      # applies pending migrations only
npm run db:status -w @cinepixo/db      # what is applied and what is pending
```

Constraints that Prisma cannot express (CHECKs, expression indexes, trigram
indexes) live in `20260730000100_constraints/migration.sql`. Add new ones the
same way: a migration directory with hand-written SQL.

## Backups

`ops/postgres/backup.sh` writes a verified custom-format dump to
`~/backups/cinepixo` and prunes dumps older than `RETAIN_DAYS` (14). It runs
`pg_dump` inside the container so client and server versions always match, and it
refuses to publish a dump that `pg_restore --list` cannot read.

**The uploads archive is pruned on its own, far shorter clock**
(`UPLOADS_RETAIN_DAYS`, 3). While the local storage driver is in use, images are
not in the database — so the script also tars `var/uploads`, and that tar is a
*full* copy every night. After the poster and portrait passes it crossed 7 GB,
which on the dumps' 14-day retention would have been ~100 GB on a 157 GB disk
shared with ten other sites. Raise it once the bucket is the durable copy and
the archive stops being taken at all.

Installed as a cron entry:

```
17 4 * * * /home/hanbin9857/cinepixo/ops/postgres/backup.sh >> /home/hanbin9857/logs/cinepixo-backup.log 2>&1
```

### Restore

Into a scratch database first — always confirm the dump before touching live
data:

```bash
docker exec cinepixo-postgres createdb -U cinepixo cinepixo_check
docker exec -i cinepixo-postgres pg_restore -U cinepixo -d cinepixo_check --no-owner \
  < ~/backups/cinepixo/cinepixo-<stamp>.dump
docker exec cinepixo-postgres psql -U cinepixo -d cinepixo_check -c 'SELECT count(*) FROM "Review"'
```

To restore over the live database, stop the app first so nothing writes during
the restore:

```bash
pm2 stop cinepixo
docker exec -i cinepixo-postgres pg_restore -U cinepixo -d cinepixo --clean --if-exists --no-owner \
  < ~/backups/cinepixo/cinepixo-<stamp>.dump
pm2 start cinepixo
curl -s http://127.0.0.1:3400/api/v1/health
```

## Notes for whoever comes next

- **The pool is small on purpose.** One pm2 process, `DATABASE_POOL_MAX=10`,
  against `max_connections=60` shared with the rest of the box. Raising the app
  to cluster mode means dividing that budget, not ignoring it.
- **Timeouts exist at three layers** — `statement_timeout` on the server, the
  same on the client, and `connectionTimeoutMillis` on the pool. A request that
  cannot finish returns 503 rather than holding a connection.
- **Transient failures retry, wrong requests do not.**
  `packages/db/src/errors.ts` classifies by SQLSTATE: deadlocks and dropped
  sockets are retried with jittered backoff, a unique violation answers 409
  immediately.
- **There is no SQLite fallback any more.** The pre-migration file was removed
  on 2026-07-30 after the row counts were confirmed identical and three verified
  dumps existed. Postgres is the only source of truth; the dumps are the only
  way back.
