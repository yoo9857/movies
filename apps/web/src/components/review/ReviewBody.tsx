// Renders a review's markdown with CinePixo's authoring primitives.
//
// Raw HTML is never enabled — every extension below is implemented by
// splitting the source into blocks and handing each block to react-markdown,
// so nothing an author types can inject markup.
//
//   :::spoiler … :::   a region covered until the reader reveals it
//   :::trailer         the linked film's trailer, inline in the argument
//   :::still 2         still #2 from the film, full width
//   ==text==           highlighted phrase
//   > line             pull quote (set large, used as a section beat)
//
import type { Element } from "hast";
import Image from "next/image";
import { Fragment, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
// CommonMark's emphasis flanking rules were written for space-delimited
// languages: `**대박!**은` fails to bold because the closing `**` sits between
// punctuation and a Hangul letter. These two make emphasis and strikethrough
// resolve the way a Korean or Japanese author expects. They change nothing for
// English text.
import remarkCjkFriendly from "remark-cjk-friendly";
import remarkCjkFriendlyGfmStrikethrough from "remark-cjk-friendly-gfm-strikethrough";
import remarkGfm from "remark-gfm";
import { headingSlug } from "@cinepixo/shared";
import { instagramEmbedUrl, xStatusId, youtubeVideoId } from "@/lib/post-image-sources";
import { SocialEmbed } from "../SocialEmbed";
import { TrailerEmbed } from "../TrailerEmbed";
import { VideoEmbed } from "../VideoEmbed";
import { Spoiler } from "./Spoiler";

export interface ReviewMedia {
  title: string;
  trailerKey: string | null;
  stills: string[];
}

type Block =
  | { kind: "md"; text: string }
  | { kind: "spoiler"; text: string }
  | { kind: "trailer" }
  | { kind: "still"; index: number };

// Split on ::: directives at the start of a line.
function parse(source: string): Block[] {
  const lines = source.split("\n");
  const blocks: Block[] = [];
  let buf: string[] = [];
  let spoiler: string[] | null = null;

  const flush = () => {
    if (buf.join("").trim()) blocks.push({ kind: "md", text: buf.join("\n") });
    buf = [];
  };

  for (const line of lines) {
    const open = /^:::\s*(spoiler|trailer|still)\s*(\d+)?\s*$/i.exec(line.trim());

    if (spoiler !== null) {
      if (line.trim() === ":::") {
        blocks.push({ kind: "spoiler", text: spoiler.join("\n") });
        spoiler = null;
      } else {
        spoiler.push(line);
      }
      continue;
    }

    if (open) {
      const kind = open[1].toLowerCase();
      flush();
      if (kind === "spoiler") spoiler = [];
      else if (kind === "trailer") blocks.push({ kind: "trailer" });
      else blocks.push({ kind: "still", index: Math.max(1, Number(open[2] ?? 1)) - 1 });
      continue;
    }

    buf.push(line);
  }

  // an unterminated spoiler still gets covered rather than leaking
  if (spoiler !== null && spoiler.join("").trim()) {
    blocks.push({ kind: "spoiler", text: spoiler.join("\n") });
  }
  flush();
  return blocks;
}

/**
 * `==highlight==` → `<mark>`, on text only.
 *
 * The first version wrapped every child of a paragraph in a `<span>` to give it
 * a key, which meant a sentence with one italic word came out as
 * `<p><span>In </span><span><em>Parasite</em></span><span> the…</span></p>`:
 * meaningless elements around every phrase, which bloats the document and
 * defeats any CSS written against `p > em` or an adjacent sibling. Elements now
 * pass through untouched and only strings are rewritten.
 */
function markUp(text: string): ReactNode {
  const parts = text.split(/==([^=]+)==/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="rounded bg-accent/20 px-1 text-accent">
        {part}
      </mark>
    ) : (
      // A Fragment, not a span: it carries the key without entering the DOM.
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

function withHighlights(children: ReactNode): ReactNode {
  if (typeof children === "string") return markUp(children);
  if (Array.isArray(children)) {
    return children.map((child, i) =>
      typeof child === "string" ? <Fragment key={i}>{markUp(child)}</Fragment> : child,
    );
  }
  return children;
}

function headingText(children: ReactNode): string {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) return children.map(headingText).join("");
  return "";
}

/**
 * A paragraph that is nothing but a pasted URL — link text equal to the
 * href — is a request to embed. A written link (`[the video](url)`, or a URL
 * inside a sentence) stays a link: the author chose words, so the words
 * stand. This is the whole embed syntax on purpose — it survives the Tiptap
 * round-trip (which may rewrite `<url>` as `[url](url)`, leaving
 * text === href) and degrades to a plain link in the `.md` renditions and
 * anywhere else the components don't run.
 */
function soloLinkHref(node: Element | undefined): string | null {
  if (!node) return null;
  const kids = node.children.filter((c) => !(c.type === "text" && !c.value.trim()));
  if (kids.length !== 1) return null;
  const a = kids[0];
  if (a.type !== "element" || a.tagName !== "a") return null;
  const href = typeof a.properties?.href === "string" ? a.properties.href : null;
  if (!href) return null;
  const label = a.children.length === 1 && a.children[0].type === "text" ? a.children[0].value : null;
  return label === href ? href : null;
}

/**
 * Is this paragraph a photo credit rather than a sentence of the piece?
 *
 * The house convention, written by `fill-post-images --body`: one emphasis
 * run opening with "Photo:" or "Photos:". Recognised so it can be set at
 * caption scale — a licence line at body size competes with the prose it
 * belongs to, which is the readability problem this exists to fix. In the
 * `.md` renditions it stays ordinary emphasis, which is what a credit should
 * degrade to.
 */
function isCreditLine(node: Element | undefined): boolean {
  if (!node) return false;
  const kids = node.children.filter((c) => !(c.type === "text" && !c.value.trim()));
  if (kids.length !== 1) return false;
  const em = kids[0];
  if (em.type !== "element" || (em.tagName !== "em" && em.tagName !== "i")) return false;
  const first = em.children[0];
  return first?.type === "text" && /^Photos?:/.test(first.value.trimStart());
}

/**
 * How many pictures a paragraph is made of, ignoring the whitespace between
 * them. Two or more set side by side — `![a](x)` and `![b](y)` on consecutive
 * lines of one paragraph is the whole syntax, so a pair survives the editor
 * round-trip and degrades to stacked pictures wherever these components do
 * not run.
 */
function imageCount(node: Element | undefined): number {
  if (!node) return 0;
  const kids = node.children.filter((c) => !(c.type === "text" && !c.value.trim()));
  return kids.every((c) => c.type === "element" && c.tagName === "img") ? kids.length : 0;
}

/**
 * What a pasted URL embeds as: YouTube's click-to-load player, or an X /
 * Instagram post served by the platform's own embed endpoint — showing a
 * post where the platform offers to show it, which is the sanctioned
 * opposite of copying its picture out. Everything else — including these
 * hosts' profile and search pages — stays a link.
 */
function embedFor(href: string): ReactNode | null {
  const video = youtubeVideoId(href);
  if (video) return <VideoEmbed youtubeKey={video} title="YouTube video" />;

  const status = xStatusId(href);
  if (status) {
    return (
      <SocialEmbed
        src={`https://platform.twitter.com/embed/Tweet.html?id=${status}`}
        network="X"
        height={560}
      />
    );
  }

  const instagram = instagramEmbedUrl(href);
  if (instagram) return <SocialEmbed src={instagram} network="Instagram" height={640} />;

  return null;
}

const components: Components = {
  h2: ({ children }) => (
    <h2 id={headingSlug(headingText(children))} className="scroll-mt-24">
      {withHighlights(children)}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 id={headingSlug(headingText(children))} className="scroll-mt-24">
      {withHighlights(children)}
    </h3>
  ),
  p: ({ node, children }) => {
    const href = soloLinkHref(node);
    const embed = href ? embedFor(href) : null;
    if (embed) {
      return <div className="my-8 not-prose flex justify-center">{embed}</div>;
    }
    // Two or more pictures in one paragraph are a row, not a stack. Heights
    // are left alone rather than cropped to match: a tidy grid is not worth
    // slicing the top off someone's head.
    if (imageCount(node) >= 2) {
      return (
        <div className="mt-8 mb-2 not-prose grid items-start gap-3 sm:grid-cols-2 [&>img]:my-0">
          {children}
        </div>
      );
    }
    if (isCreditLine(node)) return <p className="cx-credit">{children}</p>;
    return <p>{withHighlights(children)}</p>;
  },
  li: ({ children }) => <li>{withHighlights(children)}</li>,
  // Blockquotes are the review's section beats — set large, not indented prose.
  blockquote: ({ children }) => (
    <blockquote className="cx-pullquote">{withHighlights(children)}</blockquote>
  ),
  a: ({ href, children }) => {
    const external = !!href && /^https?:\/\//.test(href);
    return (
      <a
        href={href}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {children}
      </a>
    );
  },
  // Author-uploaded images: `![alt](url)`. Framed like the film stills so a
  // review mixing both reads as one piece. Plain <img>, not next/image — the
  // markdown carries no dimensions, and uploads are already resized and served
  // immutable, so there is nothing left for the optimizer to add. Lazy: images
  // sit mid-essay, below the fold more often than not.
  img: ({ src, alt }) => (
    // eslint-disable-next-line @next/next/no-img-element -- deliberate: see above
    <img
      src={typeof src === "string" ? src : undefined}
      alt={alt ?? ""}
      loading="lazy"
      decoding="async"
      // Asymmetric on purpose: the credit that follows belongs to this
      // picture, so the gap below is small and the next paragraph's is not.
      className="mt-8 mb-2 w-full rounded-xl border border-line"
    />
  ),
};

function Md({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkCjkFriendly, remarkCjkFriendlyGfmStrikethrough]}
      components={components}
    >
      {text}
    </ReactMarkdown>
  );
}

