import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { BackLink, Card, SectionTitle, formatDate } from "@/components/ui";
import { CATEGORIES } from "@/lib/categories";
import { convertMinor } from "@/lib/convert";
import { loadGroup } from "@/lib/group-data";
import { formatMoney } from "@/lib/money";
import { getRates } from "@/lib/rates";

export default function StatsPage({ params, searchParams }: PageProps<"/groups/[id]/stats">) {
  return (
    <PageShell fallback="Loading charts…">
      <Stats params={params} searchParams={searchParams} />
    </PageShell>
  );
}

const RANGES = [
  { value: "all", label: "All time" },
  { value: "12m", label: "12 months" },
  { value: "30d", label: "30 days" },
] as const;

// Chart colors (validated with the dataviz palette checker against white):
// single-series bars use a darker brand green (≥3:1 contrast); the two-series chart uses
// categorical slots 1 (blue) and 2 (orange), which pass CVD and contrast checks.
const BAR = "#13876f";
const PAID = "#2a78d6";
const SHARE = "#eb6834";

async function Stats({ params, searchParams }: Pick<PageProps<"/groups/[id]/stats">, "params" | "searchParams">) {
  const { id } = await params;
  const sp = await searchParams;
  const range = RANGES.find((r) => r.value === sp.range)?.value ?? "all";
  const { group, expenses, members, youOr } = await loadGroup(id);
  const target = group.default_currency;
  const rates = await getRates();

  const since = rangeStart(range);
  const inRange = expenses.filter((e) => !since || e.expense_date >= since);

  // Convert every expense (and each person's share) into the group currency.
  let skipped = 0;
  const conv = (minor: number, cur: string) => (rates ? convertMinor(minor, cur, target, rates.rates) : cur === target ? minor : null);
  const rows = inRange.flatMap((e) => {
    const amount = conv(e.amount_cents, e.currency);
    if (amount === null) {
      skipped++;
      return [];
    }
    return [{ e, amount, share: (uid: string) => conv(e.splits.find((s) => s.user_id === uid)?.share_cents ?? 0, e.currency) ?? 0 }];
  });
  const total = rows.reduce((a, r) => a + r.amount, 0);

  const byCategory = CATEGORIES.map((c) => ({ ...c, spent: rows.filter((r) => r.e.category === c.value).reduce((a, r) => a + r.amount, 0) }))
    .filter((c) => c.spent > 0)
    .sort((a, b) => b.spent - a.spent);

  // Last 12 calendar months (or fewer if the group is newer), oldest first.
  const monthKey = (d: string) => d.slice(0, 7);
  const months = lastTwelveMonths();
  const firstUsed = rows.length ? rows.map((r) => monthKey(r.e.expense_date)).sort()[0] : months[11];
  const shownMonths = months.filter((m) => m >= firstUsed && (!since || m >= since.slice(0, 7)));
  const byMonth = shownMonths.map((m) => ({ month: m, value: rows.filter((r) => monthKey(r.e.expense_date) === m).reduce((a, r) => a + r.amount, 0) }));

  const people = members.map((m) => ({
    id: m.id,
    name: youOr(m.id),
    paid: rows.filter((r) => r.e.paid_by === m.id).reduce((a, r) => a + r.amount, 0),
    share: rows.reduce((a, r) => a + r.share(m.id), 0),
  }));

  const fmt = (v: number) => formatMoney(v, target);
  const top = byCategory[0];

  return (
    <>
      <BackLink href={`/groups/${id}`}>{group.name}</BackLink>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold">Spending charts</h1>
        <nav aria-label="Time range" className="inline-flex rounded-lg bg-gray-100 p-1 text-sm">
          {RANGES.map((r) => (
            <Link
              key={r.value}
              href={`/groups/${id}/stats${r.value === "all" ? "" : `?range=${r.value}`}`}
              aria-current={range === r.value ? "page" : undefined}
              className={`rounded-md px-3 py-1 font-medium ${range === r.value ? "bg-white text-brand-700 shadow-sm" : "text-gray-600"}`}
            >
              {r.label}
            </Link>
          ))}
        </nav>
      </div>
      <p className="-mt-3 text-xs text-gray-500">
        All amounts in {target}
        {rates ? <>, converted at today&apos;s rates (<a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer" className="underline">Rates by Exchange Rate API</a>)</> : " (rates unavailable: only " + target + " expenses are included)"}
        {skipped > 0 && `. ${skipped} expense${skipped === 1 ? "" : "s"} skipped (no rate)`}.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile label="Total spent" value={fmt(total)} />
        <Tile label="Expenses" value={String(rows.length)} />
        <Tile label="Top category" value={top ? `${top.icon} ${top.label}` : "—"} className="col-span-2 sm:col-span-1" />
      </div>

      {rows.length === 0 ? (
        <Card className="text-center text-gray-500">No expenses in this period yet.</Card>
      ) : (
        <>
          <section>
            <SectionTitle>Spending by category</SectionTitle>
            <Card>
              <HBarChart rows={byCategory.map((c) => ({ key: c.value, label: `${c.icon} ${c.label}`, value: c.spent }))} fmt={fmt} total={total} />
              <DataTable head={["Category", "Spent", "Share of total"]} rows={byCategory.map((c) => [`${c.icon} ${c.label}`, fmt(c.spent), pct(c.spent, total)])} />
            </Card>
          </section>

          <section>
            <SectionTitle>Spending by month</SectionTitle>
            <Card>
              <ColumnChart cols={byMonth.map((m) => ({ key: m.month, label: formatDate(`${m.month}-01`, { month: "short" }), long: formatDate(`${m.month}-01`, { month: "long", year: "numeric" }), value: m.value }))} fmt={fmt} />
              <DataTable head={["Month", "Spent"]} rows={byMonth.map((m) => [formatDate(`${m.month}-01`, { month: "long", year: "numeric" }), fmt(m.value)])} />
            </Card>
          </section>

          <section>
            <SectionTitle>Who paid vs. who owes</SectionTitle>
            <Card>
              <PairedBars people={people} fmt={fmt} />
              <DataTable
                head={["Person", "Paid", "Their share", "Difference"]}
                rows={people.map((p) => [p.name, fmt(p.paid), fmt(p.share), `${p.paid - p.share >= 0 ? "+" : "−"}${fmt(Math.abs(p.paid - p.share))}`])}
              />
            </Card>
          </section>
        </>
      )}
    </>
  );
}

// Request-time date helpers (kept outside components; they read the clock).
function rangeStart(range: string): string {
  const days = range === "30d" ? 30 : range === "12m" ? 365 : 0;
  return days ? new Date(Date.now() - days * 864e5).toISOString().slice(0, 10) : "";
}

function lastTwelveMonths(): string[] {
  const now = new Date();
  return Array.from({ length: 12 }, (_, k) =>
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (11 - k), 1)).toISOString().slice(0, 7),
  );
}

