import { prisma } from "@cinepixo/db";
import { gatherPhotos } from "@/lib/gather-sources";
import { fetchRemoteImage, processImage } from "@/lib/media/image";
import { buildKey, putPublicObject } from "@/lib/media/storage";

/**
 * Searches licensed image sources for the subjects of a post and attaches the
 * first editorially suitable result. Social screenshots are deliberately not
 * part of this path: publishing needs a reusable, attributable image.
 */
export async function autoAttachPostHero(postId: string) {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: {
      people: { orderBy: { sort: "asc" }, select: { person: { select: { name: true } } } },
      movies: { orderBy: { sort: "asc" }, select: { movie: { select: { title: true, releaseDate: true } } } },
    },
  });
  if (!post) return null;

  const queries = [
    ...post.people.map(({ person }) => ({ query: person.name, alt: person.name })),
    ...post.movies.map(({ movie }) => ({
      query: movie.title,
      alt: `${movie.title}${movie.releaseDate ? ` (${movie.releaseDate.getUTCFullYear()})` : ""}`,
    })),
  ];

  for (const subject of queries) {
    const photo = (await gatherPhotos(subject.query, 1, 1200, subject.query))[0];
    if (!photo) continue;
    try {
      const processed = await processImage(await fetchRemoteImage(photo.url), { fullWidth: 1600 });
      const image = await putPublicObject(buildKey("posts", processed.ext), processed.full.data, processed.contentType);
      const data = {
        image,
        imageAlt: subject.alt.slice(0, 300),
        imageCredit: photo.credit,
        imageLicense: photo.license,
        imageLicenseUrl: photo.licenseUrl,
        imageSourceUrl: photo.sourceUrl,
      };
      await prisma.post.update({ where: { id: postId }, data });
      return { ...data, foundFor: subject.query, photoTitle: photo.title };
    } catch {
      // A failed rendition is not a reason to stop trying the next subject.
    }
  }

  return null;
}