/**
 * The same renderer, for house prose that is not a review body — a topic's
 * essay, for one. The `:::` directives are review-only and deliberately not
 * parsed here: a theme's essay has no film to pull a still or a trailer from.
 *
 * This exists because the topic page printed its essay as preformatted text
 * while the admin form promised Markdown and the .md export shipped Markdown —
 * so an author who wrote `**this**` saw asterisks on the page and bold
 * everywhere else.
 */
export function MarkdownProse({ text }: { text: string }) {
  return (
    <div className="prose-review">
      <Md text={text} />
    </div>
  );
}

export function ReviewBody({ content, media }: { content: string; media: ReviewMedia }) {
  const blocks = parse(content);

  return (
    <div className="prose-review">
      {blocks.map((b, i) => {
        if (b.kind === "md") return <Md key={i} text={b.text} />;
        if (b.kind === "spoiler")
          return (
            <Spoiler key={i}>
              <div className="prose-review">
                <Md text={b.text} />
              </div>
            </Spoiler>
          );
        if (b.kind === "trailer")
          return media.trailerKey ? (
            <div key={i} className="my-8 not-prose">
              <TrailerEmbed youtubeKey={media.trailerKey} title={media.title} />
            </div>
          ) : null;
        const still = media.stills[b.index];
        // Only stills on our own origin render; the CDN paths this directive
        // used to point at are retired with the rest of TMDB (2026-07-31).
        return still && still.startsWith("/") ? (
          <figure key={i} className="my-8">
            <Image
              src={still}
              alt={`${media.title} still`}
              width={780}
              height={439}
              className="w-full rounded-xl border border-line"
            />
          </figure>
        ) : null;
      })}
    </div>
  );
}
