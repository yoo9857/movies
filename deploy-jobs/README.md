# Publishing the Hathaway piece to production

Two job files, rebuilt on the server rather than copied: the pictures in the
local database point at this machine's `var/uploads`, and production stores
its objects in the bucket. `--body` refetches from Commons and uploads there.

- `odyssey-draft.json` — the reviewed prose, as a `db:write-posts --drafts` job
- `odyssey-body.json` — six licensed photographs with their `at` placements
  (1 / 2 / 2 / 1 down the piece)

The order matters: the draft mints the slug the body jobs aim at.

```sh
# on the server, after the deploy
cd ~/cinepixo
export PATH=$HOME/.nvm/versions/node/v22.19.0/bin:$PATH

# 1. the piece, as a DRAFT (readable at its URL by an admin, noindex)
npm run db:write-posts -- --drafts=deploy-jobs/odyssey-draft.json

# 2. the hero: the premiere photograph, with its terms
cd apps/web && npx tsx scripts/fill-post-images.ts \
  --post=anne-hathaway-plays-the-one-who-waits-and-the-oscar-race-cant-decide-what-to-call-it \
  --url=https://upload.wikimedia.org/wikipedia/commons/f/fe/AnneHathaway-byPhilipRomano4.jpg \
  --alt="Anne Hathaway at the New York premiere of The Odyssey, 14 July 2026" \
  --credit=PhilipRomano \
  --license="CC BY-SA 4.0" \
  --license-url=https://creativecommons.org/licenses/by-sa/4.0 \
  --source-url=https://commons.wikimedia.org/wiki/File:AnneHathaway-byPhilipRomano4.jpg

# 3. the six body photographs, placed
npx tsx scripts/fill-post-images.ts --body=../../deploy-jobs/odyssey-body.json
cd ~/cinepixo
```

Read it at `/blog/<slug>` signed in as an admin. Publishing is the last step,
and it is deliberately separate — nothing in a database can prove the prose is
faithful to its sources, so it waits for a person:

```sh
npx tsx -e "const{prisma}=require('@cinepixo/db');prisma.post.update({where:{slug:'anne-hathaway-plays-the-one-who-waits-and-the-oscar-race-cant-decide-what-to-call-it'},data:{status:'PUBLISHED',publishedAt:new Date()}}).then(()=>process.exit(0))"
```

If a subject slug does not exist on production the script warns and skips that
link rather than failing; the piece still publishes. Expected subjects:
`anne-hathaway`, `christopher-nolan`, `matt-damon`, `interstellar-2014`.
