# Blog publishing checklist

This is the single production checklist. Keep the prose and image jobs in
`deploy-jobs/` so a post can be reconstructed without hand-editing database
rows.

## 1. Verify the reporting

- Prefer a same-day story supported by at least two independent reports.
- Use the original outlet or a trade publication as the primary source.
- Preserve reported status: “eyed”, “circling” and “in talks” do not mean
  “cast” until the studio or representative confirms it.
- Write an angle, not a rewritten news report. Every material factual claim
  must be traceable to a URL in `sources`.

## 2. Prepare the three job files

Create:

```text
deploy-jobs/<topic>-draft.json
deploy-jobs/<topic>-hero.json
deploy-jobs/<topic>-body.json
```

The draft JSON contains the Markdown in its `content` field. There is no second
standalone `.md` file to register.

The image floor is four: one hero and at least three body images. Body jobs use
`"at": "Exact heading text"` to place an image immediately above a matching
`##` heading.

Image source order:

1. Current licensed photographs with credit, licence and source intact.
2. A reviewed YouTube thumbnail chosen by an operator.
3. X or Instagram posts as official embeds only.

Reject fan art, synthetic casting mock-ups, unrelated people, misleading
crops and unreadable watermarks. Alt text describes what is visibly present.

## 3. Commit and deploy the jobs

Commit and push the three JSON files before touching production. After the
normal code deploy, run the remaining commands on production:

```sh
cd ~/cinepixo
export PATH=$HOME/.nvm/versions/node/v22.19.0/bin:$PATH
```

Do not put credentials in a command, job file, commit message or Markdown
document. Production reads its own environment.

## 4. Validate and create the draft

First prove the job parses and note the slug:

```sh
npm run db:write-posts -- --drafts=deploy-jobs/<topic>-draft.json --dry
```

Before the next command, open `/admin/blog` and confirm that neither the title
nor slug already exists. The writer is not an upsert; repeating it can create a
duplicate with a timestamp suffix.

Create the unpublished row:

```sh
npm run db:write-posts -- --drafts=deploy-jobs/<topic>-draft.json
```

Do **not** add `--publish`. The row must remain `DRAFT` until its images,
citations and rendered page have been checked.

## 5. Apply the images

The draft must exist first because both image files target its slug.

```sh
cd ~/cinepixo/apps/web
npx tsx scripts/fill-post-images.ts \
  --images=../../deploy-jobs/<topic>-hero.json
npx tsx scripts/fill-post-images.ts \
  --body=../../deploy-jobs/<topic>-body.json
```

Re-running an image job is also not a casual retry: the script refuses existing
images unless `--force` is supplied. Investigate the partial result before
using `--force` or `--reset-images`.

## 6. Check the draft

Fetch every stored object and enforce the four-image floor:

```sh
npx tsx scripts/blog-doctor.ts --post=<slug> --fetch
```

Expected result: one hero, at least three body images, zero errors and zero
warnings. While signed in as admin, preview `/blog/<slug>` and compare the prose
with its sources.

Also test without a session. A draft must not reveal its title, prose or image
captions. Next.js streaming can return an HTTP 200 containing the rendered 404
fallback, so status alone is not a privacy test; inspect the response body.

## 7. Publish and verify

Publication is the separate final decision:

```sh
npx tsx scripts/publish-post.ts <slug>
```

The command enforces the picture floor, changes the status and publication
date, and submits the post, blog front and category shelf to IndexNow.

Verify all of the following:

- `/blog/<slug>` returns HTTP 200 without `noindex`;
- the hero and all body images load with their alt text and credits;
- the post appears in `/api/v1/search`, `/blog/feed.xml` and its category shelf;
- `publish-post.ts` reports a successful IndexNow submission.

Google does not participate in IndexNow. Its normal discovery paths are the
sitemap, internal subject links and manual Request Indexing in Search Console.

To withdraw a published post:

```sh
npx tsx scripts/publish-post.ts <slug> --unpublish
```

## Completed batches

### 2026-08-10

Published and verified with four images each:

- `spider-man-broke-the-record-the-odyssey-proved-the-record-wasnt-the-whole-story`
- `the-next-james-bond-may-arrive-this-year-the-method-matters-more-than-the-odds`
- `locarno-invited-the-stars-then-put-discovery-back-at-the-center`

All three returned public HTTP 200 pages without `noindex`, appeared in site
search and the blog feed, and were accepted by IndexNow.

### 2026-08-07

- Published the Destin Daniel Cretton / Tom Holland / Zendaya piece and
  expanded it from one image to four.
- Published the Shawn Mendes / Bruna Marquezine piece with four reviewed
  YouTube thumbnails.
- Published the Kit Connor / Cyclops analysis while retaining the reports’
  “circling the role” status.
- Added the four-picture publication gate, repeatable YouTube fallbacks and
  X/Instagram embed handling.
