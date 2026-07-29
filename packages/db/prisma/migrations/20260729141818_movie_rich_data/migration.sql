-- AlterTable
ALTER TABLE "Movie" ADD COLUMN "budget" REAL;
ALTER TABLE "Movie" ADD COLUMN "certification" TEXT;
ALTER TABLE "Movie" ADD COLUMN "countries" TEXT;
ALTER TABLE "Movie" ADD COLUMN "imdbId" TEXT;
ALTER TABLE "Movie" ADD COLUMN "keywords" TEXT;
ALTER TABLE "Movie" ADD COLUMN "popularity" REAL;
ALTER TABLE "Movie" ADD COLUMN "revenue" REAL;
ALTER TABLE "Movie" ADD COLUMN "tagline" TEXT;
ALTER TABLE "Movie" ADD COLUMN "trailerKey" TEXT;
ALTER TABLE "Movie" ADD COLUMN "voteAverage" REAL;
ALTER TABLE "Movie" ADD COLUMN "voteCount" INTEGER;

-- CreateTable
CREATE TABLE "MovieCast" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "movieId" TEXT NOT NULL,
    "tmdbPersonId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "character" TEXT,
    "profilePath" TEXT,
    "order" INTEGER NOT NULL,
    CONSTRAINT "MovieCast_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MovieCrew" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "movieId" TEXT NOT NULL,
    "tmdbPersonId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "job" TEXT NOT NULL,
    "department" TEXT,
    "profilePath" TEXT,
    CONSTRAINT "MovieCrew_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MovieCast_movieId_order_idx" ON "MovieCast"("movieId", "order");

-- CreateIndex
CREATE INDEX "MovieCrew_movieId_idx" ON "MovieCrew"("movieId");
