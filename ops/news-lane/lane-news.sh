#!/usr/bin/env bash
# The cron entry point for the unattended news lane.
#
#   ops/news-lane/lane-news.sh                 # what the lane does by default
#   ops/news-lane/lane-news.sh --no-publish    # write six, hold every one
#   ops/news-lane/lane-news.sh --count=3
#
# Arguments are passed straight through to `npm run news-lane`, deliberately:
# the crontab line is where "this box publishes without a person reading it"
# gets decided, and a wrapper that quietly added `--no-publish` would make the
# documented cron line mean something other than what it says.
#
# Install (the app directory is a real clone, so this file arrives with a pull):
#
#   crontab -e
#   # drafts twice a day — read them, then `npm run publish-post <slug>`
#   0 0,12 * * * /home/hanbin9857/cinepixo/ops/news-lane/lane-news.sh --no-publish
#   # or, publishing: 00:00 and 12:00 UTC is 09:00 and 21:00 KST
#   0 0,12 * * * /home/hanbin9857/cinepixo/ops/news-lane/lane-news.sh
set -euo pipefail

APP="${CINEPIXO_DIR:-$HOME/cinepixo}"
LOGS="${LANE_LOG_DIR:-$HOME/fill-logs}"
LOG="$LOGS/news-lane-cron.log"
LOCK="$LOGS/news-lane.lock"

mkdir -p "$LOGS"

# ── node ──────────────────────────────────────────────────────────
# cron gets a login-less PATH with no nvm in it, and every previous lane on this
# box was broken exactly once by that: the run dies on `npm: command not found`
# at a time nobody is watching, and the log looks like the lane never fired.
# Resolved from nvm's own directory rather than pinned to a version string, so a
# node upgrade does not silently retire the cron.
if ! command -v node >/dev/null 2>&1; then
  NODE_BIN=$(find "$HOME/.nvm/versions/node" -maxdepth 2 -type d -name bin 2>/dev/null | sort -V | tail -1)
  if [ -z "${NODE_BIN:-}" ]; then
    echo "[$(date -u +%FT%TZ)] no node on PATH and none under ~/.nvm — lane not run" >>"$LOG"
    exit 1
  fi
  export PATH="$NODE_BIN:$PATH"
fi

# ── one at a time ─────────────────────────────────────────────────
# A run is six generations through `codex exec` plus six picture gathers, and it
# has no fixed ceiling: the twelve-hour slot is a schedule, not a guarantee that
# the previous one finished. Two overlapping runs would read the same history,
# clear the same duplicate gates and publish the same story twice — the lane's
# one job is not saying anything twice, and it cannot see a sibling process. So
# a second run steps aside instead of waiting: by the time this one ends the
# stories are the next slot's problem anyway.
exec 9>"$LOCK"
if ! flock -n 9; then
  echo "[$(date -u +%FT%TZ)] a lane run is still going — this slot skipped" >>"$LOG"
  exit 0
fi

cd "$APP"
{
  echo "── $(date -u +%FT%TZ) · lane-news.sh $* · $(git rev-parse --short HEAD 2>/dev/null || echo 'no git')"
  # Not `set -e`'s problem: a lane that dies mid-way has already written and
  # possibly published pieces, and the exit code is the only thing that says so.
  # Recorded rather than propagated, because cron's mail is not read here and
  # the log is.
  if npm run news-lane -- "$@"; then
    echo "── $(date -u +%FT%TZ) · finished"
  else
    echo "── $(date -u +%FT%TZ) · FAILED (exit $?) — see news-lane.log for what was written"
  fi
} >>"$LOG" 2>&1
