// The taxonomy, written rather than imported.
//
// Every definition and every per-film sentence in this file is editorial work.
// That is the whole point of the Topic tables: a keyword list can tell anyone
// that Parasite involves a basement, and no keyword list can say that the same
// downpour is a blessing upstairs and a flood below. If a future importer ever
// fills these columns from an API, the topic pages stop being worth reading.
//
// Idempotent: topics upsert by slug and assignments by (movieId, topicId), and
// the prose is carried on update — a revised definition should reach a re-seeded
// database rather than being silently kept out by `update: {}`.
import "./env";
import { prisma } from "../src/index";

type Kind = "THEME" | "MOTIF";

interface SeedTopic {
  slug: string;
  name: string;
  kind: Kind;
  /** One sentence, ≤300 chars — what the axis means, precisely. */
  description: string;
  /** Shown as "The reading" on the topic page. Prose, not markdown headings. */
  essay?: string;
  films: { tmdbId: number; note: string }[];
}

// tmdbId is the join key because it is what seed-movies.ts upserts on; slugs
// carry a year and would churn if a release date were ever corrected.
const PARASITE = 496243;
const DARK_KNIGHT = 155;
const PULP_FICTION = 680;
const LA_LA_LAND = 313369;
const WHIPLASH = 244786;
const ODYSSEY_2001 = 62;
const EEAAO = 545611;
const INTERSTELLAR = 157336;
const SPIRITED_AWAY = 129;

