// Reminder messages for the Remind button (group page and friend page). No email service: people with an email get a
// drafted email in their own mail app (mailto); people without one (name-only accounts, stand-ins) get the same text
// through the phone's share sheet, or copied on a computer (Brian, 2026-11-15).

export type Reminder = { subject: string; body: string };

// amounts: already formatted, e.g. ["$230.88", "€28.80"].
export function reminderText(opts: { to: string; from: string; amounts: string[]; groupName: string; link: string; standin?: boolean }): Reminder {
  const owed = joinAnd(opts.amounts);
  const how = opts.standin
    ? "Open this link and pick your name to see the details:"
    : "You can see the details and record the payment here:";
  return {
    subject: `Reminder: ${owed} for ${opts.groupName}`,
    body: `Hi ${opts.to},\n\nJust a friendly reminder that you owe me ${owed} for "${opts.groupName}".\n\n${how}\n${opts.link}\n\nThanks!\n${opts.from}`,
  };
}

export function mailtoHref(email: string, r: Reminder) {
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(r.subject)}&body=${encodeURIComponent(r.body)}`;
}

export function joinAnd(items: string[]) {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
