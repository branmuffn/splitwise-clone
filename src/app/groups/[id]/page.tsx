import Link from "next/link";
import { headers } from "next/headers";
import { ActionButton } from "@/components/action-button";
import { LiveRefresh } from "@/components/live-refresh";
import { PageShell } from "@/components/page-shell";
import { Avatar, ButtonLink, Card, FormMessage, Input, Label, SectionTitle, Select, formatDate } from "@/components/ui";
import { simplifiedTransfers, type Transfer } from "@/lib/balances";
import { CATEGORIES, categoryOf } from "@/lib/categories";
import { convertBalances } from "@/lib/convert";
import { filterExpenses, filterPayments, hasFilters, parseFilters, type LedgerFilters } from "@/lib/filters";
import { loadGroup, type GroupData } from "@/lib/group-data";
import { formatMoney, toDecimalString } from "@/lib/money";
import { getRates } from "@/lib/rates";
import { deletePayment } from "../payment-actions";
import { CopyCode } from "../copy-code";

export default function GroupPage({ params, searchParams }: PageProps<"/groups/[id]">) {
  return (
    <PageShell fallback="Loading group…">
      <GroupDetail params={params} searchParams={searchParams} />
    </PageShell>
  );
}

const notices: Record<string, string> = {
  "deleted=expense": "Expense deleted.",
  "deleted=payment": "Payment deleted.",
  "paid=1": "Payment recorded.",
};

// Balances and suggested payments, either per currency or converted into one.
type BalanceView = {
  converted: boolean;
  currency: string | null; // set when converted
  rows: Map<string, { cur: string; cents: number }[]>; // user -> lines
  transfers: Transfer[];
  note?: React.ReactNode;
};

async function GroupDetail({ params, searchParams }: Pick<PageProps<"/groups/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const sp = await searchParams;
  const notice = Object.entries(notices).find(([k]) => {
    const [key, value] = k.split("=");
    return sp[key] === value;
  })?.[1];
  const filters = parseFilters(sp);
  const wantConverted = sp.view === "converted";
  const data = await loadGroup(id);
  const { group, members, user, balances } = data;
  const currencies = [...balances.keys()];

  let view: BalanceView = {
    converted: false,
    currency: null,
    rows: new Map(members.map((m) => [m.id, [...balances].map(([cur, map]) => ({ cur, cents: map.get(m.id) ?? 0 })).filter((x) => x.cents)])),
    transfers: data.transfers,
  };
  if (wantConverted) {
    const rates = await getRates();
    if (!rates) {
      view.note = <span className="text-owe">Exchange rates are unavailable right now, so balances are shown per currency.</span>;
    } else {
      const target = group.default_currency;
      const { net, missing } = convertBalances(balances, target, rates.rates);
      view = {
        converted: true,
        currency: target,
        rows: new Map(members.map((m) => [m.id, net.get(m.id) ? [{ cur: target, cents: net.get(m.id)! }] : []])),
        transfers: simplifiedTransfers(new Map([[target, net]])),
        note: (
          <>
            Approximate, converted to {target} at today&apos;s rates ({rates.updated.replace(/ \d\d:\d\d:\d\d.*$/, "")}).{" "}
            {missing.length > 0 && <>No rate for {missing.join(", ")}. </>}
            <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer" className="underline">Rates by Exchange Rate API</a>
          </>
        ),
      };
    }
  }

  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const filterQuery = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm font-medium text-brand-600 hover:underline">‹ All groups</Link>
        <LiveRefresh groupId={id} />
      </div>
      {notice && <FormMessage state={{ message: notice }} />}

      <Card className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold">{group.name}</h1>
            <p className="text-sm text-gray-500">
              {members.length} {members.length === 1 ? "member" : "members"} · {group.default_currency}
              {group.simplify_debts ? " · simplified debts" : ""}
            </p>
            <YourBalance view={view} userId={user.id} />
          </div>
          <div className="sm:text-right">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Invite code</p>
            <CopyCode code={group.join_code} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href={`/groups/${id}/expenses/new`}>+ Add expense</ButtonLink>
          <ButtonLink href={`/groups/${id}/settle`} variant="owe">Settle up</ButtonLink>
          <ButtonLink href={`/groups/${id}/stats`} variant="secondary">Charts</ButtonLink>
          <ButtonLink href={`/groups/${id}/activity`} variant="secondary">Activity</ButtonLink>
          <ButtonLink href={`/groups/${id}/settings`} variant="secondary">Settings</ButtonLink>
        </div>
      </Card>

      {(currencies.length > 1 || (currencies.length === 1 && currencies[0] !== group.default_currency) || wantConverted) && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-gray-500">Show balances:</span>
          <div className="inline-flex rounded-lg bg-gray-100 p-1">
            <Link href={`/groups/${id}${filterQuery ? `?${filterQuery}` : ""}`} className={`rounded-md px-3 py-1 font-medium ${!view.converted ? "bg-white text-brand-700 shadow-sm" : "text-gray-600"}`}>
              By currency
            </Link>
            <Link href={`/groups/${id}?view=converted${filterQuery ? `&${filterQuery}` : ""}`} className={`rounded-md px-3 py-1 font-medium ${view.converted ? "bg-white text-brand-700 shadow-sm" : "text-gray-600"}`}>
              All in {group.default_currency}
            </Link>
          </div>
        </div>
      )}
      {view.note && <p className="-mt-3 text-xs text-gray-500">{view.note}</p>}

      <div className="grid gap-6 sm:grid-cols-2">
        <Balances data={data} view={view} />
        <Suggested data={data} view={view} origin={origin} />
      </div>

      <Ledger data={data} filters={filters} keepView={wantConverted} filterQuery={filterQuery} />
    </>
  );
}

