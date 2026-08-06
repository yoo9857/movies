import { describe, expect, it } from "vitest";
import { dropEmptySections } from "@/lib/post-body";

/**
 * The bug these exist for: the regex written to drop a picture-less section,
 * `^##[^\n]*\n+(?=##|\s*$)` with the `m` flag, deleted **every** heading in a
 * piece the first time it ran for real — `\s*$` matches vastly more than an
 * empty section. The prose survived; the structure did not, and the next pass
 * then refused to place anything because the headings it aimed at were gone.
 */
describe("dropEmptySections", () => {
  it("leaves a piece whose sections all have prose completely alone", () => {
    const md = ["## One", "", "Body of one.", "", "## Two", "", "Body of two."].join("\n");
    expect(dropEmptySections(md)).toBe(md);
  });

  it("drops a heading with nothing under it", () => {
    const md = ["## One", "", "Body.", "", "## Gallery", "", "## Two", "", "More."].join("\n");
    expect(dropEmptySections(md)).not.toContain("## Gallery");
    expect(dropEmptySections(md)).toContain("## One");
    expect(dropEmptySections(md)).toContain("## Two");
  });

  it("drops a trailing heading left with nothing after it", () => {
    const md = ["## One", "", "Body.", "", "## Gallery", "", ""].join("\n");
    expect(dropEmptySections(md)).not.toContain("## Gallery");
    expect(dropEmptySections(md)).toContain("Body.");
  });

  it("keeps a heading whose section is one short line", () => {
    const md = ["## One", "", "Body.", "", "## Two", "", "x"].join("\n");
    expect(dropEmptySections(md)).toContain("## Two");
  });

  it("does not touch a level-three heading or a hash inside prose", () => {
    const md = ["## One", "", "### Sub", "", "Body #1 here."].join("\n");
    expect(dropEmptySections(md)).toBe(md);
  });
});
