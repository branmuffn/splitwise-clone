// Currency conversion for display. Rates are "units per 1 USD" (open.er-api.com format).
import { minorDigits } from "./money.ts";

export type Rates = Record<string, number>;

export function convertMinor(minor: number, from: string, to: string, rates: Rates): number | null {
  if (from === to) return minor;
  const rFrom = rates[from];
  const rTo = rates[to];
  if (!rFrom || !rTo) return null;
  const major = minor / 10 ** minorDigits(from);
  return Math.round((major / rFrom) * rTo * 10 ** minorDigits(to));
}

// Collapse per-currency balances into one currency. Rounding can leave the total a cent
// or two off zero; that residual goes to the largest balance so it still sums to zero.
export function convertBalances(
  balances: Map<string, Map<string, number>>,
  target: string,
  rates: Rates,
): { net: Map<string, number>; missing: string[] } {
  const net = new Map<string, number>();
  const missing: string[] = [];
  for (const [currency, inner] of balances) {
    for (const [user, cents] of inner) {
      const c = convertMinor(cents, currency, target, rates);
      if (c === null) {
        if (!missing.includes(currency)) missing.push(currency);
        continue;
      }
      net.set(user, (net.get(user) ?? 0) + c);
    }
  }
  const residual = [...net.values()].reduce((a, b) => a + b, 0);
  if (residual !== 0 && net.size > 0) {
    const [biggest] = [...net].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
    net.set(biggest, net.get(biggest)! - residual);
  }
  return { net, missing };
}
