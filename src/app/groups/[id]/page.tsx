import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { PageShell } from "@/components/page-shell";
import { Avatar, ButtonLink, Card, FormMessage, SectionTitle, formatDate } from "@/components/ui";
import { categoryOf } from "@/lib/categories";
import { loadGroup, type GroupData } from "@/lib/group-data";
import { formatMoney, toDecimalString } from "@/lib/money";
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

async function GroupDetail({ params, searchParams }: Pick<PageProps<"/groups/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const sp = await searchParams;
  const notice = Object.entries(notices).find(([k]) => {
    const [key, value] = k.split("=");
    return sp[key] === value;
  })?.[1];
  const data = await loadGroup(id);
  const { group, members, user } = data;

  return (
    <>
      <Link href="/" className="inline-block text-sm font-medium text-brand-600 hover:underline">‹ All groups</Link>
      {notice && <FormMessage state={{ message: notice }} />}

      <Card className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold">{group.name}</h1>
            <p className="text-sm text-gray-500">
              {members.length} {members.length === 1 ? "member" : "members"} · {group.default_currency}
              {group.simplify_debts ? " · simplified debts" : ""}
            </p>
            <YourBalance data={data} />
          </div>
          <div className="sm:text-right">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Invite code</p>
            <CopyCode code={group.join_code} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href={`/groups/${id}/expenses/new`}>+ Add expense</ButtonLink>
          <ButtonLink href={`/groups/${id}/settle`} variant="owe">Settle up</ButtonLink>
          <ButtonLink href={`/groups/${id}/activity`} variant="secondary">Activity</ButtonLink>
          <ButtonLink href={`/groups/${id}/settings`} variant="secondary">Settings</ButtonLink>
        </div>
      </Card>

      <div className="grid gap-6 sm:grid-cols-2">
        <Balances data={data} />
        <Suggested data={data} />
      </div>

      <Ledger data={data} currentUserId={user.id} />
    </>
  );
}

function YourBalance({ data }: { data: GroupData }) {
  const mine = [...data.balances].map(([cur, m]) => ({ cur, cents: m.get(data.user.id) ?? 0 })).filter((x) => x.cents);
  if (mine.length === 0) return <p className="mt-2 text-sm font-medium text-gray-500">You are all settled up.</p>;
  return (
    <div className="mt-2 space-y-0.5 text-sm font-medium">
      {mine.map(({ cur, cents }) => (
        <p key={cur} className={cents > 0 ? "text-brand-600" : "text-owe"}>
          {cents > 0 ? "You are owed " : "You owe "}
          {formatMoney(Math.abs(cents), cur)}
        </p>
      ))}
    </div>
  );
}

function Balances({ data }: { data: GroupData }) {
  const { members, balances, user } = data;
  return (
    <section>
      <SectionTitle>Balances</SectionTitle>
      <Card className="divide-y divide-gray-100 p-0">
        {members.map((m) => {
          const lines = [...balances].map(([cur, map]) => ({ cur, cents: map.get(m.id) ?? 0 })).filter((x) => x.cents);
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
                    <span className="font-semibold">{formatMoney(Math.abs(cents), cur)}</span>
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

function Suggested({ data }: { data: GroupData }) {
  const { transfers, user, youOr, group } = data;
  return (
    <section>
      <SectionTitle>{group.simplify_debts ? "Suggested payments" : "Who owes whom"}</SectionTitle>
      <Card className="p-0">
        {transfers.length === 0 ? (
          <p className="px-5 py-6 text-center text-gray-500">Everyone is settled up 🎉</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {transfers.map((t) => (
              <li key={`${t.currency}-${t.from}-${t.to}`} className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="text-sm">
                  <span className={t.from === user.id ? "font-semibold text-owe" : "font-medium"}>{youOr(t.from)}</span>
                  {t.from === user.id ? " owe " : " owes "}
                  <span className={t.to === user.id ? "font-semibold text-brand-600" : "font-medium"}>
                    {t.to === user.id ? "you" : youOr(t.to)}
                  </span>{" "}
                  <span className="font-semibold">{formatMoney(t.cents, t.currency)}</span>
                </span>
                <Link
                  href={`/groups/${group.id}/settle?from=${t.from}&to=${t.to}&amount=${toDecimalString(t.cents, t.currency)}&currency=${t.currency}`}
                  className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-brand-600 hover:bg-brand-50"
                >
                  Record
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}

type Row =
  | { kind: "expense"; date: string; created: string; e: GroupData["expenses"][number] }
  | { kind: "payment"; date: string; created: string; p: GroupData["payments"][number] };

function Ledger({ data, currentUserId }: { data: GroupData; currentUserId: string }) {
  const { expenses, payments, group, youOr } = data;
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
    <section>
      <SectionTitle>Expenses &amp; payments</SectionTitle>
      {rows.length === 0 ? (
        <Card className="text-center text-gray-500">
          No expenses yet.{" "}
          <Link href={`/groups/${group.id}/expenses/new`} className="font-semibold text-brand-600 hover:underline">
            Add the first one
          </Link>
        </Card>
      ) : (
        <div className="space-y-4">
          {[...months].map(([month, items]) => (
            <div key={month}>
              <p className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">{month}</p>
              <Card className="divide-y divide-gray-100 p-0">
                {items.map((r) => (r.kind === "expense" ? <ExpenseRow key={r.e.id} e={r.e} data={data} currentUserId={currentUserId} /> : (
                  <div key={r.p.id} className="flex items-center gap-3 px-4 py-3">
                    <DateBadge date={r.date} />
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-lg">💸</span>
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-medium">
                        {youOr(r.p.from_user)} paid {r.p.to_user === currentUserId ? "you" : youOr(r.p.to_user)}{" "}
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

function ExpenseRow({ e, data, currentUserId }: { e: GroupData["expenses"][number]; data: GroupData; currentUserId: string }) {
  const myShare = e.splits.find((s) => s.user_id === currentUserId)?.share_cents ?? 0;
  const paidByMe = e.paid_by === currentUserId;
  const net = paidByMe ? e.amount_cents - myShare : -myShare;
  const cat = categoryOf(e.category);
  return (
    <Link href={`/groups/${data.group.id}/expenses/${e.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-gray-50">
      <DateBadge date={e.expense_date} />
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gray-100 text-lg" title={cat.label}>{cat.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{e.description}</p>
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
