"use client";

import { useState } from "react";
import { mailtoHref, type Reminder } from "@/lib/remind";

// Remind (no email service needed). With an email: a drafted email opens in the user's own mail app (works without
// JavaScript). Without one (name-only accounts, stand-ins): phones open the share sheet (Messages, WhatsApp...) with the
// same message; computers copy it. data-remind-text carries the message for tests and no-JS readers.
export function RemindButton({ name, email, reminder, className = "" }: { name: string; email: string; reminder: Reminder; className?: string }) {
  const [copied, setCopied] = useState(false);
  if (email) {
    return (
      <a href={mailtoHref(email, reminder)} className={className} title={`Email ${name} a reminder`}>
        Remind
      </a>
    );
  }
  return (
    <button
      type="button"
      data-remind-share
      data-remind-text={reminder.body}
      title={`Send ${name} a reminder by text or any app`}
      className={className}
      onClick={async () => {
        if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
          try { await navigator.share({ title: reminder.subject, text: reminder.body }); return; } catch { /* closed: copy instead */ }
        }
        try {
          await navigator.clipboard.writeText(reminder.body);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch { /* clipboard blocked: nothing else to do */ }
      }}
    >
      {copied ? "Copied!" : "Remind"}
    </button>
  );
}