const TOPICS: SeedTopic[] = [
  /* ── Themes: what the films are about ───────────────────────── */
  {
    slug: "class-divide",
    name: "Class Divide",
    kind: "THEME",
    description:
      "Inequality staged as geography and habit rather than argument: who climbs to work and descends to sleep, whose labour is priced, whose smell gets remarked upon.",
    essay:
      "The films on this axis share a refusal. None of them explains its hierarchy in dialogue, because a speech about inequality can be agreed with and forgotten, while a staircase cannot be argued with.\n\nWhat to watch for is the moment the film stops being about money and becomes about disgust. In Parasite it is a nose wrinkling at a smell that soap cannot reach; in Spirited Away it is a name taken away and replaced with a shorter one, because a worker does not need all of hers.\n\nThe test for admission here is simple: remove the class reading and does the film still hold its shape? If it does, it belongs under some other axis.",
    films: [
      {
        tmdbId: PARASITE,
        note: "The Kims climb a hill to work and descend a staircase to live; Bong never argues the hierarchy, he blocks it, and then lets one remark about a smell finish what no speech could.",
      },
      {
        tmdbId: SPIRITED_AWAY,
        note: "The bathhouse runs on contracts and names: Chihiro signs hers away to earn the right to stay, and the spirits soaking upstairs are served by a workforce that must keep proving it is useful.",
      },
    ],
  },
  {
    slug: "the-cost-of-ambition",
    name: "The Cost of Ambition",
    kind: "THEME",
    description:
      "Films that grant the ambition and then present the invoice — greatness reached, and the specific thing surrendered to reach it.",
    essay:
      "A film about ambition that ends in failure is a morality tale, and morality tales are easy. These three are harder, because in each of them the character gets what they wanted.\n\nWhat separates them is where the film puts the bill. Whiplash hands it to the audience and walks out of the room. La La Land itemises it in a five-minute fantasy of the life that was not chosen. The Dark Knight hides it inside a lie that two men agree to maintain for the city's benefit.\n\nNone of the three tells you whether the price was worth paying. That refusal is the axis.",
    films: [
      {
        tmdbId: WHIPLASH,
        note: "Fletcher's quiet \"good job\" is the most frightening line in the film: Andrew gets the greatness he asked for, and the closing Caravan will not say whether it was earned or extorted.",
      },
      {
        tmdbId: LA_LA_LAND,
        note: "Mia and Sebastian each get the career they wanted and pay for it with the other; the closing sequence prices the road not taken without pretending it was ever available.",
      },
      {
        tmdbId: DARK_KNIGHT,
        note: "Harvey Dent wants to be the city's white knight without touching its rot, and the tragedy is that he half-succeeds — his ambition outlives him as a lie Gordon and Batman agree to keep telling.",
      },
    ],
  },
  {
    slug: "parents-and-children",
    name: "Parents and Children",
    kind: "THEME",
    description:
      "The family as the arena: what a parent owes, what a child inherits, and what a child does when the adults stop being adults.",
    films: [
      {
        tmdbId: INTERSTELLAR,
        note: "The clock is the emotional instrument: Cooper watches twenty-three years of messages in one sitting, and the film's physics exists to make a father's absence measurable.",
      },
      {
        tmdbId: EEAAO,
        note: "Every universe is a version of one argument between a mother and a daughter, and the resolution is not a victory but an offer — to be kind in the single life that is actually theirs.",
      },
      {
        tmdbId: SPIRITED_AWAY,
        note: "The parents are turned into pigs within ten minutes and are no use for the rest; what follows is a study of what a child does once the adults have disqualified themselves.",
      },
    ],
  },
  {
    slug: "order-and-chaos",
    name: "Order and Chaos",
    kind: "THEME",
    description:
      "Plans, codes and rules held up against the accident that outranks them — and characters forced to decide which of the two they actually trust.",
    essay:
      "Every film here builds an apparatus of control and then breaks it, but the interesting variable is what the break reveals.\n\nThe Dark Knight treats it as an experiment with a control group: the ferries, the hospital and the interrogation are the same question asked three times, and the Joker is only ever interested in the answer. Pulp Fiction treats it as comedy, because a bathroom door defeats three separate professionals. Parasite treats it as weather, and weather does not negotiate.\n\nWatch which characters keep faith with their code afterwards. Jules does. Ki-taek concludes that the plan that never fails is the one you never made.",
    films: [
      {
        tmdbId: DARK_KNIGHT,
        note: "The Joker's only stated aim is to prove Gotham's order is a costume, and the ferries, the hospital and the interrogation are one experiment staged three times.",
      },
      {
        tmdbId: PULP_FICTION,
        note: "Everyone here works to a code — Jules's scripture, the Wolf's timetable, Butch's inherited watch — and the joke is that a bathroom door outranks all of them.",
      },
      {
        tmdbId: PARASITE,
        note: "Ki-taek's line about the plan that never fails is the film auditing its own first hour, in which every scheme works beautifully right up until it rains.",
      },
    ],
  },
  {
    slug: "machines-that-outgrow-us",
    name: "Machines That Outgrow Us",
    kind: "THEME",
    description:
      "Intelligence we built and then had to live beside: the machine that reasons its way to something monstrous, and the one that turns out to be steadier than the crew.",
    films: [
      {
        tmdbId: ODYSSEY_2001,
        note: "HAL is the only character who speaks in a considerate register, and the horror of what he does is how procedural it is — the machine does not rebel, it reasons.",
      },
      {
        tmdbId: INTERSTELLAR,
        note: "TARS is the anti-HAL: an adjustable honesty setting played first as a joke and then as the film's most reliable relationship, in a crew where the humans are the failure points.",
      },
    ],
  },

  /* ── Motifs: what recurs on screen ──────────────────────────── */
  {
    slug: "stairs-and-levels",
    name: "Stairs and Levels",
    kind: "MOTIF",
    description:
      "Height as status, made literal. Films that build a hierarchy into their architecture, so a character's position in the frame reports their position in the world.",
    films: [
      {
        tmdbId: PARASITE,
        note: "Vertical movement is the plot: the semi-basement, the hilltop house, and the flight of steps that reveals there is a floor below the floor.",
      },
      {
        tmdbId: SPIRITED_AWAY,
        note: "The bathhouse is read vertically — boiler room, guest floors, Yubaba's suite at the top — and Chihiro's standing at any moment is legible from the level she is on.",
      },
    ],
  },
  {
    slug: "mirrors-and-doubles",
    name: "Mirrors and Doubles",
    kind: "MOTIF",
    description:
      "The double as argument: a character made to meet the version of themselves they did not become, or an antagonist who is a reflection with the volume raised.",
    films: [
      {
        tmdbId: DARK_KNIGHT,
        note: "Batman, the Joker and Two-Face are one argument wearing three faces: a man in a mask, a man who needs none, and a man who lets a coin do the choosing.",
      },
      {
        tmdbId: EEAAO,
        note: "Evelyn meets the woman she would have been in every branch she declined, and Jobu Tupaki is her daughter pushed to the same limit — here the double is always family.",
      },
      {
        tmdbId: PARASITE,
        note: "Two families of four, one below ground and one above it, each certain it is the exception; the cruelty of the film is how exactly they rhyme.",
      },
    ],
  },
  {
    slug: "water-that-rises",
    name: "Water That Rises",
    kind: "MOTIF",
    description:
      "Rain, flood and ocean as verdict rather than weather — the same water clearing the sky for one household and reaching the ceiling of another.",
    essay:
      "Water is the cheapest way for a film to say something is out of your hands, which is why it usually reads as a cliché. What earns it a place here is asymmetry: the same water has to mean two opposite things in the same film, or the meaning has to arrive as a change of scale.\n\nParasite is the clearest case — one downpour, two addresses, opposite verdicts. Interstellar converts water into scale: a shin-deep ocean with mountains that turn out to be waves, which is horror produced entirely by a corrected estimate. Spirited Away goes the other way and lets a flood make the film quiet.",
    films: [
      {
        tmdbId: PARASITE,
        note: "The downpour that clears the sky for the Parks' garden party fills the Kims' home to the ceiling: one weather event, two addresses, opposite meanings.",
      },
      {
        tmdbId: INTERSTELLAR,
        note: "Miller's planet is a shin-deep ocean whose mountains turn out to be waves — terror produced by nothing more than a correction of scale.",
      },
      {
        tmdbId: SPIRITED_AWAY,
        note: "The rail line that surfaces once the valley floods, running over a sea on one-way tickets, turns a flood into the calmest and saddest passage in the film.",
      },
    ],
  },
  {
    slug: "the-rehearsal-room",
    name: "The Rehearsal Room",
    kind: "MOTIF",
    description:
      "The unglamorous room where the work actually happens: auditions, practice, blood on the instrument. Films that shoot craft as labour rather than as montage.",
    films: [
      {
        tmdbId: WHIPLASH,
        note: "The studio is shot as a boxing ring — blood on the snare, a taped hand, a metronome for an opponent — and the drum stool is where the character is both destroyed and made.",
      },
      {
        tmdbId: LA_LA_LAND,
        note: "Audition rooms, a club stage, an upright piano in a cramped apartment: the film keeps returning to plain rooms and shoots them as unsparingly as it shoots the fantasy numbers.",
      },
    ],
  },
  {
    slug: "food-as-character",
    name: "Food as Character",
    kind: "MOTIF",
    description:
      "Meals that carry the plot: what is served, who cooks it, who is permitted to eat — appetite as the most legible form of power a film has.",
    essay:
      "Food is where these films put the information they do not want to state. A meal has a server and a served, a cook and a consumer, and every one of those roles is a fact about power that the audience reads without being told.\n\nPulp Fiction uses it as ritual: two men discuss a burger with the seriousness of scripture, and the film's one genuine conversion happens over breakfast. Parasite uses it as command — eight minutes to cook ram-don because a wealthy woman decided so on the drive home. Spirited Away uses it as a moral test, twice, in opposite directions: the parents gorge and stop being human, and Chihiro is kept human by a rice ball she cries through.",
    films: [
      {
        tmdbId: PARASITE,
        note: "Ram-don cooked in the eight minutes of a rich woman's drive home, and a peach turned into a weapon: appetite is how this household issues orders.",
      },
      {
        tmdbId: PULP_FICTION,
        note: "The film opens and closes in a diner and treats a burger with the seriousness of scripture; eating is where these characters negotiate, and where one of them is converted.",
      },
      {
        tmdbId: SPIRITED_AWAY,
        note: "Eating is the moral test, run in both directions: the parents gorge and stop being human, while Chihiro is kept human by a rice ball she cries through.",
      },
      {
        tmdbId: EEAAO,
        note: "An everything bagel is nihilism made edible: if all of it fits on one thing, then none of it counts — and the film answers that with a plate of laundromat food eaten in company.",
      },
    ],
  },
  {
    slug: "time-out-of-order",
    name: "Time Out of Order",
    kind: "MOTIF",
    description:
      "Chronology reshuffled, dilated or folded — structure used as an argument about a life, rather than as a puzzle for the audience to solve.",
    films: [
      {
        tmdbId: PULP_FICTION,
        note: "Vincent dies in the third movement and is alive in the fourth; the reshuffle is not a trick but a moral device, letting the film close on the one man who walks away.",
      },
      {
        tmdbId: EEAAO,
        note: "The cut does work a plot device normally would: a mid-sentence jump to another universe is both the film's grammar and its claim that a life is the sum of its branches.",
      },
      {
        tmdbId: INTERSTELLAR,
        note: "Time is the antagonist and the structure at once — an hour on one surface costs decades at home, and the last act folds the first scene into its own ending.",
      },
    ],
  },
  {
    slug: "the-wordless-stretch",
    name: "The Wordless Stretch",
    kind: "MOTIF",
    description:
      "Long passages carrying no dialogue at all, where the film trusts image, sound and duration to do the interpretive work.",
    films: [
      {
        tmdbId: ODYSSEY_2001,
        note: "Kubrick cut the explanatory narration before release and left the opening and closing stretches without a word spoken — a bone, a waltz, an eye, and the audience doing the reading.",
      },
      {
        tmdbId: SPIRITED_AWAY,
        note: "The train sequence is minutes of water, light and a girl sitting still: Miyazaki's ma, and the reason the noise everywhere else in the film lands.",
      },
    ],
  },
];

