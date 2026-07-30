"use client";

/**
 * The visual writing surface.
 *
 * Markdown stays the storage format — every save path, feed, export and the
 * public renderer already speak it — so this editor is an *input method*, not
 * a data model. It parses `value` (markdown) into a rich document and
 * serializes back to markdown on every edit; pressing Bold makes the text
 * bold, and `**` never appears anywhere an author can see.
 *
 * Three ways in, by distance from the keyboard:
 *  · shortcuts (⌘B, ⌘I, …) — never leave the text
 *  · `/` opens the block menu at the caret — one keystroke
 *  · select text and a bubble appears on it — no trip to the toolbar
 * The static toolbar remains as the discoverable map of everything.
 *
 * The round-trip contract (open → save without edits ⇒ the same page) is held
 * by roundtrip.test.tsx against the same extension list.
 */
import { Highlight } from "@tiptap/extension-highlight";
import { Image } from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { StarterKit } from "@tiptap/starter-kit";
import { useEffect, useRef, useState } from "react";
import { EditorToolbar, Glyphs, type ToolAction } from "../EditorToolbar";
import { cjkEmphasisExtensions } from "./cjk-emphasis";
import { SpoilerBlock, StillBlock, TrailerBlock } from "./directives";
import { SlashCommands, type SlashContext } from "./slash-menu";

export interface UploadedImage {
  url: string;
  alt: string;
}

export interface EditorMedia {
  trailerKey: string | null;
  stills: string[];
}

/**
 * One extension list, shared verbatim with the round-trip tests. `media` only
 * affects how trailer/still render *while editing* (real thumbnails instead of
 * labelled slots) — the markdown they write is identical either way.
 */
export function richExtensions(media: EditorMedia = { trailerKey: null, stills: [] }) {
  return [
    // Underline is off because markdown cannot store it — a mark that
    // silently vanished on save would be worse than no button.
    StarterKit.configure({ underline: false, link: { openOnClick: false } }),
    Highlight,
    Image,
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: false } }),
    SpoilerBlock,
    TrailerBlock.configure({ trailerKey: media.trailerKey }),
    StillBlock.configure({ stills: media.stills }),
    ...cjkEmphasisExtensions,
    Markdown,
  ];
}

/** Toolbar-style button used inside the bubbles. */
function BubbleButton({
  label,
  glyph,
  active,
  onClick,
}: {
  label: string;
  glyph: React.ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active ?? undefined}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`grid h-7 min-w-7 place-items-center rounded px-1 transition-colors hover:bg-surface hover:text-foreground ${
        active ? "bg-accent/15 text-accent" : "text-muted"
      }`}
    >
      {glyph}
    </button>
  );
}

const bubbleShell =
  "flex items-center gap-0.5 rounded-lg border border-line bg-surface p-1 shadow-xl";

