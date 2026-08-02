import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { JsonLd } from "@/components/JsonLd";
import type { JsonLdNode } from "@/lib/seo";

/**
 * The one XSS sink in the codebase.
 *
 * JSON-LD is injected with dangerouslySetInnerHTML, and JSON.stringify does not
 * escape for HTML — so a review title is attacker-controlled text landing
 * inside a <script> body. These tests pin the escaping.
 */

// The component reads the request's nonce, so it is async and there is no
// request here. Awaiting it returns the element, which renders synchronously.
const NONCE = "nonce-for-test";
vi.mock("next/headers", () => ({
  headers: async () => new Map([["x-nonce", NONCE]]),
}));

const render = async (data: JsonLdNode) => renderToStaticMarkup(await JsonLd({ data }));

// Built with fromCharCode on purpose. These two are invisible in an editor and
// do not survive every tool that touches a source file; a test that silently
// lost them would keep passing while checking nothing.
const LS = String.fromCharCode(0x2028); // LINE SEPARATOR
const PS = String.fromCharCode(0x2029); // PARAGRAPH SEPARATOR

/** The text inside the rendered <script>, exactly as it reaches the browser. */
async function scriptBody(data: JsonLdNode): Promise<string> {
  const html = await render(data);
  const m = /<script[^>]*>([\s\S]*)<\/script>/.exec(html);
  expect(m, `no script tag in: ${html}`).not.toBeNull();
  return m![1];
}

const node = (name: string) => ({ "@type": "Review", name }) as unknown as JsonLdNode;

describe("JsonLd escaping", () => {
  it("cannot be escaped with a closing script tag", async () => {
    const body = await scriptBody(node("</script><script>alert(1)</script>"));
    // Nothing a parser would read as a tag boundary survives.
    expect(body).not.toContain("</script>");
    expect(body).not.toContain("<script>");
    expect(body).not.toContain("<");
    expect(body).not.toContain(">");
  });

  it("escapes <, > and & as backslash-uXXXX", async () => {
    const body = await scriptBody(node("a < b > c & d"));
    expect(body).toContain("\\u003c");
    expect(body).toContain("\\u003e");
    expect(body).toContain("\\u0026");
  });

  it("escapes U+2028 and U+2029, which end a statement inside a script body", async () => {
    // JSON.stringify leaves these raw: legal in a JSON string, fatal in a script.
    const body = await scriptBody(node(`a${LS}b${PS}c`));
    expect(body).toContain("\\u2028");
    expect(body).toContain("\\u2029");
    expect(body).not.toContain(LS);
    expect(body).not.toContain(PS);
  });

  it("stays valid JSON that parses back to the original characters", async () => {
    // The escapes must be lossless — a crawler has to read the real title.
    const accented = String.fromCharCode(0xfc) + "n" + String.fromCharCode(0xef) + "code";
    const korean = String.fromCharCode(0xae30, 0xc0dd, 0xcda9);
    const name = `</script> a < b > c & d ${LS}${PS} ${accented} ${korean}`;
    const parsed = JSON.parse(await scriptBody(node(name)));
    expect(parsed.name).toBe(name);
  });

  it("escapes hostile text nested deep in the graph", async () => {
    const body = await scriptBody({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "Movie", name: "ok" },
        { "@type": "Review", reviewBody: "</script><img src=x onerror=alert(1)>" },
      ],
    } as unknown as JsonLdNode);
    expect(body).not.toContain("</script>");
    expect(body).not.toContain("onerror=alert(1)>");
    // ...but the real text is still recoverable by a parser.
    expect(JSON.parse(body)["@graph"][1].reviewBody).toContain("</script>");
  });

  it("emits exactly one script element", async () => {
    const html = await render(node("x"));
    expect(html.match(/<script/g)).toHaveLength(1);
    expect(html).toContain('type="application/ld+json"');
  });

  it("carries the request's nonce", async () => {
    // Under the nonce-based policy (lib/csp.ts) 'unsafe-inline' is ignored, so
    // an unnonced ld+json block is one a strict browser drops — silently, on
    // every page, while the crawlers that actually read it never notice.
    expect(await render(node("x"))).toContain(`nonce="${NONCE}"`);
  });
});
