"use client";

/**
 * The boundary of last resort: a throw in the root layout itself.
 *
 * When this renders, the layout — and with it globals.css — is gone, so the
 * house style is restated inline: ink ground, projector gold, system-ish type.
 * No error details are rendered; nothing internal leaks to a visitor here any
 * more than it does in error.tsx.
 */
export default function GlobalError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "6rem 1rem",
          background: "#0b0b0f",
          color: "#ecebe8",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <p style={{ fontFamily: "ui-monospace, monospace", fontSize: 14, color: "#e8b34b", margin: 0 }}>
          500
        </p>
        <h1 style={{ marginTop: 8, fontSize: 30, fontWeight: 700 }}>Projector malfunction</h1>
        <p style={{ marginTop: 12, maxWidth: 420, color: "#9b99a3" }}>
          Something went wrong on our side. Give it another try.
        </p>
        <button
          onClick={() => unstable_retry()}
          style={{
            marginTop: 24,
            borderRadius: 8,
            background: "#e8b34b",
            color: "#000",
            border: "none",
            padding: "10px 20px",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
