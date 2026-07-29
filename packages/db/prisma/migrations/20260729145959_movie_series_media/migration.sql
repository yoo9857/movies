-- AlterTable
ALTER TABLE "Movie" ADD COLUMN "collectionId" INTEGER;
ALTER TABLE "Movie" ADD COLUMN "collectionName" TEXT;
ALTER TABLE "Movie" ADD COLUMN "companies" TEXT;
ALTER TABLE "Movie" ADD COLUMN "facebook" TEXT;
ALTER TABLE "Movie" ADD COLUMN "homepage" TEXT;
ALTER TABLE "Movie" ADD COLUMN "instagram" TEXT;
ALTER TABLE "Movie" ADD COLUMN "twitter" TEXT;

-- CreateTable
CREATE TABLE "MovieVideo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "movieId" TEXT NOT NULL,
    "youtubeKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "official" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" DATETIME,
    "sort" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "MovieVideo_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MovieImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "movieId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "lang" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "MovieImage_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MovieVideo_movieId_sort_idx" ON "MovieVideo"("movieId", "sort");

-- CreateIndex
CREATE UNIQUE INDEX "MovieVideo_movieId_youtubeKey_key" ON "MovieVideo"("movieId", "youtubeKey");

-- CreateIndex
CREATE INDEX "MovieImage_movieId_kind_sort_idx" ON "MovieImage"("movieId", "kind", "sort");

-- CreateIndex
CREATE UNIQUE INDEX "MovieImage_movieId_path_key" ON "MovieImage"("movieId", "path");

-- CreateIndex
CREATE INDEX "Movie_collectionId_idx" ON "Movie"("collectionId");
