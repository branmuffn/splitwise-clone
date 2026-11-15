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

// "Copy invite link": phones open the share sheet (Messages, WhatsApp...); other browsers copy the link.
export function InviteLink({ url, groupName }: { url: string; groupName: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      data-invite-url={url}
      onClick={async () => {
        const text = `Join "${groupName}" on Splitwise clone to split costs:`;
        if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
          try { await navigator.share({ title: groupName, text, url }); return; } catch { /* closed: fall through to copy */ }
        }
        await navigator.clipboard.writeText(url);
        setDone(true);
        setTimeout(() => setDone(false), 1800);
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-brand-500 bg-white px-3 py-2 text-sm font-semibold text-brand-700 transition hover:bg-brand-50"
    >
      🔗 {done ? "Link copied!" : "Copy invite link"}
    </button>
  );
}
