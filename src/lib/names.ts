// Names for name-only accounts ("Start now" and invite links): what friends see in the group.
export const MAX_NAME = 60;

export function parseName(raw: unknown): { name?: string; error?: string } {
  const name = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!name) return { error: "Please enter your name." };
  if (name.length > MAX_NAME) return { error: `That name is too long (${MAX_NAME} characters at most).` };
  return { name };
}
