/** The house layout: one hero and at least three photographs in the body. */
export const DEFAULT_MIN_POST_PICTURES = 4;

/** Markdown image rows written by `fill-post-images --body`. */
export function bodyPictureUrls(content: string): string[] {
  return [...content.matchAll(/!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map(
    (match) => match[1],
  );
}

export function bodyPictureCount(content: string): number {
  return bodyPictureUrls(content).length;
}

export function postPictureCount(content: string, hero: string | null | undefined): number {
  return bodyPictureCount(content) + (hero ? 1 : 0);
}

export function minimumPictureMessage(actual: number, minimum: number): string {
  return (
    `this post has ${actual} picture(s); publication requires ${minimum} ` +
    `(one hero plus ${Math.max(0, minimum - 1)} in the body)`
  );
}