function YourBalance({ view, userId }: { view: BalanceView; userId: string }) {
  const mine = view.rows.get(userId) ?? [];
  if (mine.length === 0) return <p className="mt-2 text-sm font-medium text-gray-500">You are all settled up.</p>;
  return (
    <div className="mt-2 space-y-0.5 text-sm font-medium">
      {mine.map(({ cur, cents }) => (
        <p key={cur} className={cents > 0 ? "text-brand-600" : "text-owe"}>
          {cents > 0 ? "You are owed " : "You owe "}
          {view.converted && "≈ "}
          {formatMoney(Math.abs(cents), cur)}
        </p>
      ))}
    </div>
  );
}

function Balances({ data, view }: { data: GroupData; view: BalanceView }) {
  const { members, user } = data;
  return (
    <section>
      <SectionTitle>Balances</SectionTitle>
      <Card className="divide-y divide-gray-100 p-0">
        {members.map((m) => {
          const lines = view.rows.get(m.id) ?? [];
          return (
            <div key={m.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <span className="flex min-w-0 items-center gap-3">
                <Avatar name={m.name} id={m.id} />
                <span className="truncate">
                  {m.name}
                  {m.id === user.id && <span className="text-gray-400"> (you)</span>}
                </span>
              </span>
              <span className="shrink-0 text-right text-sm">
                {lines.length === 0 && <span className="text-gray-400">settled up</span>}
                {lines.map(({ cur, cents }) => (
                  <span key={cur} className={`block ${cents > 0 ? "text-brand-600" : "text-owe"}`}>
                    {cents > 0 ? "gets back " : "owes "}
                    <span className="font-semibold">{view.converted && "≈"}{formatMoney(Math.abs(cents), cur)}</span>
                  </span>
                ))}
              </span>
            </div>
          );
        })}
      </Card>
    </section>
  );
}

function Suggested({ data, view, origin }: { data: GroupData; view: BalanceView; origin: string }) {
  const { user, youOr, group, members } = data;
  const emailOf = (uid: string) => members.find((m) => m.id === uid)?.email ?? "";
  const me = members.find((m) => m.id === user.id)?.name ?? "me";
  return (
    <section>
      <SectionTitle>{view.converted || group.simplify_debts ? "Suggested payments" : "Who owes whom"}</SectionTitle>
      <Card className="p-0">
        {view.transfers.length === 0 ? (
          <p className="px-5 py-6 text-center text-gray-500">Everyone is settled up 🎉</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {view.transfers.map((t) => {
              const amount = formatMoney(t.cents, t.currency);
              const settleUrl = `/groups/${group.id}/settle?from=${t.from}&to=${t.to}&amount=${toDecimalString(t.cents, t.currency)}&currency=${t.currency}`;
              const remind =
                t.to === user.id && t.from !== user.id && emailOf(t.from)
                  ? `mailto:${encodeURIComponent(emailOf(t.from))}?subject=${encodeURIComponent(`Reminder: ${amount} for ${group.name}`)}&body=${encodeURIComponent(
                      `Hi ${youOr(t.from)},\n\nJust a friendly reminder that you owe me ${amount} for "${group.name}".\n\nYou can see the details and record the payment here:\n${origin}${settleUrl}\n\nThanks!\n${me}`,
                    )}`
                  : null;
              return (
                <li key={`${t.currency}-${t.from}-${t.to}`} className="flex items-center justify-between gap-3 px-5 py-3">
                  <span className="text-sm">
                    <span className={t.from === user.id ? "font-semibold text-owe" : "font-medium"}>{youOr(t.from)}</span>
                    {t.from === user.id ? " owe " : " owes "}
                    <span className={t.to === user.id ? "font-semibold text-brand-600" : "font-medium"}>
                      {t.to === user.id ? "you" : youOr(t.to)}
                    </span>{" "}
                    <span className="font-semibold">{view.converted && "≈"}{amount}</span>
                  </span>
                  <span className="flex shrink-0 gap-1">
                    {remind && (
                      <a href={remind} className="rounded-md px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-100" title={`Email ${youOr(t.from)} a reminder`}>
                        Remind
                      </a>
                    )}
                    <Link href={settleUrl} className="rounded-md px-2 py-1 text-xs font-semibold text-brand-600 hover:bg-brand-50">
                      Record
                    </Link>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </section>
  );
}

function FilterBar({ data, filters, keepView }: { data: GroupData; filters: LedgerFilters; keepView: boolean }) {
  const currencies = [...new Set([...data.expenses.map((e) => e.currency), ...data.payments.map((p) => p.currency)])].sort();
  return (
    <details className="group rounded-2xl border border-black/5 bg-white shadow-sm" open={hasFilters(filters)}>
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 text-sm font-medium text-gray-700">
        <span>🔍 Search &amp; filter</span>
        <span className="text-gray-400 transition group-open:rotate-180">▾</span>
      </summary>
      <form method="get" className="grid gap-3 border-t border-gray-100 px-5 py-4 sm:grid-cols-3">
        {keepView && <input type="hidden" name="view" value="converted" />}
        <div className="sm:col-span-3">
          <Label htmlFor="q">Search</Label>
          <Input id="q" name="q" type="search" defaultValue={filters.q ?? ""} placeholder="Description or notes" />
        </div>
        <div>
          <Label htmlFor="f-category">Category</Label>
          <Select id="f-category" name="category" defaultValue={filters.category ?? ""}>
            <option value="">Any</option>
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor="f-person">Person</Label>
          <Select id="f-person" name="person" defaultValue={filters.person ?? ""}>
            <option value="">Anyone</option>
            {data.members.map((m) => <option key={m.id} value={m.id}>{m.id === data.user.id ? `${m.name} (you)` : m.name}</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor="f-currency">Currency</Label>
          <Select id="f-currency" name="currency" defaultValue={filters.currency ?? ""}>
            <option value="">Any</option>
            {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor="f-from">From</Label>
          <Input id="f-from" name="from" type="date" defaultValue={filters.from ?? ""} />
        </div>
        <div>
          <Label htmlFor="f-to">To</Label>
          <Input id="f-to" name="to" type="date" defaultValue={filters.to ?? ""} />
        </div>
        <div className="flex items-end gap-2">
          <button type="submit" className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600">Apply</button>
          {hasFilters(filters) && (
            <Link href={`/groups/${data.group.id}${keepView ? "?view=converted" : ""}`} className="rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100">
              Clear
            </Link>
          )}
        </div>
      </form>
    </details>
  );
}

type Row =
  | { kind: "expense"; date: string; created: string; e: GroupData["expenses"][number] }
  | { kind: "payment"; date: string; created: string; p: GroupData["payments"][number] };

function Ledger({ data, filters, keepView, filterQuery }: { data: GroupData; filters: LedgerFilters; keepView: boolean; filterQuery: string }) {
  const { group, youOr, user } = data;
  const expenses = filterExpenses(data.expenses, filters);
  const payments = filterPayments(data.payments, filters);
  const filtered = hasFilters(filters);
  const rows: Row[] = [
    ...expenses.map((e) => ({ kind: "expense" as const, date: e.expense_date, created: e.created_at, e })),
    ...payments.map((p) => ({ kind: "payment" as const, date: p.paid_on, created: p.created_at, p })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.created.localeCompare(a.created));

  const months = new Map<string, Row[]>();
  for (const r of rows) {
    const key = formatDate(r.date, { month: "long", year: "numeric" });
    months.set(key, [...(months.get(key) ?? []), r]);
  }

  return (
    <section className="space-y-3">
      <SectionTitle
        action={
          <a href={`/groups/${group.id}/export${filterQuery ? `?${filterQuery}` : ""}`} className="text-xs font-semibold text-brand-600 hover:underline" download>
            ⬇ Export CSV
          </a>
        }
      >
        Expenses &amp; payments
      </SectionTitle>
      <FilterBar data={data} filters={filters} keepView={keepView} />
      {filtered && (
        <p className="px-1 text-sm text-gray-500">
          {rows.length} {rows.length === 1 ? "result" : "results"}
          {expenses.length > 0 && (
            <> · expenses total {Object.entries(expenses.reduce<Record<string, number>>((acc, e) => ({ ...acc, [e.currency]: (acc[e.currency] ?? 0) + e.amount_cents }), {}))
              .map(([c, v]) => formatMoney(v, c)).join(" + ")}</>
          )}
        </p>
      )}
      {rows.length === 0 ? (
        <Card className="text-center text-gray-500">
          {filtered ? "Nothing matches these filters." : (
            <>
              No expenses yet.{" "}
              <Link href={`/groups/${group.id}/expenses/new`} className="font-semibold text-brand-600 hover:underline">
                Add the first one
              </Link>
            </>
          )}
        </Card>
      ) : (
        <div className="space-y-4">
          {[...months].map(([month, items]) => (
            <div key={month}>
              <p className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">{month}</p>
              <Card className="divide-y divide-gray-100 p-0">
                {items.map((r) => (r.kind === "expense" ? <ExpenseRow key={r.e.id} e={r.e} data={data} /> : (
                  <div key={r.p.id} className="flex items-center gap-3 px-4 py-3">
                    <DateBadge date={r.date} />
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-lg">💸</span>
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-medium">
                        {youOr(r.p.from_user)} paid {r.p.to_user === user.id ? "you" : youOr(r.p.to_user)}{" "}
                        {formatMoney(r.p.amount_cents, r.p.currency)}
                      </p>
                      {r.p.note && <p className="truncate text-gray-500">{r.p.note}</p>}
                    </div>
                    <ActionButton
                      action={deletePayment.bind(null, group.id, r.p.id)}
                      confirmText="Delete this payment? Balances will change back."
                      variant="ghost"
                      className="px-2 py-1 text-xs"
                      pendingText="…"
                    >
                      Delete
                    </ActionButton>
                  </div>
                )))}
              </Card>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function DateBadge({ date }: { date: string }) {
  return (
    <div className="w-9 shrink-0 text-center text-[11px] uppercase leading-tight text-gray-500">
      {formatDate(date, { month: "short" })}
      <div className="text-base font-semibold text-gray-700">{formatDate(date, { day: "numeric" })}</div>
    </div>
  );
}

function ExpenseRow({ e, data }: { e: GroupData["expenses"][number]; data: GroupData }) {
  const me = data.user.id;
  const myShare = e.splits.find((s) => s.user_id === me)?.share_cents ?? 0;
  const net = e.paid_by === me ? e.amount_cents - myShare : -myShare;
  const cat = categoryOf(e.category);
  const badges = [
    (e.repeat_interval !== "none" || e.recurring_source_id) && { icon: "🔁", label: "Recurring" },
    e.receipt_path && { icon: "📎", label: "Has receipt" },
    e.commentCount > 0 && { icon: `💬${e.commentCount}`, label: `${e.commentCount} comments` },
  ].filter(Boolean) as { icon: string; label: string }[];
  return (
    <Link href={`/groups/${data.group.id}/expenses/${e.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-gray-50">
      <DateBadge date={e.expense_date} />
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gray-100 text-lg" title={cat.label}>{cat.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {e.description}
          {badges.map((b) => <span key={b.label} className="ml-1.5 text-xs font-normal text-gray-500" title={b.label} aria-label={b.label}>{b.icon}</span>)}
        </p>
        <p className="truncate text-sm text-gray-500">
          {data.youOr(e.paid_by)} paid {formatMoney(e.amount_cents, e.currency)}
        </p>
      </div>
      <div className="shrink-0 text-right text-xs">
        {net === 0 ? (
          <span className="text-gray-400">not involved</span>
        ) : (
          <>
            <span className={net > 0 ? "text-brand-600" : "text-owe"}>{net > 0 ? "you lent" : "you borrowed"}</span>
            <span className={`block text-sm font-semibold ${net > 0 ? "text-brand-600" : "text-owe"}`}>
              {formatMoney(Math.abs(net), e.currency)}
            </span>
          </>
        )}
      </div>
    </Link>
  );
}
