// @vitest-environment jsdom
import type { Editor } from "@tiptap/react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { RichEditor } from "@/components/review/editor/RichEditor";

/**
 * The round-trip tests prove the markdown machinery; this proves the React
 * component actually mounts — extensions register, the ProseMirror view
 * attaches, the toolbar renders. A crash here is what a blank editor in the
 * browser looks like.
 */

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function mount(md: string): { editor: () => Editor } {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  let instance: Editor | null = null;
  act(() => {
    root.render(
      <RichEditor
        value={md}
        onChange={() => {}}
        onSaveShortcut={() => {}}
        uploadImage={async () => null}
        media={{ trailerKey: "abc123", stills: ["/a.jpg", "/b.jpg", "/c.jpg"] }}
        onReady={(e) => {
          instance = e;
        }}
      />,
    );
  });
  return {
    editor: () => {
      expect(instance, "editor did not mount").not.toBeNull();
      return instance!;
    },
  };
}

describe("RichEditor mounts", () => {
  it("attaches an editable ProseMirror view with the review's content", () => {
    mount("## Heading\n\n**기생충!**은 굵게.\n\n:::spoiler\nhidden\n:::");
    const surface = container.querySelector(".cx-richtext");
    expect(surface).not.toBeNull();
    expect(surface!.getAttribute("contenteditable")).toBe("true");
    // The markdown became rich content — no asterisks anywhere on screen.
    expect(surface!.textContent).toContain("기생충!");
    expect(surface!.textContent).not.toContain("**");
    expect(surface!.querySelector("strong")?.textContent).toBe("기생충!");
    // The spoiler is visible while editing, fenced by its chrome class.
    expect(surface!.querySelector(".cx-edit-spoiler")?.textContent).toContain("hidden");
  });

  it("renders the full toolbar, with media buttons enabled by the film", () => {
    mount("");
    const labels = Array.from(container.querySelectorAll("[role='toolbar'] button")).map((b) =>
      b.getAttribute("aria-label"),
    );
    expect(labels.join("|")).toContain("Bold");
    expect(labels.join("|")).toContain("Upload image");
    const still = container.querySelector<HTMLButtonElement>(
      "[role='toolbar'] button[aria-label^='Still']",
    );
    expect(still?.disabled).toBe(false);
  });

  it("shows atoms as labelled slots", () => {
    mount(":::trailer\n\n:::still 2");
    const surface = container.querySelector(".cx-richtext")!;
    expect(surface.textContent).toContain("Trailer");
    expect(surface.textContent).toContain("Still #2");
  });

  it("shows the film's real frames when media is known", () => {
    mount(":::still 2");
    const img = container.querySelector<HTMLImageElement>(".cx-edit-media-preview img");
    expect(img?.src).toContain("/b.jpg");
  });

  it("opens the slash menu on / and inserts the chosen block", async () => {
    const { editor } = mount("");
    // The editor instance lands a tick after the mount effect; flush it.
    await act(async () => {});
    // The suggestion pipeline resolves items asynchronously — flush that too.
    await act(async () => {
      editor().chain().focus().insertContent("/").run();
      await new Promise((r) => setTimeout(r, 10));
    });
    const menu = document.querySelector(".cx-slash-menu");
    expect(menu, "slash menu did not open").not.toBeNull();
    expect(menu!.textContent).toContain("Section heading");
    // Media entries reflect the film: trailer + still are on file here.
    expect(menu!.textContent).toContain("Trailer");

    // Choose "Pull quote" by clicking it, as a user would.
    const item = Array.from(menu!.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Pull quote"),
    );
    expect(item).toBeTruthy();
    act(() => {
      item!.click();
    });
    expect(container.querySelector(".cx-richtext blockquote")).not.toBeNull();
    // The typed "/" was consumed by the command, not left in the text.
    expect(container.querySelector(".cx-richtext")!.textContent).not.toContain("/");
  });
});