function pct(v: number, total: number) {
  return total ? `${Math.round((v / total) * 100)}%` : "0%";
}

function Tile({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <Card className={`p-4 ${className}`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 truncate text-xl font-semibold">{value}</p>
    </Card>
  );
}

// Hover/focus tooltip shared by all charts. The whole row/column is the hit target.
function Tip({ children }: { children: React.ReactNode }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs text-white shadow group-hover:block group-focus:block"
    >
      {children}
    </span>
  );
}

function HBarChart({ rows, fmt, total }: { rows: { key: string; label: string; value: number }[]; fmt: (v: number) => string; total: number }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-1" aria-label="Spending by category">
      {rows.map((r) => (
        <li key={r.key} tabIndex={0} className="group relative grid grid-cols-[8.5rem_1fr] items-center gap-3 rounded-md px-1 py-1 outline-none hover:bg-gray-50 focus:bg-gray-50 sm:grid-cols-[11rem_1fr]">
          <span className="truncate text-sm text-gray-700">{r.label}</span>
          <span className="flex items-center gap-2">
            <span className="h-5 rounded-r-[4px]" style={{ width: `${Math.max((r.value / max) * 75, 1)}%`, background: BAR }} />
            <span className="shrink-0 text-xs font-medium text-gray-700 tabular-nums">{fmt(r.value)}</span>
          </span>
          <Tip>{r.label}: {fmt(r.value)} ({pct(r.value, total)})</Tip>
        </li>
      ))}
    </ul>
  );
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= v)!;
}

