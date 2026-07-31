/**
 * XSL stylesheets for the machine files.
 *
 * A sitemap or a feed opened in a browser is raw XML with a warning that it
 * "does not appear to have any style information" — which reads as broken to
 * anyone who is not a crawler. An `xml-stylesheet` instruction fixes that: the
 * same bytes stay a strict, standards-valid machine file, and a browser renders
 * them as a page in the house style. Crawlers ignore the instruction entirely.
 *
 * Served by route handlers rather than /public because the MIME type matters:
 * browsers refuse to apply an XSLT served as octet-stream.
 *
 * XSLT 1.0 only — that is what browsers implement.
 */

/** The shared page chrome: ink field, projector gold, the bubble mark. */
const SHELL_CSS = `
  :root { color-scheme: dark; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #0b0b0f; color: #ecebe8;
    font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    padding: 40px 24px 64px;
  }
  .wrap { max-width: 880px; margin: 0 auto; }
  .marklogo { width: 44px; height: 44px; margin-right: 14px; flex: none; }
  h1 { font-size: 24px; font-weight: 700; letter-spacing: -.5px; display: flex; align-items: center; }
  h1 .gold { color: #e8b34b; }
  .sub { color: #9b99a3; margin-top: 6px; font-size: 13px; }
  .sub a { color: #e8b34b; }
  .meta { font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; font-size: 11px;
          text-transform: uppercase; letter-spacing: .14em; color: #9b99a3; margin: 28px 0 10px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-family: ui-monospace, Consolas, monospace; font-size: 10px;
       text-transform: uppercase; letter-spacing: .12em; color: #9b99a3;
       padding: 8px 10px; border-bottom: 1px solid #26262f; }
  td { padding: 9px 10px; border-bottom: 1px solid #1a1a22; font-size: 14px; vertical-align: baseline; }
  tr:hover td { background: #14141b; }
  a { color: #ecebe8; text-decoration: none; }
  a:hover { color: #e8b34b; }
  .path { word-break: break-all; }
  .path .origin { color: #55535e; }
  .mono { font-family: ui-monospace, Consolas, monospace; font-size: 12px; color: #9b99a3; white-space: nowrap; }
  .folder { font-size: 15px; font-weight: 600; }
  .folder .mark { color: #e8b34b; margin-right: 10px; }
  .badge { display: inline-block; font-family: ui-monospace, Consolas, monospace; font-size: 11px;
           color: #e8b34b; border: 1px solid #3a3524; border-radius: 999px; padding: 1px 9px; }
  .foot { margin-top: 36px; color: #55535e; font-size: 12px; }
`;

/**
 * One stylesheet for both shapes: a `<sitemapindex>` renders as a folder
 * listing, a `<urlset>` as a table of pages. Same file, so the browser caches
 * one stylesheet across the whole tree.
 */