export function RichEditor({
  value,
  onChange,
  onSaveShortcut,
  uploadImage,
  media,
  onReady,
}: {
  /** The review body, as markdown. The single source of truth lives above. */
  value: string;
  onChange: (markdown: string) => void;
  onSaveShortcut: () => void;
  /** Uploads one file and returns its URL, or null after surfacing an error. */
  uploadImage: (file: File) => Promise<UploadedImage | null>;
  /** The chosen film's media — drives previews and the trailer/still entries. */
  media: EditorMedia;
  /** Test seam: hands out the editor instance once it exists. */
  onReady?: (editor: Editor) => void;
}) {
  // What this component last knew the markdown to be — either because it
  // serialized it, or because it just loaded it. Distinguishes our own
  // onChange echoing back through props from a genuinely external change
  // (draft restore, an edit on the Markdown tab), which must reload the doc.
  const lastMarkdown = useRef(value);
  const fileInput = useRef<HTMLInputElement>(null);

  // Read by the slash menu at open time, so a film picked after the editor
  // mounted still enables Trailer/Still without any re-wiring. Written from an
  // effect (never during render) to keep the ref rules intact.
  const slashContext = useRef<SlashContext>({
    hasTrailer: false,
    stillCount: 0,
    openUpload: () => {},
    insertStill: () => {},
  });

  const editor = useEditor(
    {
      extensions: [
        ...richExtensions(media),
        Placeholder.configure({
          placeholder: "Write. Type / for blocks; select text to format it.",
        }),
        // The closure runs when the slash menu opens (an event), never during
        // render; the ref is exactly how the menu sees the *current* film
        // without recreating the editor.
        // eslint-disable-next-line react-hooks/refs
        SlashCommands.configure({ context: () => slashContext.current }),
      ],
      // `value` is current here even when the editor is recreated on a film
      // change: every serialization has already round-tripped through onChange.
      content: value,
      contentType: "markdown",
      // The page is server-rendered; the editor is not. Rendering on mount only
      // avoids the SSR/client mismatch tiptap warns about.
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class:
            "prose-review cx-richtext min-h-[28rem] rounded-lg border border-line bg-background px-4 py-3 text-sm leading-relaxed outline-none focus:border-accent",
        },
        handlePaste: (_view, event) => {
          const files = Array.from(event.clipboardData?.files ?? []).filter((f) =>
            f.type.startsWith("image/"),
          );
          if (files.length === 0) return false;
          event.preventDefault();
          void insertUploads(files);
          return true;
        },
        handleDrop: (_view, event) => {
          const files = Array.from(event.dataTransfer?.files ?? []).filter((f) =>
            f.type.startsWith("image/"),
          );
          if (files.length === 0) return false;
          event.preventDefault();
          void insertUploads(files);
          return true;
        },
      },
      onUpdate({ editor }) {
        const md = editor.getMarkdown();
        lastMarkdown.current = md;
        onChange(md);
      },
    },
    // Recreated when the film changes so trailer/still previews follow it.
    // Content is preserved: lastMarkdown always holds the latest serialization.
    [media.trailerKey, media.stills.join("|")],
  );

  // An external change to `value` (restore banner, Markdown-tab edit) reloads
  // the document. Our own serialization echoing back is a no-op by design —
  // reloading on every keystroke would reset the caret.
  useEffect(() => {
    if (!editor || value === lastMarkdown.current) return;
    lastMarkdown.current = value;
    editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
  }, [editor, value]);

  useEffect(() => {
    if (editor) onReady?.(editor);
  }, [editor, onReady]);

  async function insertUploads(files: File[]) {
    if (!editor) return;
    for (const file of files) {
      const uploaded = await uploadImage(file);
      if (uploaded) {
        editor.chain().focus().setImage({ src: uploaded.url, alt: uploaded.alt }).run();
      }
    }
  }

  function insertStill(e: Editor) {
    if (media.stills.length === 0) return;
    // Cycle: the first press inserts still 1, the next still 2…
    let used = 0;
    e.state.doc.descendants((node) => {
      if (node.type.name === "still") used += 1;
    });
    e.chain()
      .focus()
      .insertContent({ type: "still", attrs: { index: (used % media.stills.length) + 1 } })
      .run();
  }

  useEffect(() => {
    slashContext.current = {
      hasTrailer: Boolean(media.trailerKey),
      stillCount: media.stills.length,
      openUpload: () => fileInput.current?.click(),
      insertStill: () => editor && insertStill(editor),
    };
  });

  const active = useEditorState({
    editor,
    selector: (ctx) => ({
      bold: ctx.editor?.isActive("bold") ?? false,
      italic: ctx.editor?.isActive("italic") ?? false,
      strike: ctx.editor?.isActive("strike") ?? false,
      highlight: ctx.editor?.isActive("highlight") ?? false,
      code: ctx.editor?.isActive("code") ?? false,
      link: ctx.editor?.isActive("link") ?? false,
      h2: ctx.editor?.isActive("heading", { level: 2 }) ?? false,
      h3: ctx.editor?.isActive("heading", { level: 3 }) ?? false,
      quote: ctx.editor?.isActive("blockquote") ?? false,
      list: ctx.editor?.isActive("bulletList") ?? false,
      ordered: ctx.editor?.isActive("orderedList") ?? false,
      tasks: ctx.editor?.isActive("taskList") ?? false,
      table: ctx.editor?.isActive("table") ?? false,
      spoiler: ctx.editor?.isActive("spoiler") ?? false,
      image: ctx.editor?.isActive("image") ?? false,
      imageAlt: (ctx.editor?.getAttributes("image").alt as string | undefined) ?? "",
      canUndo: ctx.editor?.can().undo() ?? false,
      canRedo: ctx.editor?.can().redo() ?? false,
      selectionKey: ctx.editor
        ? `${ctx.editor.state.selection.from}-${ctx.editor.state.selection.to}`
        : "",
    }),
  });

  // The link bubble swaps to an input. The draft is pinned to the selection it
  // was opened for: select something else and the bubble is back to buttons —
  // no effect needed, a stale draft simply stops matching and is ignored.
  const [linkDraft, setLinkDraftState] = useState<{ key: string; value: string } | null>(null);
  const linkEditing = linkDraft !== null && linkDraft.key === active?.selectionKey;
  const setLinkDraft = (value: string | null) =>
    setLinkDraftState(value === null ? null : { key: active?.selectionKey ?? "", value });

  function applyLink(href: string) {
    if (!editor) return;
    const clean = href.trim();
    setLinkDraft(null);
    if (!clean) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    if (!/^https?:\/\//i.test(clean)) return;
    editor.chain().focus().extendMarkRange("link").setLink({ href: clean }).run();
  }

  const groups: ToolAction[][] = [
    [
      { id: "undo", label: "Undo", hint: "⌘/Ctrl+Z", glyph: Glyphs.undo, disabled: !active?.canUndo,
        run: () => editor?.chain().focus().undo().run() },
      { id: "redo", label: "Redo", hint: "⌘/Ctrl+Shift+Z", glyph: Glyphs.redo, disabled: !active?.canRedo,
        run: () => editor?.chain().focus().redo().run() },
    ],
    [
      { id: "bold", label: "Bold", hint: "⌘/Ctrl+B", glyph: Glyphs.bold, active: active?.bold,
        run: () => editor?.chain().focus().toggleBold().run() },
      { id: "italic", label: "Italic", hint: "⌘/Ctrl+I", glyph: Glyphs.italic, active: active?.italic,
        run: () => editor?.chain().focus().toggleItalic().run() },
      { id: "strike", label: "Strikethrough", hint: "⌘/Ctrl+Shift+S", glyph: Glyphs.strike, active: active?.strike,
        run: () => editor?.chain().focus().toggleStrike().run() },
      { id: "highlight", label: "Highlight", hint: "⌘/Ctrl+Shift+H", glyph: Glyphs.highlight, active: active?.highlight,
        run: () => editor?.chain().focus().toggleHighlight().run() },
      { id: "code", label: "Inline code", hint: "⌘/Ctrl+E", glyph: Glyphs.code, active: active?.code,
        run: () => editor?.chain().focus().toggleCode().run() },
      { id: "link", label: "Link", hint: "select text, then link it", glyph: Glyphs.link, active: active?.link,
        run: () => {
          if (!editor) return;
          if (editor.isActive("link")) applyLink("");
          else setLinkDraft((editor.getAttributes("link").href as string) ?? "");
        } },
    ],
    [
      { id: "h2", label: "Section heading", hint: "becomes a contents entry", glyph: Glyphs.heading, active: active?.h2,
        run: () => editor?.chain().focus().toggleHeading({ level: 2 }).run() },
      { id: "h3", label: "Subheading", hint: "nested under the section above", glyph: Glyphs.subheading, active: active?.h3,
        run: () => editor?.chain().focus().toggleHeading({ level: 3 }).run() },
      { id: "quote", label: "Pull quote", hint: "set large as a section beat", glyph: Glyphs.quote, active: active?.quote,
        run: () => editor?.chain().focus().toggleBlockquote().run() },
      { id: "list", label: "Bullet list", hint: "Enter continues it", glyph: Glyphs.list, active: active?.list,
        run: () => editor?.chain().focus().toggleBulletList().run() },
      { id: "ordered", label: "Numbered list", hint: "1. 2. 3.", glyph: Glyphs.orderedList, active: active?.ordered,
        run: () => editor?.chain().focus().toggleOrderedList().run() },
      { id: "tasks", label: "Checklist", hint: "boxes to tick", glyph: Glyphs.task, active: active?.tasks,
        run: () => editor?.chain().focus().toggleTaskList().run() },
      { id: "table", label: "Table", hint: "3 columns with a header row", glyph: Glyphs.table, active: active?.table,
        run: () => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
      { id: "rule", label: "Divider", hint: "a break between movements", glyph: Glyphs.rule,
        run: () => editor?.chain().focus().setHorizontalRule().run() },
    ],
    [
      { id: "spoiler", label: "Spoiler block", hint: "hidden until the reader reveals it", glyph: Glyphs.spoiler, active: active?.spoiler,
        run: () => {
          if (!editor) return;
          if (editor.isActive("spoiler")) editor.chain().focus().lift("spoiler").run();
          else editor.chain().focus().wrapIn("spoiler").run();
        } },
      { id: "trailer", label: "Trailer", hint: media.trailerKey ? "this film's trailer, inline" : "no trailer on file — pick a film",
        glyph: Glyphs.play, disabled: !media.trailerKey,
        run: () => editor?.chain().focus().insertContent({ type: "trailer" }).run() },
      { id: "still", label: "Still", hint: media.stills.length ? `${media.stills.length} on file — each press inserts the next` : "no stills on file — pick a film",
        glyph: Glyphs.image, disabled: media.stills.length === 0,
        run: () => editor && insertStill(editor) },
      { id: "upload", label: "Upload image", hint: "JPEG, PNG, WebP, AVIF or GIF up to 20 MB — or paste / drop one",
        glyph: Glyphs.upload, run: () => fileInput.current?.click() },
    ],
  ];

  return (
    <div
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "s") {
          e.preventDefault();
          onSaveShortcut();
        }
      }}
    >
      <EditorToolbar groups={groups} />
      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void insertUploads(Array.from(e.target.files));
          e.target.value = "";
        }}
      />

      {/* ── Selection bubble: formatting where the eyes already are ── */}
      {editor && (
        <BubbleMenu
          editor={editor}
          pluginKey="textBubble"
          shouldShow={({ editor: e, state }) => {
            if (!e.isEditable) return false;
            if (e.isActive("image") || e.isActive("still") || e.isActive("trailer")) return false;
            if (e.isActive("codeBlock")) return false;
            return !state.selection.empty;
          }}
        >
          <div className={bubbleShell}>
            {linkEditing ? (
              <form
                className="flex items-center gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  applyLink(linkDraft!.value);
                }}
              >
                <input
                  autoFocus
                  value={linkDraft!.value}
                  onChange={(e) => setLinkDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setLinkDraft(null);
                  }}
                  placeholder="https://…"
                  className="w-56 rounded border border-line bg-background px-2 py-1 text-xs outline-none focus:border-accent"
                />
                <button
                  type="submit"
                  className="rounded bg-accent px-2 py-1 text-xs font-semibold text-black"
                >
                  Link
                </button>
              </form>
            ) : (
              <>
                <BubbleButton label="Bold" glyph={Glyphs.bold} active={active?.bold}
                  onClick={() => editor.chain().focus().toggleBold().run()} />
                <BubbleButton label="Italic" glyph={Glyphs.italic} active={active?.italic}
                  onClick={() => editor.chain().focus().toggleItalic().run()} />
                <BubbleButton label="Strikethrough" glyph={Glyphs.strike} active={active?.strike}
                  onClick={() => editor.chain().focus().toggleStrike().run()} />
                <BubbleButton label="Highlight" glyph={Glyphs.highlight} active={active?.highlight}
                  onClick={() => editor.chain().focus().toggleHighlight().run()} />
                <BubbleButton label="Inline code" glyph={Glyphs.code} active={active?.code}
                  onClick={() => editor.chain().focus().toggleCode().run()} />
                <span className="mx-0.5 h-4 w-px bg-line" aria-hidden />
                <BubbleButton label={active?.link ? "Remove link" : "Link"} glyph={Glyphs.link} active={active?.link}
                  onClick={() => {
                    if (editor.isActive("link")) applyLink("");
                    else setLinkDraft((editor.getAttributes("link").href as string) ?? "");
                  }} />
              </>
            )}
          </div>
        </BubbleMenu>
      )}

      {/* ── Image bubble: alt text is how the image reads to search and screen readers ── */}
      {editor && (
        <BubbleMenu
          editor={editor}
          pluginKey="imageBubble"
          shouldShow={({ editor: e }) => e.isEditable && e.isActive("image")}
        >
          <div className={bubbleShell}>
            <input
              key={active?.imageAlt}
              defaultValue={active?.imageAlt}
              placeholder="Describe the image (alt text)"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  editor
                    .chain()
                    .focus()
                    .updateAttributes("image", { alt: (e.target as HTMLInputElement).value })
                    .run();
                }
              }}
              onBlur={(e) =>
                editor.chain().updateAttributes("image", { alt: e.target.value }).run()
              }
              className="w-60 rounded border border-line bg-background px-2 py-1 text-xs outline-none focus:border-accent"
            />
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().deleteSelection().run()}
              className="rounded px-2 py-1 text-xs font-semibold text-red-400 hover:bg-surface"
            >
              Remove
            </button>
          </div>
        </BubbleMenu>
      )}

      {/* ── Table bubble: appears at the caret inside a table ── */}
      {editor && (
        <BubbleMenu
          editor={editor}
          pluginKey="tableBubble"
          shouldShow={({ editor: e, state }) =>
            e.isEditable && e.isActive("table") && state.selection.empty
          }
        >
          <div className={bubbleShell}>
            <BubbleButton label="Add row below" glyph={<span className="text-xs font-semibold">+행</span>}
              onClick={() => editor.chain().focus().addRowAfter().run()} />
            <BubbleButton label="Add column right" glyph={<span className="text-xs font-semibold">+열</span>}
              onClick={() => editor.chain().focus().addColumnAfter().run()} />
            <BubbleButton label="Delete row" glyph={<span className="text-xs">−행</span>}
              onClick={() => editor.chain().focus().deleteRow().run()} />
            <BubbleButton label="Delete column" glyph={<span className="text-xs">−열</span>}
              onClick={() => editor.chain().focus().deleteColumn().run()} />
            <span className="mx-0.5 h-4 w-px bg-line" aria-hidden />
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().deleteTable().run()}
              className="rounded px-2 py-1 text-xs font-semibold text-red-400 hover:bg-surface"
            >
              표 삭제
            </button>
          </div>
        </BubbleMenu>
      )}

      <div className="mt-3">
        <EditorContent editor={editor} />
      </div>
      <p className="mt-2 text-xs text-muted">
        Tip: <kbd className="rounded border border-line px-1 font-mono">/</kbd> inserts blocks ·
        select text for the formatting bubble · paste or drop an image to upload it
      </p>
    </div>
  );
}
