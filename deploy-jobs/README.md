# Blog jobs: start here

`deploy-jobs/` is the reproducible source for a CinePixo blog post. The site
does not publish a standalone Markdown file from Git. Markdown lives in the
`content` field of a JSON draft job and is written to PostgreSQL on production.

Use one basename for the complete set:

- `<topic>-draft.json` — title, dek, Markdown body, tags, sources and subjects
- `<topic>-hero.json` — exactly one representative-image job
- `<topic>-body.json` — at least three body-image jobs, placed by `##` heading

The authoritative procedure is [BLOG-PUBLISHING-CHECKLIST.md](./BLOG-PUBLISHING-CHECKLIST.md).

## The order, in one screen

1. Prepare and review all three JSON files locally.
2. Commit and push them so production can reconstruct the post.
3. On production, dry-run the draft job.
4. Confirm the title or slug does not already exist.
5. Create it as `DRAFT` — never add `--publish` here.
6. Apply the hero job, then the body job.
7. Run `blog-doctor --fetch` and preview while signed in as admin.
8. Publish with `publish-post.ts`; verify the public page, search and feed.

Registration and publication are deliberately different operations. Registering
creates an unpublished row. Publishing is the final editorial decision after
the prose, citations and four-image layout have been checked.

## Important safety rules

- `db:write-posts --drafts` is **not idempotent**. If the title already exists,
  running it again can mint a suffixed duplicate slug. Check `/admin/blog`
  before every non-dry run.
- Never commit `.env.local`, passwords, session cookies, downloaded news HTML,
  or temporary files under `var/`.
- YouTube thumbnails require an editorial decision. X and Instagram material
  must be embedded, not copied into storage.
- Do not publish below one hero plus three body images unless an editor has
  explicitly approved the documented exception.
