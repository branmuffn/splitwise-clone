// Money is always an integer in the currency's minor unit (cents for USD, yen for JPY).

export const CURRENCIES = [
  { code: "USD", name: "US Dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British Pound" },
  { code: "CAD", name: "Canadian Dollar" },
  { code: "AUD", name: "Australian Dollar" },
  { code: "NZD", name: "New Zealand Dollar" },
  { code: "JPY", name: "Japanese Yen" },
  { code: "CNY", name: "Chinese Yuan" },
  { code: "HKD", name: "Hong Kong Dollar" },
  { code: "SGD", name: "Singapore Dollar" },
  { code: "KRW", name: "South Korean Won" },
  { code: "INR", name: "Indian Rupee" },
  { code: "PHP", name: "Philippine Peso" },
  { code: "THB", name: "Thai Baht" },
  { code: "VND", name: "Vietnamese Dong" },
  { code: "MXN", name: "Mexican Peso" },
  { code: "BRL", name: "Brazilian Real" },
  { code: "CHF", name: "Swiss Franc" },
  { code: "SEK", name: "Swedish Krona" },
  { code: "NOK", name: "Norwegian Krone" },
  { code: "DKK", name: "Danish Krone" },
  { code: "PLN", name: "Polish Zloty" },
  { code: "ZAR", name: "South African Rand" },
  { code: "AED", name: "UAE Dirham" },
  { code: "ILS", name: "Israeli New Shekel" },
  { code: "TRY", name: "Turkish Lira" },
] as const;

export function isCurrency(code: string): boolean {
  return CURRENCIES.some((c) => c.code === code);
}

// Number of decimal places for a currency: 2 for USD, 0 for JPY.
export function minorDigits(currency: string): number {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).resolvedOptions()
    .maximumFractionDigits ?? 2;
}

// Parse a decimal string ("12", "12.5", "1,234.56") into minor units.
// Returns null if invalid or out of range. Set allowZero for optional split fields.
export function parseAmount(input: string, currency = "USD", allowZero = false): number | null {
  const digits = minorDigits(currency);
  const cleaned = input.trim().replace(/^[^\d.-]+/, "").replace(/,/g, "");
  const pattern = digits === 0 ? /^(\d{1,9})\.?$/ : new RegExp(`^(\\d{1,9})(?:\\.(\\d{0,${digits}}))?$`);
  const match = pattern.exec(cleaned);
  if (!match) return null;
  const minor = Number(match[1]) * 10 ** digits + Number((match[2] ?? "").padEnd(digits, "0") || 0);
  if (minor > 2_000_000_000) return null; // fits a Postgres integer
  if (minor === 0 && !allowZero) return null;
  return minor;
}

export function formatMoney(minor: number, currency = "USD"): string {
  const digits = minorDigits(currency);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(minor / 10 ** digits);
}

// Minor units back into a plain decimal string for form inputs ("12.50", "1500").
export function toDecimalString(minor: number, currency = "USD"): string {
  const digits = minorDigits(currency);
  if (digits === 0) return String(minor);
  return `${Math.floor(minor / 10 ** digits)}.${String(minor % 10 ** digits).padStart(digits, "0")}`;
}
