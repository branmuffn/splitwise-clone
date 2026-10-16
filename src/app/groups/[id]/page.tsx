import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { Card } from "@/components/ui";
import { computeBalances, settleUp } from "@/lib/balances";
import { formatCents } from "@/lib/money";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { CopyCode } from "../copy-code";
import { ExpenseForm } from "../expense-form";

export default function GroupPage({ params }: PageProps<"/groups/[id]">) {
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-6">
        <Link href="/" className="text-sm font-medium text-brand-600 hover:underline">
          ‹ All groups
        </Link>
        <Suspense fallback={<p className="text-gray-500">Loading group…</p>}>
          <GroupDetail params={params} />
        </Suspense>
      </main>
    </>
  );
}

async function GroupDetail({ params }: { params: PageProps<"/groups/[id]">["params"] }) {
  const { id } = await params;
  const supabase = await createClient();

  const [user, { data: group }, { data: memberRows }, { data: expenses }] = await Promise.all([
    getCurrentUser(),
    supabase.from("groups").select("id, name, join_code").eq("id", id).maybeSingle(),
    supabase
      .from("group_members")
      .select("user_id, profiles(display_name, email)")
      .eq("group_id", id)
      .order("joined_at"),
    supabase
      .from("expenses")
      .select("id, description, amount_cents, paid_by, created_at")
      .eq("group_id", id)
      .order("created_at", { ascending: false }),
  ]);

  // RLS hides groups you aren't in, so this covers both "missing" and "not yours".
  if (!group || !user) notFound();

  const members = (memberRows ?? []).map((m) => ({
    id: m.user_id,
    name: m.profiles?.display_name ?? "Unknown",
  }));
  const nameOf = (userId: string) =>
    userId === user.id ? "You" : (members.find((m) => m.id === userId)?.name ?? "Someone");

  const balances = computeBalances(
    members.map((m) => m.id),
    expenses ?? [],
  );
  const transfers = settleUp(balances);

  return (
    <>
      <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{group.name}</h1>
          <p className="text-sm text-gray-500">{members.length} members</p>
        </div>
        <div className="sm:text-right">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Invite code</p>
          <CopyCode code={group.join_code} />
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Balances</h2>
          <Card className="divide-y divide-gray-100 p-0">
            {members.map((m) => {
              const cents = balances.get(m.id) ?? 0;
              return (
                <div key={m.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-500 text-sm font-semibold text-white">
                      {m.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="truncate">
                      {m.name}
                      {m.id === user.id && <span className="text-gray-400"> (you)</span>}
                    </span>
                  </span>
                  <span className={`shrink-0 text-right text-sm ${cents > 0 ? "text-brand-600" : cents < 0 ? "text-owe" : "text-gray-400"}`}>
                    {cents > 0 ? "gets back" : cents < 0 ? "owes" : "settled up"}
                    {cents !== 0 && <span className="block text-base font-semibold">{formatCents(Math.abs(cents))}</span>}
                  </span>
                </div>
              );
            })}
          </Card>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Settle up</h2>
          <Card className="p-0">
            {transfers.length > 0 ? (
              <ul className="divide-y divide-gray-100">
                {transfers.map((t) => (
                  <li key={`${t.from}-${t.to}`} className="px-5 py-3">
                    <span className={t.from === user.id ? "font-semibold text-owe" : "font-medium"}>{nameOf(t.from)}</span>
                    {t.from === user.id ? " owe " : " owes "}
                    <span className={t.to === user.id ? "font-semibold text-brand-600" : "font-medium"}>
                      {t.to === user.id ? "you" : nameOf(t.to)}
                    </span>{" "}
                    <span className="font-semibold">{formatCents(t.cents)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-6 text-center text-gray-500">Everyone is settled up 🎉</p>
            )}
          </Card>
        </section>
      </div>

      <ExpenseForm groupId={group.id} members={members} currentUserId={user.id} />

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Expenses</h2>
        {expenses && expenses.length > 0 ? (
          <Card className="divide-y divide-gray-100 p-0">
            {expenses.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-5 py-3.5">
                <div className="w-10 shrink-0 text-center text-xs uppercase leading-tight text-gray-500">
                  {new Date(e.created_at).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}
                  <div className="text-lg font-semibold text-gray-700">
                    {new Date(e.created_at).toLocaleDateString("en-US", { day: "numeric", timeZone: "UTC" })}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{e.description}</p>
                  <p className="text-sm text-gray-500">
                    {nameOf(e.paid_by)} paid {formatCents(e.amount_cents)}
                  </p>
                </div>
                <div className="text-right font-semibold">{formatCents(e.amount_cents)}</div>
              </div>
            ))}
          </Card>
        ) : (
          <Card className="text-center text-gray-500">No expenses yet. Add the first one above.</Card>
        )}
      </section>
    </>
  );
}
