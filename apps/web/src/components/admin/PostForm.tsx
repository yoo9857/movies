"use client";

/**
 * Where a blog post gets written.
 *
 * Two fields on this form are not conveniences and the screen says so:
 *
 *  · **Sources.** A post filed under Away From Set or The Argument is a factual
 *    claim about a living person. `Post_claims_are_sourced` refuses to let one
 *    reach PUBLISHED with an empty list, so the form disables Publish and says
 *    why rather than letting the save come back as a constraint violation. The
 *    page prints every URL entered here.
 *  · **Who and what it is about.** These are the links that make the blog worth
 *    having next to a library: the piece appears on the person's page, and their
 *    page appears in the piece. Order matters — the first subject is what the
 *    post is `about` in its markup.
 *
 * The body is the same Tiptap surface reviews are written on, serialising to
 * markdown on every edit, because markdown is the storage format everywhere on
 * this site. The `:::trailer` / `:::still` directives are inert here — a post has
 * no film to pull media from — which matches how a topic essay renders.
 */
import {
  auditPostQuality,
  POST_CATEGORY_BLURBS,
  POST_CATEGORY_LABELS,
  POST_FORMAT_BLURBS,
  POST_FORMAT_LABELS,
  RESERVED_POST_SLUGS,
  SOURCED_CATEGORIES,
  type PostCategory,
  type PostFormat,
  postFormatSchema,
  sourceHost,
} from "@cinepixo/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { RichEditor, type UploadedImage } from "@/components/review/editor/RichEditor";
import { DEFAULT_MIN_POST_PICTURES, postPictureCount } from "@/lib/post-visuals";
import { SubjectPicker, type Subject } from "./SubjectPicker";

export interface PostFormValues {
  slug: string;
  title: string;
  dek: string;
  content: string;
  category: PostCategory;
  format: PostFormat;
  methodNote: string;
  disclosure: string;
  correctionNote: string;
  tags: string[];
  sources: string[];
  personIds: string[];
  movieIds: string[];
  image: string;
  imageAlt: string;
  imageCredit: string;
  imageLicense: string;
  imageLicenseUrl: string;
  imageSourceUrl: string;
}

const EMPTY: PostFormValues = {
  slug: "",
  title: "",
  dek: "",
  content: "",
  category: "PEOPLE",
  format: "EDITORIAL_FEATURE",
  methodNote: "",
  disclosure: "",
  correctionNote: "",
  tags: [],
  sources: [],
  personIds: [],
  movieIds: [],
  image: "",
  imageAlt: "",
  imageCredit: "",
  imageLicense: "",
  imageLicenseUrl: "",
  imageSourceUrl: "",
};

const CATEGORIES = Object.keys(POST_CATEGORY_LABELS) as PostCategory[];
const FORMATS = postFormatSchema.options;

/** Same grammar as the slug CHECK constraint: lowercase, digits, single hyphens. */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-")
    .slice(0, 90)
    .replace(/^-+|-+$/g, "");
}

const inputCls =
  "mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent";

