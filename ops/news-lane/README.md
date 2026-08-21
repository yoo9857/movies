# The news lane, on the server

`npm run news-lane` is the only thing on this site that publishes without a
person reading the piece first. What it is and what it refuses to publish is
documented at the top of `apps/web/scripts/news-lane.ts`; this file is about
running it on the box.

## Why it only runs there

`codex` is installed on the server and nowhere else, so generation cannot happen
on a workstation. Everything up to generation — the beats, the duplicate gates,
the subject resolution — runs locally under `--dry`, and that is the way to see
what a run would do before letting one write anything:

```bash
npm run news-lane -- --dry            # against your own database
```

A local dry run under-reports the take: the gates that skip a story for naming
nobody we have a page for are reading your database, and a scratch copy holds a
few hundred people where production holds ~208,000.

## Installing the cron

The app directory is a real clone, so the wrapper arrives with a `git pull`.

```bash
crontab -e
```

Drafts first, which is the recommendation for the first fortnight:

```cron
0 0,12 * * * /home/hanbin9857/cinepixo/ops/news-lane/lane-news.sh --no-publish
```

Publishing, once the held pieces have been read and the holds look right — the
box is UTC, so this is 09:00 and 21:00 KST:

```cron
0 0,12 * * * /home/hanbin9857/cinepixo/ops/news-lane/lane-news.sh
```

The wrapper passes its arguments straight through and adds nothing. That is on
purpose: the crontab line is where "this box publishes unread" is decided, and a
wrapper that quietly held everything back would make the line above mean
something other than what it says. What it does add is the two things cron
breaks — nvm's `node` (a login-less `PATH` has none, which is how every earlier
lane on this box failed silently once) and a `flock`, because a run has no fixed
ceiling and two overlapping runs would clear the same duplicate gates and
publish the same story twice.

## Reading a run

```bash
tail -40 ~/fill-logs/news-lane-cron.log     # the wrapper: started, finished, failed
tail -80 ~/fill-logs/news-lane.log          # the run: every skip, take, hold, LIVE
grep 'HELD' ~/fill-logs/news-lane.log | tail -20
```

A `HELD` line names the piece and the reason. The piece exists at
`/blog/<slug>`, readable by an admin, `noindex`, on no shelf and in no feed —
`npm run publish-post -- <slug>` takes it live once somebody has read it against
its sources, and `npm run blog-doctor -- --fetch --post=<slug>` checks the
pictures actually load.

`skip` lines are not failures. Most runs skip far more than they take: one
outlet is a rumour, a subject who ran within the fortnight is not coverage, and
a headline naming nobody we have a page for is a piece with no link graph, which
is the only reason to write it here rather than link the outlet.

## Load

Three to four concurrent fill lanes is the ceiling on this box before the app
starts seeing query timeouts, and a news-lane run is one of them plus six
`codex` generations. Check what is already running before adding the cron:

```bash
pgrep -af 'tsx (scripts|prisma)/' | wc -l
```
