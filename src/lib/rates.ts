import type { Rates } from "./convert";

export type RateTable = { rates: Rates; updated: string };

// Daily reference rates (units per 1 USD) from open.er-api.com — free, no API key.
// Cached for an hour; returns null if the service is unreachable so pages still render.
export async function getRates(): Promise<RateTable | null> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.result !== "success" || typeof data.rates !== "object") return null;
    return { rates: data.rates as Rates, updated: String(data.time_last_update_utc ?? "") };
  } catch {
    return null;
  }
}
