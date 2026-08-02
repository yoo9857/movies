import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbNode, type Crumb, graph, ORG_ID, pageMetadata, webPageNode } from "@/lib/seo";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site";

/**
 * A real address a real person answers.
 *
 * A contact page exists so that a rights holder, a reader who found an error,
 * or a reviewer assessing the site can reach someone. A form would be a worse
 * version of an email address: it hides where the message goes.
 */

export const dynamic = "force-dynamic";

const DESCRIPTION = `How to reach ${SITE_NAME} — corrections, rights enquiries, account questions and press.`;

export const metadata: Metadata = pageMetadata({
  path: "/contact",
  title: "Contact",
  description: DESCRIPTION,
});

const TRAIL: Crumb[] = [{ name: "Contact" }];

const REASONS = [
  {
    title: "A correction",
    body: "A wrong credit, a date that does not match the film, a synopsis attached to the wrong picture. Include the page URL and we will fix it.",
  },
  {
    title: "Rights and takedowns",
    body: "If you hold rights in a poster, still, photograph or trailer shown here and want it removed, write to us and it will be — no argument, no form. Every imported file carries its source on the page, which is usually the fastest way to tell us which one you mean.",
  },
  {
    title: "Your account",
    body: "Deletion, a lost password, a review you want taken down. Write from the address on the account so we know it is you.",
  },
  {
    title: "Writing here",
    body: "Anyone can register and publish. If you would rather ask first, or want to propose a series, say so.",
  },
];

export default function ContactPage() {
  const jsonLd = graph(
    webPageNode({
      path: "/contact",
      name: "Contact",
      description: DESCRIPTION,
      kind: "ContactPage",
      hasBreadcrumb: true,
      aboutId: ORG_ID,
    }),
    breadcrumbNode("/contact", TRAIL),
  );

  return (
    <article className="mx-auto max-w-3xl">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Contact</h1>
      <p className="mt-3 max-w-[62ch] text-lg leading-relaxed text-muted">
        One address, read by a person. Most messages are answered within a few days.
      </p>

      <p className="mt-6">
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="inline-block rounded-xl border border-line bg-surface px-5 py-4 font-mono text-lg text-accent transition-colors hover:border-accent-dim"
        >
          {CONTACT_EMAIL}
        </a>
      </p>

      <dl className="mt-10 divide-y divide-line border-y border-line">
        {REASONS.map((r) => (
          <div key={r.title} className="py-5">
            <dt className="font-semibold">{r.title}</dt>
            <dd className="mt-1.5 max-w-[62ch] text-[0.97rem] leading-relaxed text-foreground/90">
              {r.body}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-8 text-sm text-muted">
        See also the{" "}
        <Link href="/about" className="text-accent hover:opacity-80">
          editorial rules
        </Link>
        , the{" "}
        <Link href="/terms" className="text-accent hover:opacity-80">
          Terms of Use
        </Link>{" "}
        and the{" "}
        <Link href="/privacy" className="text-accent hover:opacity-80">
          Privacy Policy
        </Link>
        .
      </p>
    </article>
  );
}