async function main() {
  let assignments = 0;
  const missing: number[] = [];

  for (const t of TOPICS) {
    const topic = await prisma.topic.upsert({
      where: { slug: t.slug },
      update: {
        name: t.name,
        kind: t.kind,
        description: t.description,
        essay: t.essay ?? null,
      },
      create: {
        slug: t.slug,
        name: t.name,
        kind: t.kind,
        description: t.description,
        essay: t.essay ?? null,
      },
      select: { id: true },
    });

    for (const f of t.films) {
      const movie = await prisma.movie.findUnique({
        where: { tmdbId: f.tmdbId },
        select: { id: true },
      });
      // A film absent from this library is not an error — the seed is a subset
      // of a growing catalogue — but it is worth naming, because a topic page
      // quietly missing a third of its argument looks finished.
      if (!movie) {
        missing.push(f.tmdbId);
        continue;
      }

      await prisma.movieTopic.upsert({
        where: { movieId_topicId: { movieId: movie.id, topicId: topic.id } },
        update: { note: f.note },
        create: { movieId: movie.id, topicId: topic.id, note: f.note },
      });
      assignments += 1;
    }
  }

  const themes = TOPICS.filter((t) => t.kind === "THEME").length;
  console.log(
    `Topics upserted: ${TOPICS.length} (${themes} themes, ${TOPICS.length - themes} motifs)`,
  );
  console.log(`Film assignments upserted: ${assignments}`);
  if (missing.length > 0) {
    console.warn(
      `Skipped ${missing.length} assignment(s) — film not in this library: ${[...new Set(missing)].join(", ")}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
