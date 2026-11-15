"use client";

import { useSyncExternalStore } from "react";

type Theme = "auto" | "light" | "dark";
const options: { value: Theme; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

// Appearance (dark mode D1, Brian 2026-11-15). Auto follows the phone/computer setting. Light/Dark are saved in a
// `theme` cookie for this browser; layout.tsx applies it before each page paints.
const listeners = new Set<() => void>();
const subscribe = (onChange: () => void) => {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
};
const readTheme = (): Theme => (/(?:^|; )theme=(light|dark)/.exec(document.cookie)?.[1] as Theme | undefined) ?? "auto";

function applyTheme(t: Theme) {
  if (t === "auto") {
    document.cookie = "theme=; path=/; max-age=0; samesite=lax";
    delete document.documentElement.dataset.theme;
  } else {
    document.cookie = `theme=${t}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.dataset.theme = t;
  }
  listeners.forEach((l) => l());
}

export function ThemeSwitch() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "auto" as Theme);
  return (
    <div role="radiogroup" aria-label="Appearance" className="inline-flex rounded-lg bg-gray-100 p-1 text-sm" data-theme-switch>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={theme === o.value}
          onClick={() => applyTheme(o.value)}
          className={`rounded-md px-4 py-1.5 font-medium ${theme === o.value ? "bg-surface text-brand-700 shadow-sm" : "text-gray-600"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