function ColumnChart({ cols, fmt }: { cols: { key: string; label: string; long: string; value: number }[]; fmt: (v: number) => string }) {
  const top = niceMax(Math.max(...cols.map((c) => c.value)));
  const ticks = [top, top / 2, 0];
  const maxKey = cols.reduce((a, c) => (c.value > a.value ? c : a), cols[0])?.key;
  return (
    <div className="flex gap-2">
      <div className="flex h-48 flex-col justify-between pb-5 text-right text-[11px] text-gray-500 tabular-nums">
        {ticks.map((t) => <span key={t} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">{fmt(t).replace(/\.00$/, "")}</span>)}
      </div>
      <div className="relative flex-1">
        <div className="pointer-events-none absolute inset-x-0 top-0 bottom-5 flex flex-col justify-between">
          {ticks.map((t) => <span key={t} className="h-px bg-gray-200" />)}
        </div>
        <ul className="relative flex h-48 items-end gap-[2px]" aria-label="Spending by month">
          {cols.map((c) => (
            <li key={c.key} tabIndex={0} className="group relative flex h-full flex-1 flex-col items-center justify-end outline-none">
              {c.key === maxKey && c.value > 0 && <span className="mb-0.5 text-[10px] font-medium text-gray-700 tabular-nums">{fmt(c.value).replace(/\.\d+$/, "")}</span>}
              <span className="flex w-full flex-1 items-end justify-center rounded-t-sm group-hover:bg-gray-50 group-focus:bg-gray-50" style={{ maxHeight: "calc(100% - 1.25rem)" }}>
                <span className="w-full max-w-6 rounded-t-[4px]" style={{ height: `${(c.value / top) * 100}%`, minHeight: c.value ? 2 : 0, background: BAR }} />
              </span>
              <span className="mt-1 h-4 text-[11px] text-gray-500">{c.label}</span>
              <Tip>{c.long}: {fmt(c.value)}</Tip>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function PairedBars({ people, fmt }: { people: { id: string; name: string; paid: number; share: number }[]; fmt: (v: number) => string }) {
  const max = Math.max(...people.flatMap((p) => [p.paid, p.share]), 1);
  return (
    <div>
      <div className="mb-3 flex gap-4 text-xs text-gray-700" aria-label="Legend">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: PAID }} />Paid</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: SHARE }} />Their share</span>
      </div>
      <ul className="space-y-3">
        {people.map((p) => (
          <li key={p.id} tabIndex={0} className="group relative grid grid-cols-[6rem_1fr] items-center gap-3 rounded-md px-1 py-1 outline-none hover:bg-gray-50 focus:bg-gray-50 sm:grid-cols-[8rem_1fr]">
            <span className="truncate text-sm text-gray-700">{p.name}</span>
            <span className="flex flex-col gap-[2px]">
              {[{ v: p.paid, c: PAID }, { v: p.share, c: SHARE }].map((b, i) => (
                <span key={i} className="flex items-center gap-2">
                  <span className="h-3.5 rounded-r-[4px]" style={{ width: `${Math.max((b.v / max) * 75, b.v ? 1 : 0)}%`, background: b.c }} />
                  <span className="shrink-0 text-[11px] text-gray-600 tabular-nums">{fmt(b.v)}</span>
                </span>
              ))}
            </span>
            <Tip>{p.name}: paid {fmt(p.paid)}, share {fmt(p.share)}</Tip>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DataTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <details className="mt-4 text-sm">
      <summary className="cursor-pointer text-xs font-semibold text-brand-600">Show as table</summary>
      <table className="mt-2 w-full text-left">
        <thead className="text-xs text-gray-500">
          <tr>{head.map((h, i) => <th key={h} className={`py-1 font-medium ${i ? "text-right" : ""}`}>{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r[0]}>{r.map((c, i) => <td key={i} className={`py-1.5 ${i ? "text-right tabular-nums" : ""}`}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
