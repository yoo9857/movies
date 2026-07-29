-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "SpoilerLevel" AS ENUM ('NONE', 'MILD', 'FULL');

-- CreateEnum
CREATE TYPE "ImageKind" AS ENUM ('poster', 'backdrop');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'MEMBER',
    "displayName" TEXT,
    "bio" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Critic" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bio" TEXT,
    "avatarUrl" TEXT,
    "links" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Critic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Movie" (
    "id" TEXT NOT NULL,
    "tmdbId" INTEGER,
    "imdbId" TEXT,
    "title" TEXT NOT NULL,
    "originalTitle" TEXT,
    "tagline" TEXT,
    "overview" TEXT,
    "posterPath" TEXT,
    "backdropPath" TEXT,
    "releaseDate" DATE,
    "runtime" INTEGER,
    "director" TEXT,
    "genres" TEXT[],
    "keywords" TEXT[],
    "countries" TEXT[],
    "certification" TEXT,
    "budget" DOUBLE PRECISION,
    "revenue" DOUBLE PRECISION,
    "voteAverage" DOUBLE PRECISION,
    "voteCount" INTEGER,
    "popularity" DOUBLE PRECISION,
    "trailerKey" TEXT,
    "collectionId" INTEGER,
    "collectionName" TEXT,
    "companies" JSONB,
    "homepage" TEXT,
    "instagram" TEXT,
    "facebook" TEXT,
    "twitter" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Movie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovieCast" (
    "id" TEXT NOT NULL,
    "movieId" TEXT NOT NULL,
    "tmdbPersonId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "character" TEXT,
    "profilePath" TEXT,
    "order" INTEGER NOT NULL,

    CONSTRAINT "MovieCast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovieCrew" (
    "id" TEXT NOT NULL,
    "movieId" TEXT NOT NULL,
    "tmdbPersonId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "job" TEXT NOT NULL,
    "department" TEXT,
    "profilePath" TEXT,

    CONSTRAINT "MovieCrew_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovieVideo" (
    "id" TEXT NOT NULL,
    "movieId" TEXT NOT NULL,
    "youtubeKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "official" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMPTZ(3),
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MovieVideo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovieImage" (
    "id" TEXT NOT NULL,
    "movieId" TEXT NOT NULL,
    "kind" "ImageKind" NOT NULL,
    "path" TEXT NOT NULL,
    "lang" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MovieImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT,
    "verdict" TEXT,
    "content" TEXT NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "spoilers" "SpoilerLevel" NOT NULL DEFAULT 'NONE',
    "publishedAt" TIMESTAMPTZ(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "helpfulCount" INTEGER NOT NULL DEFAULT 0,
    "authorId" TEXT NOT NULL,
    "movieId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewVote" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Critic_slug_key" ON "Critic"("slug");

-- CreateIndex
CREATE INDEX "Critic_name_idx" ON "Critic"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Movie_tmdbId_key" ON "Movie"("tmdbId");

-- CreateIndex
CREATE INDEX "Movie_title_idx" ON "Movie"("title");

-- CreateIndex
CREATE INDEX "Movie_collectionId_idx" ON "Movie"("collectionId");

-- CreateIndex
CREATE INDEX "Movie_releaseDate_idx" ON "Movie"("releaseDate" DESC);

-- CreateIndex
CREATE INDEX "Movie_createdAt_idx" ON "Movie"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "Movie_voteAverage_idx" ON "Movie"("voteAverage" DESC);

-- CreateIndex
CREATE INDEX "Movie_genres_idx" ON "Movie" USING GIN ("genres");

-- CreateIndex
CREATE INDEX "MovieCast_movieId_order_idx" ON "MovieCast"("movieId", "order");

-- CreateIndex
CREATE INDEX "MovieCast_name_idx" ON "MovieCast"("name");

-- CreateIndex
CREATE INDEX "MovieCrew_movieId_idx" ON "MovieCrew"("movieId");

-- CreateIndex
CREATE INDEX "MovieCrew_name_idx" ON "MovieCrew"("name");

-- CreateIndex
CREATE INDEX "MovieVideo_movieId_sort_idx" ON "MovieVideo"("movieId", "sort");

-- CreateIndex
CREATE UNIQUE INDEX "MovieVideo_movieId_youtubeKey_key" ON "MovieVideo"("movieId", "youtubeKey");

-- CreateIndex
CREATE INDEX "MovieImage_movieId_kind_sort_idx" ON "MovieImage"("movieId", "kind", "sort");

-- CreateIndex
CREATE UNIQUE INDEX "MovieImage_movieId_path_key" ON "MovieImage"("movieId", "path");

-- CreateIndex
CREATE UNIQUE INDEX "Review_slug_key" ON "Review"("slug");

-- CreateIndex
CREATE INDEX "Review_status_publishedAt_idx" ON "Review"("status", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "Review_authorId_updatedAt_idx" ON "Review"("authorId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "Review_movieId_status_idx" ON "Review"("movieId", "status");

-- CreateIndex
CREATE INDEX "Review_status_helpfulCount_idx" ON "Review"("status", "helpfulCount" DESC);

-- CreateIndex
CREATE INDEX "ReviewVote_userId_idx" ON "ReviewVote"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewVote_reviewId_userId_key" ON "ReviewVote"("reviewId", "userId");

-- AddForeignKey
ALTER TABLE "MovieCast" ADD CONSTRAINT "MovieCast_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovieCrew" ADD CONSTRAINT "MovieCrew_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovieVideo" ADD CONSTRAINT "MovieVideo_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovieImage" ADD CONSTRAINT "MovieImage_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewVote" ADD CONSTRAINT "ReviewVote_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewVote" ADD CONSTRAINT "ReviewVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
