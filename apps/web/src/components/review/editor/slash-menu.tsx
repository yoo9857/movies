"use client";

/**
 * Notion-style slash commands: type `/` on an empty spot and pick a block.
 *
 * This exists because a toolbar answers "what can I click?" and never "what
 * can this document hold?" — the slash menu puts every block one keystroke
 * away, filtered as you type, without the hands leaving the keyboard.
 *
 * Structure: a Tiptap Extension wires @tiptap/suggestion; the popup itself is
 * a plain React list rendered through ReactRenderer and positioned from the
 * caret's clientRect. No floating-ui here — the menu is anchored to a caret,
 * which cannot scroll out from under it while it is open.
 */
import { Extension, ReactRenderer, type Editor } from "@tiptap/react";
import { Suggestion, type SuggestionProps } from "@tiptap/suggestion";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  type ReactNode,
} from "react";
import { Glyphs } from "../EditorToolbar";

export interface SlashItem {
  id: string;
  label: string;
  hint: string;
  glyph: ReactNode;
  /** Extra strings the filter matches, beyond the label. */
  keywords?: string;
  run: (editor: Editor) => void;
}

/** What the menu needs to know about the page around it. */
export interface SlashContext {
  hasTrailer: boolean;
  stillCount: number;
  openUpload: () => void;
  insertStill: () => void;
}

