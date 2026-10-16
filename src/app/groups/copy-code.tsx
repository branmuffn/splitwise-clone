"use client";

import { useState } from "react";

export function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-2 rounded-lg border border-dashed border-brand-500 bg-brand-50 px-3 py-1.5 font-mono text-lg font-semibold tracking-[0.3em] text-brand-700 transition hover:bg-brand-100"
      title="Copy join code"
    >
      {code}
      <span className="font-sans text-xs font-medium tracking-normal">{copied ? "Copied!" : "Copy"}</span>
    </button>
  );
}