export function PostForm({
  initial,
  postId,
  initialStatus = "DRAFT",
  authorReady = true,
  knownPeople = [],
  knownFilms = [],
}: {
  initial?: PostFormValues;
  postId?: string;
  /**
   * What the row's status is *now*. Only the button labels read it: saving as a
   * draft is "unpublish" for something already live, and a button that does not
   * say so is a button that quietly takes a page off the site.
   */
  initialStatus?: "DRAFT" | "PUBLISHED";
  authorReady?: boolean;
  /** Subjects already linked, resolved server-side so the picker can name them. */
  knownPeople?: Subject[];
  knownFilms?: Subject[];
}) {
  const router = useRouter();
  const [v, setV] = useState<PostFormValues>(initial ?? EMPTY);
  const [tagDraft, setTagDraft] = useState("");
  const [sourceDraft, setSourceDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  // An existing slug is a live URL; never re-derive it from a title edit.
  const [slugTouched, setSlugTouched] = useState(Boolean(initial?.slug));

  function set<K extends keyof PostFormValues>(key: K, value: PostFormValues[K]) {
    setSaved(false);
    setV((prev) => ({ ...prev, [key]: value }));
  }

  const needsSources = SOURCED_CATEGORIES.includes(v.category);
  const sourcesMissing = needsSources && v.sources.length === 0;
  const slugReserved = RESERVED_POST_SLUGS.includes(v.slug);
  const pictureCount = postPictureCount(v.content, v.image);
  const qualityIssues = [
    ...auditPostQuality(v),
    ...(pictureCount < DEFAULT_MIN_POST_PICTURES || !v.image
      ? [
          {
            level: "error" as const,
            code: "picture-floor",
            message: `Add one hero and at least ${DEFAULT_MIN_POST_PICTURES - 1} body images before publishing (${pictureCount}/${DEFAULT_MIN_POST_PICTURES}).`,
          },
        ]
      : []),
  ];
  const qualityErrors = qualityIssues.filter((issue) => issue.level === "error");

  /** The body's inline images — the same hardened pipeline reviews use. */
  const uploadOne = useCallback(async (file: File): Promise<UploadedImage | null> => {
    if (!file.type.startsWith("image/")) return null;
    if (file.size > 20 * 1024 * 1024) {
      setError(`"${file.name}" is larger than 20 MB.`);
      return null;
    }
    const alt =
      file.name
        .replace(/\.[a-z0-9]+$/i, "")
        .replace(/[[\]\n\r]/g, " ")
        .trim() || "image";
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/v1/my/review-images", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? `Uploading "${file.name}" failed — try again.`);
        return null;
      }
      return { url: data.url, alt };
    } catch {
      setError("Network error during upload — your text is untouched, try again.");
      return null;
    }
  }, []);

  /** The hero. Uploaded, never linked: the column refuses a foreign URL. */
  async function uploadHero(file: File) {
    setUploading(true);
    setError(null);
    const up = await uploadOne(file);
    setUploading(false);
    if (up) set("image", up.url);
  }

  function addTag() {
    const t = tagDraft.trim();
    if (!t || v.tags.includes(t) || v.tags.length >= 12) return;
    set("tags", [...v.tags, t]);
    setTagDraft("");
  }

  function addSource() {
    const s = sourceDraft.trim();
    if (!s) return;
    if (!/^https?:\/\//.test(s)) {
      setError("A source is an http(s) URL — that is what makes it checkable.");
      return;
    }
    if (v.sources.includes(s) || v.sources.length >= 20) return;
    setError(null);
    set("sources", [...v.sources, s]);
    setSourceDraft("");
  }

  async function save(status: "DRAFT" | "PUBLISHED") {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(postId ? `/api/v1/admin/posts/${postId}` : "/api/v1/admin/posts", {
        method: postId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...v, status }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        details?: { path?: string; message?: string }[];
        post?: { id: string };
      };
      if (!res.ok) {
        const detail = data.details?.[0];
        setError(detail ? `${detail.path}: ${detail.message}` : (data.error ?? "Save failed"));
        return;
      }
      if (!postId && data.post) {
        router.push(`/admin/blog/${data.post.id}/edit`);
      } else {
        setSaved(true);
      }
      router.refresh();
    } catch {
      setError("Network error — nothing was saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
      <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-muted">Headline</span>
          <input
            required
            maxLength={200}
            value={v.title}
            onChange={(e) => {
              set("title", e.target.value);
              if (!slugTouched) set("slug", slugify(e.target.value));
            }}
            placeholder="Song Kang-ho on the year he stopped saying yes"
            className={inputCls}
          />
        </label>

        <label className="block text-sm">
          <span className="text-muted">URL slug</span>
          <input
            required
            maxLength={120}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            title="lowercase letters, numbers and single hyphens"
            value={v.slug}
            onChange={(e) => {
              setSlugTouched(true);
              set("slug", e.target.value);
            }}
            className={`${inputCls} font-mono`}
          />
          {slugReserved && (
            <span className="mt-1 block text-xs text-red-400">
              /blog/{v.slug} is a route, not a post — the page would be unreachable.
            </span>
          )}
          {postId && !slugReserved && (
            <span className="mt-1 block text-xs text-muted">
              Changing this changes the public URL; the old one stops resolving.
            </span>
          )}
        </label>
      </div>

      <fieldset className="max-w-3xl text-sm">
        <legend className="text-muted">Shelf</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {CATEGORIES.map((c) => (
            <label
              key={c}
              className={`cursor-pointer rounded-lg border px-3 py-2 ${
                v.category === c ? "border-accent" : "border-line"
              }`}
            >
              <input
                type="radio"
                name="category"
                className="sr-only"
                checked={v.category === c}
                onChange={() => set("category", c)}
              />
              <span className="flex items-baseline gap-2">
                <span className="font-medium">{POST_CATEGORY_LABELS[c]}</span>
                {SOURCED_CATEGORIES.includes(c) && (
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-accent">
                    sourced
                  </span>
                )}
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                {POST_CATEGORY_BLURBS[c]}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="max-w-3xl text-sm">
        <legend className="text-muted">Reader job</legend>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          The shelf says what the piece is about. This says what the reader can do with it.
          Choose the strongest claim the article can honestly support.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {FORMATS.map((format) => (
            <label
              key={format}
              className={`cursor-pointer rounded-lg border px-3 py-2 ${
                v.format === format ? "border-accent" : "border-line"
              }`}
            >
              <input
                type="radio"
                name="format"
                className="sr-only"
                checked={v.format === format}
                onChange={() => set("format", format)}
              />
              <span className="font-medium">{POST_FORMAT_LABELS[format]}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                {POST_FORMAT_BLURBS[format]}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block max-w-3xl text-sm">
        <span className="text-muted">
          Standfirst — the sentence under the headline, and the one search results and share
          cards quote
        </span>
        <textarea
          rows={3}
          maxLength={500}
          value={v.dek}
          onChange={(e) => set("dek", e.target.value)}
          className={inputCls}
          placeholder="Written to be read with no page around it."
        />
        <span className="mt-1 block font-mono text-[11px] text-muted tabular-nums">
          {v.dek.length}/500
        </span>
      </label>

      {/* ── The hero ── */}
      <fieldset className="max-w-3xl rounded-lg border border-line p-4 text-sm">
        <legend className="px-1 text-muted">Hero image (optional)</legend>
        {v.image ? (
          <div className="space-y-3">
            <p className="break-all font-mono text-[11px] text-muted">{v.image}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-muted">Alt text — what is in the picture</span>
                <input
                  maxLength={300}
                  value={v.imageAlt}
                  onChange={(e) => set("imageAlt", e.target.value)}
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className="text-muted">Credit</span>
                <input
                  maxLength={300}
                  value={v.imageCredit}
                  onChange={(e) => set("imageCredit", e.target.value)}
                  className={inputCls}
                  placeholder="Photograph by …"
                />
              </label>
              <label className="block">
                <span className="text-muted">Licence</span>
                <input
                  maxLength={120}
                  value={v.imageLicense}
                  onChange={(e) => set("imageLicense", e.target.value)}
                  className={inputCls}
                  placeholder="CC BY-SA 4.0"
                />
              </label>
              <label className="block">
                <span className="text-muted">Licence URL</span>
                <input
                  type="url"
                  maxLength={500}
                  value={v.imageLicenseUrl}
                  onChange={(e) => set("imageLicenseUrl", e.target.value)}
                  className={inputCls}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-muted">
                  Source page — required once a licence is named, because a licence you cannot
                  trace is not one
                </span>
                <input
                  type="url"
                  maxLength={500}
                  value={v.imageSourceUrl}
                  onChange={(e) => set("imageSourceUrl", e.target.value)}
                  className={inputCls}
                />
              </label>
            </div>
            <button
              type="button"
              onClick={() =>
                setV((prev) => ({
                  ...prev,
                  image: "",
                  imageAlt: "",
                  imageCredit: "",
                  imageLicense: "",
                  imageLicenseUrl: "",
                  imageSourceUrl: "",
                }))
              }
              className="rounded-lg border border-line px-3 py-1.5 text-xs hover:border-red-400 hover:text-red-400"
            >
              Remove hero
            </button>
          </div>
        ) : (
          <div>
            <input
              type="file"
              accept="image/*"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadHero(file);
              }}
              className="text-sm"
            />
            <p className="mt-2 text-xs leading-relaxed text-muted">
              {uploading
                ? "Uploading…"
                : "Uploaded here, never linked: the column refuses a URL from anywhere but our own storage, which is what keeps a picture we hold no licence for off the page."}
            </p>
          </div>
        )}
      </fieldset>

      {/* ── The piece ── */}
      <div>
        <p className="mb-2 text-sm text-muted">The piece</p>
        <RichEditor
          value={v.content}
          onChange={(md) => set("content", md)}
          onSaveShortcut={() => void save("DRAFT")}
          uploadImage={uploadOne}
          media={{ trailerKey: null, stills: [] }}
        />
      </div>

      <fieldset className="max-w-3xl rounded-lg border border-line p-4 text-sm">
        <legend className="px-1 text-muted">How this piece was made</legend>
        <label className="block">
          <span className="text-muted">
            Method note
            {v.format === "FIRST_HAND_GUIDE" ? " — required for first-hand work" : " (recommended)"}
          </span>
          <textarea
            rows={3}
            maxLength={1500}
            value={v.methodNote}
            onChange={(e) => set("methodNote", e.target.value)}
            className={inputCls}
            placeholder="What was watched, tested, visited, compared or checked; when and under what conditions."
          />
        </label>
        <label className="mt-4 block">
          <span className="text-muted">Access and commercial disclosure</span>
          <textarea
            rows={2}
            maxLength={800}
            value={v.disclosure}
            onChange={(e) => set("disclosure", e.target.value)}
            className={inputCls}
            placeholder="Example: CinePixo bought the ticket. No studio reviewed or approved this piece."
          />
        </label>
        <label className="mt-4 block">
          <span className="text-muted">Correction or material revision note</span>
          <textarea
            rows={2}
            maxLength={1500}
            value={v.correctionNote}
            onChange={(e) => set("correctionNote", e.target.value)}
            className={inputCls}
            placeholder="Leave blank for ordinary copy edits. State what factual claim changed and when."
          />
        </label>
      </fieldset>

      {/* ── Subjects ── */}
      <div className="grid max-w-3xl gap-4">
        <SubjectPicker
          legend="About these people — the first one is what the post is about"
          placeholder="Search people in our library…"
          searchUrl="/api/v1/admin/people/lookup"
          parse={(body) =>
            ((body as { people?: { id: string; name: string; role: string | null; credits: number }[] })
              .people ?? []).map((p) => ({
              id: p.id,
              label: p.name,
              hint: [p.role, `${p.credits} credit${p.credits === 1 ? "" : "s"}`]
                .filter(Boolean)
                .join(" · "),
            }))
          }
          known={knownPeople}
          value={v.personIds}
          onChange={(ids) => set("personIds", ids)}
        />
        <SubjectPicker
          legend="About these films"
          placeholder="Search the library…"
          searchUrl="/api/v1/movies/search"
          parse={(body) =>
            ((body as { movies?: { id: string; title: string; year: number | null }[] }).movies ?? []).map(
              (m) => ({ id: m.id, label: m.title, hint: m.year ? String(m.year) : null }),
            )
          }
          known={knownFilms}
          value={v.movieIds}
          onChange={(ids) => set("movieIds", ids)}
        />
      </div>

      {/* ── Sources ── */}
      <fieldset
        className={`max-w-3xl rounded-lg border p-4 text-sm ${
          sourcesMissing ? "border-accent" : "border-line"
        }`}
      >
        <legend className="px-1 text-muted">
          Sources{needsSources ? " — required for this shelf" : " (optional here)"}
        </legend>
        {v.sources.length > 0 && (
          <ol className="mb-3 space-y-1.5">
            {v.sources.map((s, i) => (
              <li
                key={s}
                className="flex items-center gap-2 rounded-lg border border-line bg-background px-3 py-2"
              >
                <span className="font-mono text-[11px] tabular-nums text-muted">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{sourceHost(s)}</span>
                  <span className="ml-2 text-xs text-muted">{s}</span>
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${s}`}
                  onClick={() => set("sources", v.sources.filter((x) => x !== s))}
                  className="px-1.5 text-muted hover:text-red-400"
                >
                  ✕
                </button>
              </li>
            ))}
          </ol>
        )}
        <div className="flex gap-2">
          <input
            type="url"
            value={sourceDraft}
            maxLength={500}
            onChange={(e) => setSourceDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSource();
              }
            }}
            placeholder="https://…"
            className="min-w-0 flex-1 rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={addSource}
            className="rounded-lg border border-line px-4 py-2 text-sm hover:border-accent-dim"
          >
            Add
          </button>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          {needsSources
            ? "Every factual claim in a piece about people or a live argument has to be traceable. The database refuses to publish this shelf without at least one source, and the page prints all of them."
            : "This shelf is our own reading of films we have watched, so nothing is required — add a source if the piece leans on one."}
        </p>
      </fieldset>

      {/* ── Tags ── */}
      <fieldset className="max-w-3xl rounded-lg border border-line p-4 text-sm">
        <legend className="px-1 text-muted">Tags — printed on the page, so keep them readable</legend>
        {v.tags.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {v.tags.map((t) => (
              <span
                key={t}
                className="flex items-center gap-1.5 rounded-full border border-line bg-background px-3 py-1 font-mono text-[11px]"
              >
                {t}
                <button
                  type="button"
                  aria-label={`Remove ${t}`}
                  onClick={() => set("tags", v.tags.filter((x) => x !== t))}
                  className="text-muted hover:text-red-400"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={tagDraft}
            maxLength={60}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
            placeholder="korean cinema"
            className="min-w-0 flex-1 rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={addTag}
            className="rounded-lg border border-line px-4 py-2 text-sm hover:border-accent-dim"
          >
            Add
          </button>
        </div>
      </fieldset>

      <section className="max-w-3xl rounded-lg border border-line bg-surface p-4 text-sm">
        <h2 className="font-medium">Editorial readiness</h2>
        {qualityIssues.length === 0 ? (
          <p className="mt-2 text-positive">
            No structural issues found. Human source-checking still decides publication.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {qualityIssues.map((issue) => (
              <li key={issue.code} className="flex gap-2">
                <span
                  className={`shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] ${
                    issue.level === "error" ? "text-red-400" : "text-accent"
                  }`}
                >
                  {issue.level}
                </span>
                <span className="text-muted">{issue.message}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || slugReserved}
          onClick={() => void save("DRAFT")}
          className="rounded-lg border border-line px-5 py-2.5 text-sm hover:border-accent-dim disabled:opacity-50"
        >
          {busy
            ? "Saving…"
            : initialStatus === "PUBLISHED"
              ? "Unpublish to draft"
              : "Save draft"}
        </button>
        <button
          type="button"
          disabled={
            busy ||
            sourcesMissing ||
            qualityErrors.length > 0 ||
            !authorReady ||
            slugReserved ||
            !v.title ||
            !v.content
          }
          onClick={() => void save("PUBLISHED")}
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
          title={
            sourcesMissing
              ? "This shelf needs at least one source"
              : qualityErrors.length > 0
                ? qualityErrors[0]?.message
                : undefined
          }
        >
          {initialStatus === "PUBLISHED" ? "Save changes" : "Publish"}
        </button>
        {saved && <span className="text-sm text-positive">Saved.</span>}
        {sourcesMissing && (
          <span className="text-sm text-muted">
            Add a source and Publish unlocks — {POST_CATEGORY_LABELS[v.category]} makes claims
            about real people.
          </span>
        )}
        {!sourcesMissing && qualityErrors.length > 0 && (
          <span className="text-sm text-muted">
            Resolve the editorial error above before publishing.
          </span>
        )}
        {!authorReady && (
          <Link href="/me/settings" className="text-sm text-accent hover:opacity-80">
            Add the writer biography before publishing →
          </Link>
        )}
      </div>
    </form>
  );
}
