// Search & filter for the group ledger. Pure, so it's shared by the page and CSV export.
export type LedgerFilters = {
  q?: string;
  category?: string;
  person?: string; // user id: paid, or part of the split
  currency?: string;
  from?: string; // YYYY-MM-DD
  to?: string;
};

type FilterableExpense = {
  description: string;
  notes: string | null;
  category: string;
  currency: string;
  expense_date: string;
  paid_by: string;
  splits: { user_id: string }[];
};
type FilterablePayment = { from_user: string; to_user: string; currency: string; paid_on: string; note: string | null };

const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export function parseFilters(sp: Record<string, string | string[] | undefined>): LedgerFilters {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  return {
    q: one("q").slice(0, 100) || undefined,
    category: one("category") || undefined,
    person: one("person") || undefined,
    currency: one("currency") || undefined,
    from: isDate(one("from")) ? one("from") : undefined,
    to: isDate(one("to")) ? one("to") : undefined,
  };
}

export function hasFilters(f: LedgerFilters): boolean {
  return Object.values(f).some(Boolean);
}

export function filterExpenses<T extends FilterableExpense>(list: T[], f: LedgerFilters): T[] {
  const q = f.q?.toLowerCase();
  return list.filter(
    (e) =>
      (!q || e.description.toLowerCase().includes(q) || (e.notes ?? "").toLowerCase().includes(q)) &&
      (!f.category || e.category === f.category) &&
      (!f.currency || e.currency === f.currency) &&
      (!f.person || e.paid_by === f.person || e.splits.some((s) => s.user_id === f.person)) &&
      (!f.from || e.expense_date >= f.from) &&
      (!f.to || e.expense_date <= f.to),
  );
}

// Payments only match text searches on their note, and have no category.
export function filterPayments<T extends FilterablePayment>(list: T[], f: LedgerFilters): T[] {
  if (f.category) return [];
  const q = f.q?.toLowerCase();
  return list.filter(
    (p) =>
      (!q || (p.note ?? "").toLowerCase().includes(q) || "payment".includes(q)) &&
      (!f.currency || p.currency === f.currency) &&
      (!f.person || p.from_user === f.person || p.to_user === f.person) &&
      (!f.from || p.paid_on >= f.from) &&
      (!f.to || p.paid_on <= f.to),
  );
}
