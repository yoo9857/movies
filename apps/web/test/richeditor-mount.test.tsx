// @vitest-environment jsdom
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

function mount(md: string) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <RichEditor
        value={md}
        onChange={() => {}}
        onSaveShortcut={() => {}}
        uploadImage={async () => null}
        hasTrailer={true}
        stillCount={3}
      />,
    );
  });
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
});
