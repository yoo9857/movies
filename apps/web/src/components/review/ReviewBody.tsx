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
import { TrailerEmbed } from "../TrailerEmbed";
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
  p: ({ children }) => <p>{withHighlights(children)}</p>,
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
      className="my-8 w-full rounded-xl border border-line"
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
