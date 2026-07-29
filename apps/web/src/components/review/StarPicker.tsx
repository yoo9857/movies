"use client";

// Half-star rating picker. Pointer picks by half, keyboard steps by half, and
// the underlying value stays the 0–10 scale the API expects.
import { useState } from "react";

const LABELS: [number, string][] = [
  [10, "A masterpiece"],
  [9, "Extraordinary"],
  [8, "Excellent"],
  [7, "Very good"],
  [6, "Good"],
  [5, "Fine"],
  [4, "Flawed"],
  [3, "Weak"],
  [2, "Bad"],
  [1, "Awful"],
  [0, "Unwatchable"],
];

function verdictWord(value: number): string {
  for (const [min, label] of LABELS) if (value >= min) return label;
  return "";
}

export function StarPicker({
  value,
  onChange,
}: {
  value: number; // 0–10
  onChange: (v: number) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value;
  const stars = shown / 2; // 0–5

  return (
    <div>
      <div className="flex items-center gap-3">
        <div
          className="flex gap-1"
          role="slider"
          tabIndex={0}
          aria-label="Rating out of 5 stars"
          aria-valuemin={0}
          aria-valuemax={5}
          aria-valuenow={value / 2}
          aria-valuetext={`${(value / 2).toFixed(1)} stars — ${verdictWord(value)}`}
          onMouseLeave={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowUp") {
              e.preventDefault();
              onChange(Math.min(10, value + 0.5));
            } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
              e.preventDefault();
              onChange(Math.max(0, value - 0.5));
            } else if (e.key === "Home") {
              e.preventDefault();
              onChange(0);
            } else if (e.key === "End") {
              e.preventDefault();
              onChange(10);
            }
          }}
        >
          {[0, 1, 2, 3, 4].map((i) => {
            const fill = Math.max(0, Math.min(1, stars - i));
            return (
              <span key={i} className="relative block h-8 w-8">
                {/* two hit zones per star: left = half, right = whole */}
                <button
                  type="button"
                  aria-label={`${i + 0.5} stars`}
                  onMouseEnter={() => setHover(i * 2 + 1)}
                  onClick={() => onChange(i * 2 + 1)}
                  className="absolute inset-y-0 left-0 z-10 w-1/2 cursor-pointer"
                />
                <button
                  type="button"
                  aria-label={`${i + 1} stars`}
                  onMouseEnter={() => setHover(i * 2 + 2)}
                  onClick={() => onChange(i * 2 + 2)}
                  className="absolute inset-y-0 right-0 z-10 w-1/2 cursor-pointer"
                />
                <svg viewBox="0 0 20 20" className="h-8 w-8" aria-hidden="true">
                  <defs>
                    <linearGradient id={`pick-${i}-${Math.round(fill * 100)}`}>
                      <stop offset={`${fill * 100}%`} stopColor="var(--accent)" />
                      <stop offset={`${fill * 100}%`} stopColor="var(--border)" />
                    </linearGradient>
                  </defs>
                  <path
                    fill={`url(#pick-${i}-${Math.round(fill * 100)})`}
                    d="M10 1.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L10 14.9l-5.3 2.7 1-5.8L1.5 7.7l5.9-.9L10 1.5z"
                  />
                </svg>
              </span>
            );
          })}
        </div>

        <span className="font-mono text-2xl font-bold tabular-nums text-accent">
          {(shown / 2).toFixed(1)}
        </span>
        <span className="text-sm text-muted">
          {shown.toFixed(1)}/10 · {verdictWord(shown)}
        </span>
      </div>
      <p className="mt-1.5 text-xs text-muted">
        Click the left or right half of a star, or focus and use the arrow keys.
      </p>
    </div>
  );
}
