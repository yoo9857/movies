import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbNode, type Crumb, graph, pageMetadata, webPageNode } from "@/lib/seo";
import { CONTACT_EMAIL, SITE_NAME, SITE_URL } from "@/lib/site";

/**
 * The privacy policy, written to be true rather than to be long.
 *
 * Every claim here describes something the code actually does: the session
 * cookie set in `lib/auth.ts`, the view counter incremented on a review page,
 * the third-party frames the CSP admits. A policy that promises less than the
 * software does is the only kind worth publishing — and an ad network's review
 * reads this page before it reads any other.
 */

export const dynamic = "force-dynamic";

const DESCRIPTION =
  "What CinePixo stores, what it does not, and which third parties can set cookies here — written to match what the software actually does.";

export const metadata: Metadata = pageMetadata({
  path: "/privacy",
  title: "Privacy Policy",
  description: DESCRIPTION,
});

const TRAIL: Crumb[] = [{ name: "Privacy Policy" }];

/** Last substantive revision. Bump when the policy changes, not on deploys. */
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

export default function PrivacyPage() {
  const jsonLd = graph(
    webPageNode({
      path: "/privacy",
      name: "Privacy Policy",
      description: DESCRIPTION,
      hasBreadcrumb: true,
      dateModified: new Date(UPDATED),
    }),
    breadcrumbNode("/privacy", TRAIL),
  );

  return (
    <article className="mx-auto max-w-3xl">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Privacy Policy</h1>
      <p className="mt-3 text-muted">
        Last updated{" "}
        <time dateTime={UPDATED}>
          {new Date(UPDATED).toLocaleDateString("en-US", { dateStyle: "long" })}
        </time>
        . This policy covers {SITE_NAME} at{" "}
        <span className="font-mono text-sm">{SITE_URL.replace(/^https?:\/\//, "")}</span>.
      </p>

      <Section title="What we collect">
        <p>
          <strong>If you only read:</strong> nothing that identifies you. We keep a per-review
          view count, which is a single number on the review and is not tied to any visitor.
          Our web server records ordinary access logs — IP address, time, the page requested,
          browser user-agent — which exist to operate the site and are rotated and discarded.
        </p>
        <p>
          <strong>If you hold an account:</strong> the email address and username you gave us,
          a password stored only as a scrypt hash (we cannot read your password), the reviews
          and ratings you publish, and which reviews you marked helpful. Your display name,
          avatar and biography are shown publicly because a signed review is the point of the
          site.
        </p>
      </Section>

      <Section title="Cookies">
        <p>
          We set one cookie of our own: a session cookie, issued when you log in, which holds
          a signed token and nothing else. It is <span className="font-mono text-sm">httpOnly</span>{" "}
          and <span className="font-mono text-sm">SameSite=Lax</span>, so it cannot be read by
          scripts and is not sent from other sites. Log out and it is gone. We run no
          analytics cookies and no tracking pixels of our own.
        </p>
      </Section>

      <Section title="Advertising and third parties">
        <p>
          {SITE_NAME} serves advertising through Google AdSense. Google and its partners use
          cookies and similar technologies to serve ads based on your prior visits to this and
          other websites, and to measure whether an ad was seen or clicked.
        </p>
        <ul className="ml-5 list-disc space-y-2">
          <li>
            Google&rsquo;s use of advertising cookies enables it and its partners to serve ads
            to you based on your visit to this site and other sites on the internet.
          </li>
          <li>
            You can opt out of personalised advertising at{" "}
            <a
              href="https://www.google.com/settings/ads"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:opacity-80"
            >
              Google Ads Settings
            </a>
            , or opt out of third-party vendors&rsquo; cookies at{" "}
            <a
              href="https://www.aboutads.info/choices/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:opacity-80"
            >
              aboutads.info
            </a>
            .
          </li>
          <li>
            Google&rsquo;s own terms are set out in the{" "}
            <a
              href="https://policies.google.com/technologies/partner-sites"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:opacity-80"
            >
              Google Privacy &amp; Terms
            </a>
            .
          </li>
        </ul>
        <p>
          Two other third parties can be contacted by your browser while you read. Trailers
          play through <strong>YouTube&rsquo;s privacy-enhanced domain</strong> (
          <span className="font-mono text-sm">youtube-nocookie.com</span>), and nothing is
          requested from it until you press play. Some artwork and video we host ourselves;
          where a file still comes from Wikimedia it is fetched by your browser from
          Wikimedia&rsquo;s servers, which have their own privacy policy.
        </p>
      </Section>

      <Section title="If you are in the EEA, the UK or Switzerland">
        <p>
          Where consent is required for advertising and analytics cookies, you are asked before
          any such cookie is set, and you can change or withdraw that choice at any time. Ads
          shown without consent are non-personalised. You have the right to ask what we hold
          about you, to correct it, to have it deleted, and to object to processing — write to
          the address below and we will answer.
        </p>
      </Section>

      <Section title="What we never do">
        <p>
          We do not sell personal information. We do not share your email address with anyone.
          We do not attempt to identify readers who are not logged in, and we do not build
          profiles of them ourselves.
        </p>
      </Section>

      <Section title="Children">
        <p>
          {SITE_NAME} is not directed to children under 13, and we do not knowingly collect
          information from them. If you believe a child has created an account, write to us and
          it will be removed.
        </p>
      </Section>

      <Section title="Deleting your account">
        <p>
          Write to us from the address on the account and we will delete it, along with your
          email address and password hash. Reviews you published are part of the public record
          of a discussion; tell us if you want them removed as well and we will remove them
          too.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about this policy, or about anything we hold:{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent hover:opacity-80">
            {CONTACT_EMAIL}
          </a>
          . See also our{" "}
          <Link href="/terms" className="text-accent hover:opacity-80">
            Terms of Use
          </Link>{" "}
          and{" "}
          <Link href="/about" className="text-accent hover:opacity-80">
            editorial rules
          </Link>
          .
        </p>
      </Section>
    </article>
  );
}
