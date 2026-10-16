// All money is handled as integer cents to avoid floating-point errors.

// "12", "12.5", "12.50", "$1,234.56" -> cents. Returns null if invalid or <= 0.
export function parseDollarsToCents(input: string): number | null {
  const cleaned = input.trim().replace(/^\$/, "").replace(/,/g, "");
  const match = /^(\d{1,7})(?:\.(\d{0,2}))?$/.exec(cleaned);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return cents > 0 ? cents : null;
}

export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString("en-US");
  return `${sign}$${dollars}.${String(abs % 100).padStart(2, "0")}`;
}
