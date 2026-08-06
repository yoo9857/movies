# Illustrating a post from a video nobody licensed to us

What was worked out on 2026-08-06 making the Love Island piece, so the next
person does not rediscover it. Read `NEXT-photos.md` first — this is the case
that document does not cover: the subject is a video, and the gatherers have
nothing to offer.

## When the gatherers have nothing

`gatherPhotos` is built for people who exist in Wikimedia. Ask it about a
television format and it returns comedy:

    "Love Island"               → an unnamed island in Cheow Lan Lake
    "Peacock television"        → a butterfly, Papilio paris
    "reality television studio" → a Dutch farming dating show

The host had no free photograph at all. Nothing in the subject's world is on
Commons, and nothing will be. Run with `--images=0` rather than letting the
hero become a butterfly.

## The frames come from the video, by watching it

`C:\mytis\src\ytShot.js` (the Tistory project) already solved this and is the
tool to use. It does **not** download the video: it opens the normal watch page
in installed Chrome, seeks, and screenshots the `<video>` element — the same
act as a person pressing a key. Its own header carries the rules and they are
the right ones: take the minimum a piece needs, never remove the channel
watermark, and carry the source.

Things it handles that a naive script will not: it refuses to shoot while an ad
is playing (an advert published as a "scene capture" is the worst failure
available), it forces the player to its best quality and goes fullscreen
because `screenshot()` captures the CSS box rather than the source, it opens
`?t=<sec>s` per scene because seeking a loaded player silently fails, and it
skips the whole job if the source tops out below 720p.

Needs installed Chrome (bundled Chromium has no H.264), `yt-dlp` for the
quality probe, and Python for the face-picking pass. All are on the
workstation; **none is on the prod server**, so captures happen locally and the
files are copied up.

    node .tmp/li-shots.mjs        # captureFrames(id, seconds, {candidates})
    scp out/photos/*.jpg  oneday-server:/tmp/li-shots/

Then place them as ordinary `file` jobs with `credit` set to the channel and
`sourceUrl` set to the video. No licence field: we have none, and a licence
without a source is what the CHECK refuses.

## Look at every frame before writing a caption

The first version of the piece derived its captions from measurements — how
many faces the picker found, how much of the frame the largest one filled — and
never opened the images. It produced captions like "a close-up of one islander
taking the news, 11:54 into the supercut", and prose built out of percentages
and timestamps.

Both are wrong, for the same reason. **The reader cannot see the clock and does
not care about the arithmetic.** They want to know what is in the picture. And
the measurements were not even a reliable proxy: opening the files showed a
goodbye hug held in a wide night shot, the host mid-sentence, an islander
pressing a hand over his own mouth — none of which any face-count implies. One
claim in the draft ("almost no departures are in the reel") was simply false,
and looking is what disproved it.

So: open all of them. Write what is in the frame. No timestamps, no counts.

## Naming people

The cast list and the order of every exit are documented — Wikipedia's season
page has the table — so the prose can name who left and when without guessing.
Use it; a piece that will not say a name reads like it is hiding something.

What stays off limits is the other direction: asserting that *this face in this
screenshot* is a particular person. That is an identification, and it is a
guess unless it has been checked against a reference photograph. Name the
documented facts, describe the frame.

## The rest of the shape

`db:write-posts --sources=<json>` is better than `publish` here, because the
`brief` field is where an operator puts what no gatherer can find — in this
case, what the frames show. The angle field caps at 300 characters and is
checked before the gather now.

Cite the video (`sources` includes the watch URL) and embed it (`"embed": true`
body job). And check that the piece's citations are actually in `sources`: the
first draft cited NBC News and TheWrap for the season's removals while carrying
neither, which passes `Post_claims_are_sourced` and still leaves a claim about
a named person with nothing behind it.
