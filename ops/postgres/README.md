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
`~/backups/cinepixo` and prunes anything older than 14 days. It runs `pg_dump`
inside the container so client and server versions always match, and it refuses
to publish a dump that `pg_restore --list` cannot read.

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
- **The SQLite database is still on the server** at
  `packages/db/prisma/dev.db` as a rollback path for the migration. Delete it
  once the Postgres data has a few verified backups behind it.
