// The only place structured data reaches the DOM.
//
// Serialising untrusted strings into a <script> body is an XSS sink: a review
// title containing "</script>" would end the element and everything after it
// becomes markup. JSON.stringify does not escape for HTML, so we do — and doing
// it here, once, means no page can forget.
import type { JsonLdNode } from "@/lib/seo";

// `<` and `>` close tags, `&` starts an entity, and U+2028/U+2029 are legal
// inside a JSON string but count as line terminators inside a script body, which
// ends the statement early. All five survive as \uXXXX escapes, which every JSON
// parser reads back as the original character.
//
// The separators are spelled as escape sequences, not pasted literally: a regex
// literal may not contain a LineTerminator, and U+2028/U+2029 are exactly that
// to the JS parser — the literal form is a syntax error, not a style choice.
const NEEDS_ESCAPE = new RegExp("[<>&\u2028\u2029]", "g");

function serialize(data: JsonLdNode): string {
  return JSON.stringify(data).replace(
    NEEDS_ESCAPE,
    (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

/**
 * One `<script type="application/ld+json">` per page, holding a single `@graph`
 * built by the helpers in `lib/seo`. Crawlers merge multiple blocks fine, but a
 * single graph is what lets nodes reference each other by `@id`.
 */
export function JsonLd({ data }: { data: JsonLdNode }) {
  return (
    <script
      type="application/ld+json"
      // escaped above — the only safe way to emit JSON-LD
      dangerouslySetInnerHTML={{ __html: serialize(data) }}
    />
  );
}