function buildItems(ctx: SlashContext): SlashItem[] {
  const items: SlashItem[] = [
    {
      id: "h2",
      label: "Section heading",
      hint: "becomes a contents entry",
      glyph: Glyphs.heading,
      keywords: "h2 heading title 제목",
      run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      id: "h3",
      label: "Subheading",
      hint: "nested under the section above",
      glyph: Glyphs.subheading,
      keywords: "h3 subheading 소제목",
      run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
      id: "quote",
      label: "Pull quote",
      hint: "set large as a section beat",
      glyph: Glyphs.quote,
      keywords: "quote blockquote 인용",
      run: (e) => e.chain().focus().toggleBlockquote().run(),
    },
    {
      id: "bullets",
      label: "Bullet list",
      hint: "Enter continues it",
      glyph: Glyphs.list,
      keywords: "ul list 목록",
      run: (e) => e.chain().focus().toggleBulletList().run(),
    },
    {
      id: "numbers",
      label: "Numbered list",
      hint: "1. 2. 3.",
      glyph: Glyphs.orderedList,
      keywords: "ol ordered 번호",
      run: (e) => e.chain().focus().toggleOrderedList().run(),
    },
    {
      id: "tasks",
      label: "Checklist",
      hint: "boxes to tick",
      glyph: Glyphs.task,
      keywords: "todo task check 체크",
      run: (e) => e.chain().focus().toggleTaskList().run(),
    },
    {
      id: "table",
      label: "Table",
      hint: "3 columns with a header row",
      glyph: Glyphs.table,
      keywords: "table grid 표",
      run: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
    {
      id: "rule",
      label: "Divider",
      hint: "a break between movements",
      glyph: Glyphs.rule,
      keywords: "hr rule divider 구분선",
      run: (e) => e.chain().focus().setHorizontalRule().run(),
    },
    {
      id: "spoiler",
      label: "Spoiler block",
      hint: "hidden until the reader reveals it",
      glyph: Glyphs.spoiler,
      keywords: "spoiler hidden 스포일러",
      run: (e) => e.chain().focus().wrapIn("spoiler").run(),
    },
    {
      id: "image",
      label: "Image",
      hint: "upload from this device",
      glyph: Glyphs.upload,
      keywords: "image photo picture upload 이미지 사진",
      run: () => ctx.openUpload(),
    },
  ];

  if (ctx.hasTrailer) {
    items.push({
      id: "trailer",
      label: "Trailer",
      hint: "this film's trailer, inline",
      glyph: Glyphs.play,
      keywords: "trailer video 예고편",
      run: (e) => e.chain().focus().insertContent({ type: "trailer" }).run(),
    });
  }
  if (ctx.stillCount > 0) {
    items.push({
      id: "still",
      label: "Still",
      hint: "the next still from this film",
      glyph: Glyphs.image,
      keywords: "still frame 스틸",
      run: () => ctx.insertStill(),
    });
  }
  return items;
}

/* ── The popup list ── */

interface SlashListProps {
  items: SlashItem[];
  command: (item: SlashItem) => void;
}

export interface SlashListHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

const SlashList = forwardRef<SlashListHandle, SlashListProps>(function SlashList(
  { items, command },
  ref,
) {
  const [selected, setSelected] = useState(0);

  // A fresh filter result resets the highlight to the top.
  useEffect(() => setSelected(0), [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown(event) {
      if (event.key === "ArrowDown") {
        setSelected((s) => (s + 1) % Math.max(1, items.length));
        return true;
      }
      if (event.key === "ArrowUp") {
        setSelected((s) => (s - 1 + items.length) % Math.max(1, items.length));
        return true;
      }
      if (event.key === "Enter") {
        if (items[selected]) command(items[selected]);
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) {
    return (
      <div className="cx-slash-menu">
        <p className="px-3 py-2 text-xs text-muted">Nothing matches.</p>
      </div>
    );
  }

  return (
    <div className="cx-slash-menu" role="listbox" aria-label="Insert block">
      {items.map((item, i) => (
        <button
          key={item.id}
          type="button"
          role="option"
          aria-selected={i === selected}
          onMouseEnter={() => setSelected(i)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => command(item)}
          className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${
            i === selected ? "bg-accent/15 text-foreground" : "text-muted"
          }`}
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded border border-line bg-background">
            {item.glyph}
          </span>
          <span className="min-w-0">
            <span className="block font-medium text-foreground">{item.label}</span>
            <span className="block truncate text-xs text-muted">{item.hint}</span>
          </span>
        </button>
      ))}
    </div>
  );
});

/* ── The extension ── */

export const SlashCommands = Extension.create<{ context: () => SlashContext }>({
  name: "slashCommands",

  addOptions() {
    return {
      context: () => ({
        hasTrailer: false,
        stillCount: 0,
        openUpload: () => {},
        insertStill: () => {},
      }),
    };
  },

  addProseMirrorPlugins() {
    const getContext = this.options.context;

    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        char: "/",
        pluginKey: undefined,
        command: ({ editor, range, props: item }) => {
          // Remove the "/query" the author typed, then do the thing.
          editor.chain().focus().deleteRange(range).run();
          item.run(editor);
        },
        items: ({ query }) => {
          const q = query.toLowerCase();
          return buildItems(getContext()).filter(
            (i) =>
              i.label.toLowerCase().includes(q) ||
              (i.keywords ?? "").toLowerCase().includes(q),
          );
        },
        render: () => {
          let renderer: ReactRenderer<SlashListHandle, SlashListProps> | null = null;

          const place = (props: SuggestionProps<SlashItem, SlashItem>) => {
            const el = renderer?.element as HTMLElement | undefined;
            const rect = props.clientRect?.();
            if (!el || !rect) return;
            el.style.position = "fixed";
            el.style.zIndex = "50";
            el.style.left = `${Math.min(rect.left, window.innerWidth - 300)}px`;
            // Open upward when the caret sits in the bottom quarter.
            if (rect.bottom > window.innerHeight - 260) {
              el.style.top = "auto";
              el.style.bottom = `${window.innerHeight - rect.top + 6}px`;
            } else {
              el.style.bottom = "auto";
              el.style.top = `${rect.bottom + 6}px`;
            }
          };

          return {
            onStart: (props) => {
              renderer = new ReactRenderer(SlashList, {
                props: { items: props.items, command: props.command },
                editor: props.editor,
              });
              document.body.appendChild(renderer.element);
              place(props);
            },
            onUpdate: (props) => {
              renderer?.updateProps({ items: props.items, command: props.command });
              place(props);
            },
            onKeyDown: ({ event }) => {
              if (event.key === "Escape") {
                renderer?.destroy();
                renderer?.element.remove();
                renderer = null;
                return true;
              }
              return renderer?.ref?.onKeyDown(event) ?? false;
            },
            onExit: () => {
              renderer?.destroy();
              renderer?.element.remove();
              renderer = null;
            },
          };
        },
      }),
    ];
  },
});
