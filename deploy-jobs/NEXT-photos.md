# Next: getting *current* pictures onto a piece

Where this was left on 2026-08-06, what the real obstacle is, and the three
things worth building. Read `CLAUDE.md`'s blog section first — the rules there
are settled and this is only the open end of them.

## The problem, stated honestly

A piece about something that happened last week wants a picture from last week.
Freely licensed photography does not work that way:

- Commons' newest Ariana Grande file is **December 2025**. The story was August
  2026. This is not a bug in our gatherers — it is what the category contains.
- The pattern generalises. Recent photographs of a famous person are taken by
  agencies (Getty, AP, Reuters) and licensed for money. What is free is what a
  fan happened to shoot and upload, which lags by months and is usually softer.
- So **recency and sharpness pull against each other**, and both gatherers now
  print `width×height` beside the date because only a person can decide which
  a given piece needs.

What we did instead, and it works: **embed the event**. The Ariana Grande piece
carries the TODAY clip of the Chicago speech at the heading that quotes it.
That is genuinely August 2026 material, it is the sanctioned mechanism, and
nothing is copied to our storage. `ReviewBody` turns a pasted YouTube / X /
Instagram post URL on its own line into a click-to-load frame.

## What is already built

| Command | Does |
|---|---|
| `npm run topic -- --topic="…"` | news + licensed photos, by search |
| `npm run person-photos -- --person=<slug>` | walks a person's whole Commons category — **better than search for a person** |
| `npm run post-images -- --body=<jobs>` | places pictures, `at` = heading, same `at` = one row |
| `npm run publish -- --topic="…"` | the whole thing in one command |
| `npm run blog-doctor -- --fetch` | proves every picture on every post loads |
| `npm run save-media -- --url=<…>` | personal archive, local folder, never the site |

Rules the gatherers now enforce (see `lib/gather-sources.ts`): NC and ND are
refused outright, 1200px minimum, name-token match on **search** results only,
premiere/press frames preferred within a day, montages and posters and
waxworks filtered.

## Three things worth building, in order

### 1. An Instagram / X candidate collector — *collection, not publication*

`C:\moneyti\scripts\ig-photos.mjs` is the reference implementation and the
right model. Two things to copy exactly:

- **How it reads.** Existence check through the token-free
  `graph.facebook.com/v25.0/instagram_oembed`, then
  `instagram.com/p/<code>/embed/captioned/` **with no User-Agent header** (a
  browser UA returns the JS shell), parsing `contextJSON` →
  `gql_data.shortcode_media.edge_sidecar_to_children`, picking the largest
  `display_resources` **by pixel count, not array order**.
- **What it refuses to be.** Every manifest it writes carries
  `'원저작자 사진. 후보 확인용 수집이며 발행 허가가 아니다.'` — collection is not
  permission. It downloads to a folder for a human to look at. It does not
  publish.

Build it into `save-media.ts`, which is already the local-archive tool and
already says it is not part of the site. Then the flow is: collect → look →
if there is permission, `post-images --file=… --source-url=<the post>` with a
`--license` you can actually name. The database refuses the row otherwise, and
that refusal is the feature.

**Do not** wire this into `publish-topic`. An unlicensed press photo on an
indexed page is not a risk worth automating.

### 2. Pexels / Unsplash / Pixabay as a fourth pool

Official APIs, keys in env (`PEXELS_API_KEY`, `UNSPLASH_ACCESS_KEY`,
`PIXABAY_API_KEY`), properly licensed for commercial use and modification —
so they pass `licenceAllows` without an exception. Request shapes are at
`C:\moneyti\src\photo.js:262-315`.

Worth it for pieces that are about an *argument* rather than a person (an
INDUSTRY or CRAFT post about, say, IMAX projection). Worth nothing for a piece
about a named actor — stock photography of "a woman on a red carpet" is worse
than no picture, and moneyti flags exactly this with a per-mode `noStockPhotos`
capability (`src/photo.js:1310-1320`). Copy that idea: gate the pool on
category, not on availability.

### 3. Perceptual dedupe

`photoKey()` strips size-variant suffixes and md5 catches identical bytes, but
two crops of one press photo still both land. moneyti solves it with a dHash
in `scripts/dupe_photos.py` — 9×8 greyscale, threshold 16, derived from a
measured distance matrix (same poster different crop = 12, nearest distinct
pair = 22), tightened to 6 when both frames come from one video.

Needs Python + OpenCV on the machine that runs it, which the server does not
have. Lower priority than the two above, and a cheaper approximation (compare
aspect ratio and byte size within an event) may be enough for our volumes.

## Two things deliberately *not* on this list

- **Image-search scraping** (Google/Bing). moneyti has it and keeps it
  **default off**, with a note recording what it returned: Jennifer Lawrence
  and Chow Yun-fat for a Korean tax article, plus watermarked Dreamstime
  stock. Its own engineering argues against it.
- **Refilling body slots from the source article's photos.** moneyti tried it
  and retracted it, leaving `void fillFromSourceArticles;` in place as
  documentation — a deeper refill surfaced an underwear advertisement from a
  news site.

## Traps already paid for — do not re-learn these

- **Never hand-write a Commons URL.** The hash path and the rendition ladder
  are the API's to name; guessing produced three 404s in one day. Ask the API
  and take `thumburl`.
- **Take the rendition, not the original.** Commons originals run past 20 MB,
  which the ingest pipeline refuses. `iiurlwidth=2000`.
- **A CHECK passes when its expression is NULL.** `NULL ~ '…'` is NULL, so a
  regex alone admits a missing value. Spell out `IS NOT NULL`.
- **NFKD splits Hangul into jamo.** Recompose with NFC before matching, or
  every Korean name folds to an empty string.
- **PowerShell here-strings break on quotes**; commit with `git commit -F <file>`.
- **`--reset-images` once deleted every heading in a piece.** The prose was
  recoverable only because it also lives in `deploy-jobs/*.json`. Keep writing
  pieces as job files, not as rows.
