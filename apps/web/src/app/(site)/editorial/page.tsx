import {
  POST_FORMAT_BLURBS,
  POST_FORMAT_LABELS,
  postFormatSchema,
} from "@cinepixo/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import { ReelDivider } from "@/components/ReelDivider";
import {
  breadcrumbNode,
  type Crumb,
  graph,
  ORG_ID,
  pageMetadata,
  webPageNode,
} from "@/lib/seo";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site";

export const dynamic = "force-dynamic";

const UPDATED = "2026-08-22";
const DESCRIPTION =
  "How CinePixo reports, reviews, compares and corrects its film coverage, including first-hand evidence, sources, automation and commercial disclosures.";

export const metadata: Metadata = pageMetadata({
  path: "/editorial",
  title: "Editorial Standards",
  description: DESCRIPTION,
  keywords: [
    "CinePixo editorial standards",
    "film review methodology",
    "corrections policy",
    "editorial independence",
  ],
});

const TRAIL: Crumb[] = [{ name: "Editorial Standards" }];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-4 leading-relaxed text-foreground/90">{children}</div>
    </section>
  );
}

export default function EditorialPage() {
  const jsonLd = graph(
    webPageNode({
      path: "/editorial",
      name: "CinePixo Editorial Standards",
      description: DESCRIPTION,
      kind: "AboutPage",
      dateModified: new Date(UPDATED),
      hasBreadcrumb: true,
      aboutId: ORG_ID,
      speakableSelectors: ["[data-speakable]"],
    }),
    breadcrumbNode("/editorial", TRAIL),
  );

  return (
    <article className="mx-auto max-w-3xl">
      <JsonLd data={jsonLd} />
      <Breadcrumbs trail={TRAIL} />
      <header className="mt-3 border-b border-line pb-9">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
          Publishing principles
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
          Editorial standards<span className="text-accent">.</span>
        </h1>
        <p data-speakable className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">
          A label on a CinePixo article is a claim about how it was made. Sources are printed,
          first-hand work explains the test, writers own their bylines, and factual corrections
          remain visible.
        </p>
        <p className="mt-4 font-mono text-xs text-muted">
          Last revised <time dateTime={UPDATED}>August 22, 2026</time>
        </p>
      </header>

      <Section title="One publication, two kinds of writing">
        <p>
          A <strong>review</strong> is a signed argument about one film and carries the writer&rsquo;s
          rating. <strong>Off Camera</strong> is the editorial desk: reported features, craft
          analysis and useful guides that do not carry a score. News is only the beginning of a
          feature; a rewritten announcement is not a CinePixo article.
        </p>
        <p>
          Every public byline links to a <Link href="/writers" className="text-accent hover:opacity-80">writer profile</Link>{" "}
          with that writer&rsquo;s biography and published work. The named writer is accountable for
          the words even when research or production tools helped prepare them.
        </p>
      </Section>

      <Section title="What our format labels promise">
        <dl className="divide-y divide-line border-y border-line">
          {postFormatSchema.options.map((format) => (
            <div key={format} className="grid gap-1 py-4 sm:grid-cols-[12rem_1fr] sm:gap-6">
              <dt className="font-semibold text-accent">{POST_FORMAT_LABELS[format]}</dt>
              <dd className="text-sm leading-relaxed text-foreground/90">
                {POST_FORMAT_BLURBS[format]}
              </dd>
            </div>
          ))}
        </dl>
        <p>
          Comparison criteria must remain consistent. A roundup states why each item qualifies.
          A checklist contains actions a reader can complete. A problem-solving guide gives a
          usable next step. A first-hand guide cannot be published until its method is disclosed.
        </p>
      </Section>

      <Section title="Reporting and sources">
        <p>
          We prefer the closest available evidence: an original document, filing, festival or
          studio notice, direct interview, full transcript or the reporter who did the work.
          Trade and local reporting follow. Aggregators can point us toward a story; they should
          not be the only support when the original is available.
        </p>
        <p>
          Articles making factual claims print their source URLs. Attribution in the prose says
          who reported a disputed or exclusive fact. We distinguish confirmed, announced,
          reported, in talks and rumoured because those words do not mean the same thing.
        </p>
        <p>
          Sources prove the facts; they do not outsource the article&rsquo;s judgment. We do not copy
          or closely paraphrase source prose, and we do not fill gaps in reporting with a plausible
          sentence.
        </p>
      </Section>

      <Section title="First-hand work and method notes">
        <p>
          &ldquo;First hand&rdquo; means the writer actually watched, visited, tested or compared the
          thing described. The article states what was used, the relevant date or version, the
          conditions that could affect the result and important limitations. We never convert
          internet research into a personal experience by changing the pronouns.
        </p>
        <p>
          When a guide is based on desk research instead, it says what was checked and links the
          evidence. That is useful work; it simply is not first-hand work.
        </p>
      </Section>

      <Section title="Reviews, access and independence">
        <p>
          Ratings belong to their writers. Advertising does not determine coverage, conclusions
          or scores, and advertisers do not review copy before publication. A free screener,
          festival credential, supplied ticket, travel, sample or other material access is
          disclosed on the article. If CinePixo paid, a first-hand guide can say that too.
        </p>
        <p>
          Paid placement is not presented as editorial work. Any future sponsored or affiliate
          relationship must be labelled where the reader encounters it, not hidden on a policy
          page.
        </p>
      </Section>

      <Section title="Automation and human responsibility">
        <p>
          Tools may help gather source material, organise notes, check links, prepare images or
          produce an unpublished draft. They cannot provide lived experience, approve their own
          claims or publish themselves. Before publication, a person checks the article against
          its sources, reviews its images and captions, confirms its format label and accepts the
          byline.
        </p>
        <p>
          A generated summary with no original reporting, useful organisation or CinePixo
          judgment does not meet this standard. Volume is never evidence of authority.
        </p>
      </Section>

      <Section title="Corrections and updates">
        <p>
          Minor spelling and style fixes do not receive a note. When a factual claim or a material
          conclusion changes, the article receives a visible correction or revision note and its
          updated date changes. We do not silently rewrite a material error out of the record.
        </p>
        <p>
          Send the page URL, the sentence at issue and supporting evidence to{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent hover:opacity-80">
            {CONTACT_EMAIL}
          </a>
          . Rights and takedown requests use the same address and are described on the{" "}
          <Link href="/contact" className="text-accent hover:opacity-80">contact page</Link>.
        </p>
      </Section>

      <Section title="Images, quotations and reader trust">
        <p>
          Images are uploaded to our own storage, carry alt text, and retain available credit,
          licence and source information. Quotations stay brief, are attributed, and are not used
          to replace the work of the source. Trailers and social posts remain embeds when their
          original context matters.
        </p>
        <p>
          These standards work alongside the <Link href="/terms" className="text-accent hover:opacity-80">Terms of Use</Link>,{" "}
          <Link href="/privacy" className="text-accent hover:opacity-80">Privacy Policy</Link> and{" "}
          <Link href="/about" className="text-accent hover:opacity-80">site description</Link>.
          Questions about how {SITE_NAME} works are welcome.
        </p>
      </Section>

      <ReelDivider className="my-12" />
    </article>
  );
}
