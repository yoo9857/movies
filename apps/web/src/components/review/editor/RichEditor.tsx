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
 * The round-trip contract (open → save without edits ⇒ the same page) is held
 * by roundtrip.test.tsx against the same extension list.
 */
import { Highlight } from "@tiptap/extension-highlight";
import { Image } from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { useEffect, useRef } from "react";
import { EditorToolbar, Glyphs, type ToolAction } from "../EditorToolbar";
import { cjkEmphasisExtensions } from "./cjk-emphasis";
import { directiveExtensions } from "./directives";

export interface UploadedImage {
  url: string;
  alt: string;
}

/** One extension list, shared verbatim with the round-trip tests. */
export function richExtensions() {
  return [
    // Underline is off because markdown cannot store it — a mark that
    // silently vanished on save would be worse than no button.
    StarterKit.configure({ underline: false, link: { openOnClick: false } }),
    Highlight,
    Image,
    TaskList,
    TaskItem.configure({ nested: true }),
    ...directiveExtensions,
    ...cjkEmphasisExtensions,
    Markdown,
  ];
}

export function RichEditor({
  value,
  onChange,
  onSaveShortcut,
  uploadImage,
  hasTrailer,
  stillCount,
}: {
  /** The review body, as markdown. The single source of truth lives above. */
  value: string;
  onChange: (markdown: string) => void;
  onSaveShortcut: () => void;
  /** Uploads one file and returns its URL, or null after surfacing an error. */
  uploadImage: (file: File) => Promise<UploadedImage | null>;
  hasTrailer: boolean;
  stillCount: number;
}) {
  // What this component last knew the markdown to be — either because it
  // serialized it, or because it just loaded it. Distinguishes our own
  // onChange echoing back through props from a genuinely external change
  // (draft restore, an edit on the Markdown tab), which must reload the doc.
  const lastMarkdown = useRef(value);

  const editor = useEditor({
    extensions: [
      ...richExtensions(),
      Placeholder.configure({
        placeholder: "The review. Type, or paste — formatting stays formatting.",
      }),
    ],
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
  });

  // An external change to `value` (restore banner, Markdown-tab edit) reloads
  // the document. Our own serialization echoing back is a no-op by design —
  // reloading on every keystroke would reset the caret.
  useEffect(() => {
    if (!editor || value === lastMarkdown.current) return;
    lastMarkdown.current = value;
    editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
  }, [editor, value]);

  async function insertUploads(files: File[]) {
    if (!editor) return;
    for (const file of files) {
      const uploaded = await uploadImage(file);
      if (uploaded) {
        editor.chain().focus().setImage({ src: uploaded.url, alt: uploaded.alt }).run();
      }
    }
  }

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
      spoiler: ctx.editor?.isActive("spoiler") ?? false,
    }),
  });

  const fileInput = useRef<HTMLInputElement>(null);

  function editLink() {
    if (!editor) return;
    if (editor.isActive("link")) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    // A prompt is deliberately boring: it works with the keyboard, it cannot
    // desync from the selection, and the URL is validated before it lands.
    const href = window.prompt("Link URL (https://…)")?.trim();
    if (!href) return;
    if (!/^https?:\/\//i.test(href)) return;
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  }

  function insertStill() {
    if (!editor || stillCount === 0) return;
    // Cycle: the first press inserts still 1, the next still 2…
    let used = 0;
    editor.state.doc.descendants((node) => {
      if (node.type.name === "still") used += 1;
    });
    editor
      .chain()
      .focus()
      .insertContent({ type: "still", attrs: { index: (used % stillCount) + 1 } })
      .run();
  }

  const groups: ToolAction[][] = [
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
      { id: "link", label: "Link", hint: "add or remove a link", glyph: Glyphs.link, active: active?.link,
        run: editLink },
    ],
    [
      { id: "h2", label: "Section heading", hint: "becomes a contents entry", glyph: Glyphs.heading, active: active?.h2,
        run: () => editor?.chain().focus().toggleHeading({ level: 2 }).run() },
      { id: "h3", label: "Subheading", hint: "nested under the section above", glyph: Glyphs.subheading, active: active?.h3,
        run: () => editor?.chain().focus().toggleHeading({ level: 3 }).run() },
      { id: "quote", label: "Pull quote", hint: "set large as a section beat", glyph: Glyphs.quote, active: active?.quote,
        run: () => editor?.chain().focus().toggleBlockquote().run() },
      { id: "list", label: "List", hint: "Enter continues it", glyph: Glyphs.list, active: active?.list,
        run: () => editor?.chain().focus().toggleBulletList().run() },
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
      { id: "trailer", label: "Trailer", hint: hasTrailer ? "this film's trailer, inline" : "no trailer on file — pick a film",
        glyph: Glyphs.play, disabled: !hasTrailer,
        run: () => editor?.chain().focus().insertContent({ type: "trailer" }).run() },
      { id: "still", label: "Still", hint: stillCount ? `${stillCount} on file — each press inserts the next` : "no stills on file — pick a film",
        glyph: Glyphs.image, disabled: stillCount === 0, run: insertStill },
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
      <div className="mt-3">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
