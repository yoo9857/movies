import { prisma } from "@cinepixo/db";
import { handle, json } from "@/lib/api";

export const GET = handle(async () => {
  const movies = await prisma.movie.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      tmdbId: true,
      title: true,
      posterPath: true,
      releaseDate: true,
      director: true,
      genres: true,
    },
  });
  return json({ movies });
});
