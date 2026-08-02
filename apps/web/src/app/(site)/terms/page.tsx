import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbNode, type Crumb, graph, pageMetadata, webPageNode } from "@/lib/seo";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site";

/**
 * Terms of use. Short on purpose: the only rules worth writing are the ones we
 * would actually enforce, and the important one — you keep what you write — is
 * a promise rather than a restriction.
 */

export const dynamic = "force-dynamic";

const DESCRIPTION =
  "The rules for reading and writing on CinePixo: who owns a review, what gets removed, and the limits of what a fandom site can promise.";

export const metadata: Metadata = pageMetadata({
  path: "/terms",
  title: "Terms of Use",
  description: DESCRIPTION,
});

const TRAIL: Crumb[] = [{ name: "Terms of Use" }];

const UPDATED = "2026-08-02";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-9">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3 text-[0.97rem] leading-relaxed text-foreground/90">
        {children}
      </div>
    </section>
  );
}

export default function TermsPage() {
  const jsonLd = graph(
    webPageNode({
      path: "/terms",
      name: "Terms of Use",
      description: DESCRIPTION,
      hasBreadcrumb: true,
      dateModified: new Date(UPDATED),
    }),
    breadcrumbNode("/terms", TRAIL),
  );

  return (
    <article className="mx-auto max-w-3xl">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Terms of Use</h1>
      <p className="mt-3 text-muted">
        Last updated{" "}
        <time dateTime={UPDATED}>
          {new Date(UPDATED).toLocaleDateString("en-US", { dateStyle: "long" })}
        </time>
        . Using {SITE_NAME} means accepting these terms.
      </p>

      <Section title="Your writing stays yours">
        <p>
          You keep the copyright in every review you publish here. By publishing, you give{" "}
          {SITE_NAME} a non-exclusive licence to display it on the site, in our feeds, and in
          the plain-Markdown versions of each page — nothing more. You can ask for a review to
          be taken down at any time.
        </p>
      </Section>

      <Section title="Write your own reviews">
        <p>
          Publish only criticism you wrote. Text copied from another critic, another site, or
          generated wholesale by a language model and passed off as your reading of a film will
          be removed, and repeat cases end an account. Quoting a film or another critic is
          normal practice; quote briefly and say whose words they are.
        </p>
        <p>
          Images you add to a review must be yours to add — a frame from the film discussed, a
          publicity still, something you made. Do not upload material you have no right to
          publish.
        </p>
      </Section>

      <Section title="What gets removed">
        <p>
          Harassment of another member, or of a filmmaker or critic, as a substitute for
          argument. Content that is unlawful where we operate. Attempts to manipulate ratings
          or the helpful count, including additional accounts made for that purpose. Spam and
          undisclosed paid promotion.
        </p>
        <p>
          Disliking a film intensely is not any of these. A hostile review of a work is
          criticism; a hostile campaign against a person is not.
        </p>
      </Section>

      <Section title="Film data and artwork">
        <p>
          Facts about films and the people who made them come from Wikidata and Wikipedia and
          carry their sources on the page. Posters and stills are shown for identification of
          the work being discussed and remain the property of their rights holders; the credit
          line on each names them. Freely licensed material — public-domain films, Commons
          photographs — is labelled with its licence and a link to its source. If you hold
          rights in something shown here and want it removed, write to us and it will be.
        </p>
      </Section>

      <Section title="Accounts">
        <p>
          Keep your password to yourself; you are responsible for what is published from your
          account. We may suspend an account that breaks these terms, and you may delete yours
          at any time — see the{" "}
          <Link href="/privacy" className="text-accent hover:opacity-80">
            Privacy Policy
          </Link>{" "}
          for what happens to your data when you do.
        </p>
      </Section>

      <Section title="What we cannot promise">
        <p>
          {SITE_NAME} is provided as it is. We do not guarantee that the site is available at
          all times, that imported film data is free of errors, or that any review reflects
          anything but its author&rsquo;s own judgment. Opinions here are the writers&rsquo;,
          not ours.
        </p>
      </Section>

      <Section title="Changes and contact">
        <p>
          If these terms change materially we will update the date above. Questions:{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent hover:opacity-80">
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </article>
  );
}
