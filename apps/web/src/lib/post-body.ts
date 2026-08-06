/**
 * Shaping a post's Markdown, as pure functions.
 *
 * Here rather than in the script that uses them so a test can import them
 * without running a CLI's `main()` — and because the one below has already
 * proved it needs pinning.
 */

/**
 * Drop a `##` heading that now has nothing under it.
 *
 * A `--heading` section whose pictures have all been removed is a promise of
 * something that is no longer there. Done by walking lines rather than with a
 * regex: the regex written for this — `^##[^\n]*\n+(?=##|\s*$)` under the `m`
 * flag — matches far more than an empty section, and deleted every heading in
 * a piece the first time it ran for real. The prose survived; the structure
 * did not, and the next pass then had nothing to aim its pictures at.
 */
export function dropEmptySections(markdown: string): string {
  const lines = markdown.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("## ")) {
      out.push(lines[i]);
      continue;
    }
    // Look past blank lines: if the next thing is another heading or the end
    // of the piece, this heading introduces nothing.
    let j = i + 1;
    while (j < lines.length && !lines[j].trim()) j++;
    if (j >= lines.length || lines[j].startsWith("## ")) i = j - 1;
    else out.push(lines[i]);
  }
  return out.join("\n");
}