export const SITEMAP_XSL = `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
  exclude-result-prefixes="sm image">
<xsl:output method="html" encoding="UTF-8" indent="yes"/>

<xsl:template match="/">
<html lang="en">
<head>
  <title>Sitemap - CinePixo</title>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <style>${SHELL_CSS}</style>
</head>
<body>
  <div class="wrap">
    <h1>
      <img class="marklogo" src="/logo.png" alt=""/>
      <span>Cine<span class="gold">Pixo</span>&#160;&#8212;&#160;Sitemap</span>
    </h1>
    <p class="sub">
      A machine file, styled for the humans who open it. Crawlers read the XML underneath;
      the canonical entry point is <a href="/sitemap.xml">/sitemap.xml</a>.
    </p>
    <xsl:apply-templates select="sm:sitemapindex"/>
    <xsl:apply-templates select="sm:urlset"/>
    <p class="foot">Served by CinePixo &#183; every URL listed here is public and indexable.</p>
  </div>
</body>
</html>
</xsl:template>

<!-- The index: each child sitemap as a folder. -->
<xsl:template match="sm:sitemapindex">
  <p class="meta">Sections &#183; <xsl:value-of select="count(sm:sitemap)"/></p>
  <table>
    <tr><th>Section</th><th>Last updated</th></tr>
    <xsl:for-each select="sm:sitemap">
      <tr>
        <td class="folder">
          <span class="mark">&#9656;</span>
          <a href="{sm:loc}">
            <xsl:call-template name="basename">
              <xsl:with-param name="path" select="sm:loc"/>
            </xsl:call-template>
          </a>
        </td>
        <td class="mono"><xsl:value-of select="substring(sm:lastmod, 1, 10)"/></td>
      </tr>
    </xsl:for-each>
  </table>
</xsl:template>

<!-- A section: each URL as a row. -->
<xsl:template match="sm:urlset">
  <p class="meta">
    URLs &#183; <xsl:value-of select="count(sm:url)"/>
    <xsl:if test="count(sm:url/image:image) &gt; 0">
      &#160;&#183;&#160;images &#183; <xsl:value-of select="count(sm:url/image:image)"/>
    </xsl:if>
  </p>
  <table>
    <tr><th>URL</th><th>Last modified</th><th>Priority</th><th>Images</th></tr>
    <xsl:for-each select="sm:url">
      <tr>
        <td class="path">
          <a href="{sm:loc}"><xsl:value-of select="sm:loc"/></a>
        </td>
        <td class="mono"><xsl:value-of select="substring(sm:lastmod, 1, 10)"/></td>
        <td class="mono"><xsl:value-of select="sm:priority"/></td>
        <td class="mono">
          <xsl:if test="count(image:image) &gt; 0">
            <span class="badge"><xsl:value-of select="count(image:image)"/></span>
          </xsl:if>
        </td>
      </tr>
    </xsl:for-each>
  </table>
</xsl:template>

<!-- "…/sitemaps/reviews.xml" -> "reviews" -->
<xsl:template name="basename">
  <xsl:param name="path"/>
  <xsl:choose>
    <xsl:when test="contains($path, '/')">
      <xsl:call-template name="basename">
        <xsl:with-param name="path" select="substring-after($path, '/')"/>
      </xsl:call-template>
    </xsl:when>
    <xsl:otherwise>
      <xsl:value-of select="substring-before($path, '.xml')"/>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

</xsl:stylesheet>
`;

/** The RSS feed as a readable page: the pieces, newest first. */
export const FEED_XSL = `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:media="http://search.yahoo.com/mrss/"
  exclude-result-prefixes="dc media">
<xsl:output method="html" encoding="UTF-8" indent="yes"/>

<xsl:template match="/">
<html lang="en">
<head>
  <title><xsl:value-of select="/rss/channel/title"/> - Feed</title>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <style>${SHELL_CSS}
    .item { border-bottom: 1px solid #1a1a22; padding: 18px 0; }
    .item h2 { font-size: 17px; font-weight: 600; letter-spacing: -.2px; }
    .item .byline { font-family: ui-monospace, Consolas, monospace; font-size: 11px;
                    color: #9b99a3; margin-top: 4px; }
    .item .rating { color: #e8b34b; }
    .item p.desc { color: #9b99a3; margin-top: 8px; font-size: 14px; }
    .hint { border: 1px solid #26262f; border-radius: 10px; padding: 12px 16px;
            margin-top: 20px; color: #9b99a3; font-size: 13px; }
    .hint code { color: #e8b34b; font-family: ui-monospace, Consolas, monospace; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>
      <img class="marklogo" src="/logo.png" alt=""/>
      <span>Cine<span class="gold">Pixo</span>&#160;&#8212;&#160;RSS</span>
    </h1>
    <p class="sub"><xsl:value-of select="/rss/channel/description"/></p>
    <div class="hint">
      This is an RSS feed. Paste <code><xsl:value-of select="/rss/channel/*[local-name()='link' and @rel='self']/@href"/></code>
      into a feed reader to follow new reviews; this page is only how it looks in a browser.
    </div>
    <p class="meta">Latest reviews &#183; <xsl:value-of select="count(/rss/channel/item)"/></p>
    <xsl:for-each select="/rss/channel/item">
      <div class="item">
        <h2><a href="{link}"><xsl:value-of select="title"/></a></h2>
        <p class="byline">
          <span class="rating"><xsl:value-of select="media:rating"/></span>
          &#160;&#183;&#160;<xsl:value-of select="dc:creator"/>
          &#160;&#183;&#160;<xsl:value-of select="substring(pubDate, 1, 16)"/>
        </p>
        <p class="desc"><xsl:value-of select="description"/></p>
      </div>
    </xsl:for-each>
    <p class="foot">Reviews are signed; quote the author, not the site.</p>
  </div>
</body>
</html>
</xsl:template>

</xsl:stylesheet>
`;

/** Serve an XSL with the MIME type browsers require for transforms. */
export function xslResponse(body: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "application/xslt+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
