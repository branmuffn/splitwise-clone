import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { Card, FormMessage, SectionTitle } from "@/components/ui";
import { computeBalances, netFor } from "@/lib/balances";
import { convertMinor } from "@/lib/convert";
import { formatMoney } from "@/lib/money";
import { getRates } from "@/lib/rates";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { CreateGroupForm, JoinGroupForm } from "./groups/group-forms";

export default function HomePage({ searchParams }: PageProps<"/">) {
  return (
    <PageShell fallback="Loading your groups…">
      <Dashboard searchParams={searchParams} />
    </PageShell>
  );
}

async function Dashboard({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  // Add any recurring expenses that have come due before computing balances.
  const { data: myGroups } = await supabase.from("group_members").select("group_id").eq("user_id", user.id);
  await Promise.all((myGroups ?? []).map((g) => supabase.rpc("materialize_recurring", { gid: g.group_id })));
  const [{ data: groups }, { data: expenses }, { data: payments }, rates] = await Promise.all([
    supabase.from("groups").select("id, name, group_members(count)").order("created_at", { ascending: false }),
    supabase.from("expenses").select("group_id, amount_cents, currency, paid_by, expense_splits(user_id, share_cents)"),
    supabase.from("payments").select("group_id, from_user, to_user, amount_cents, currency"),
    getRates(),
  ]);

  const perGroup = new Map(
    (groups ?? []).map((g) => [
      g.id,
      netFor(
        computeBalances(
          (expenses ?? []).filter((e) => e.group_id === g.id).map((e) => ({ ...e, splits: e.expense_splits })),
          (payments ?? []).filter((p) => p.group_id === g.id),
        ),
        user.id,
      ),
    ]),
  );

  // Totals across all groups, per currency.
  const owed = new Map<string, number>();
  const owe = new Map<string, number>();
  for (const lines of perGroup.values()) {
    for (const { currency, cents } of lines) {
      const target = cents > 0 ? owed : owe;
      target.set(currency, (target.get(currency) ?? 0) + Math.abs(cents));
    }
  }
  const list = (m: Map<string, number>) =>
    m.size === 0 ? <span className="text-gray-400">—</span> : [...m].map(([c, v]) => <span key={c} className="block">{formatMoney(v, c)}</span>);

  // One approximate overall number in the user's default currency, when there's more than one currency.
  const home = user.defaultCurrency;
  const allCurrencies = new Set([...owed.keys(), ...owe.keys()]);
  let overall: number | null = null;
  if (rates && (allCurrencies.size > 1 || (allCurrencies.size === 1 && !allCurrencies.has(home)))) {
    overall = 0;
    for (const [c, v] of owed) overall += convertMinor(v, c, home, rates.rates) ?? 0;
    for (const [c, v] of owe) overall -= convertMinor(v, c, home, rates.rates) ?? 0;
  }

  const notice = sp.left ? "You left the group." : sp.deleted ? "Group deleted." : null;

  return (
    <>
      {notice && <FormMessage state={{ message: notice }} />}
      <h1 className="text-2xl font-semibold">Hi, {user.displayName} 👋</h1>

      <Card className="grid grid-cols-2 divide-x divide-gray-100 p-0 text-center">
        <div className="px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">You are owed</p>
          <p className="mt-1 text-lg font-semibold text-brand-600">{list(owed)}</p>
        </div>
        <div className="px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">You owe</p>
          <p className="mt-1 text-lg font-semibold text-owe">{list(owe)}</p>
        </div>
        {overall !== null && (
          <p className="col-span-2 border-t border-gray-100 px-4 py-2 text-sm text-gray-600">
            Overall: {overall === 0 ? "settled up" : overall > 0 ? "you are owed" : "you owe"}{" "}
            {overall !== 0 && <b className={overall > 0 ? "text-brand-600" : "text-owe"}>≈ {formatMoney(Math.abs(overall), home)}</b>}
            <span className="block text-xs text-gray-400">
              Converted to {home} at today&apos;s rates ·{" "}
              <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer" className="underline">Rates by Exchange Rate API</a>
            </span>
          </p>
        )}
      </Card>

      <section>
        <SectionTitle>Your groups</SectionTitle>
        {groups && groups.length > 0 ? (
          <Card className="divide-y divide-gray-100 p-0">
            {groups.map((g) => {
              const lines = perGroup.get(g.id) ?? [];
              return (
                <Link key={g.id} href={`/groups/${g.id}`} className="flex items-center justify-between gap-3 px-5 py-4 transition hover:bg-gray-50">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-100 font-semibold text-brand-700">
                      {g.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{g.name}</span>
                      <span className="text-xs text-gray-500">{g.group_members[0]?.count ?? 0} members</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-sm">
                    {lines.length === 0 ? (
                      <span className="text-gray-400">settled up</span>
                    ) : (
                      lines.map(({ currency, cents }) => (
                        <span key={currency} className={`block ${cents > 0 ? "text-brand-600" : "text-owe"}`}>
                          {cents > 0 ? "you are owed " : "you owe "}
                          <b>{formatMoney(Math.abs(cents), currency)}</b>
                        </span>
                      ))
                    )}
                  </span>
                </Link>
              );
            })}
          </Card>
        ) : (
          <Card className="text-center text-gray-500">
            You&apos;re not in any groups yet. Create one or join with a code below.
          </Card>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <CreateGroupForm defaultCurrency={user.defaultCurrency} />
        <JoinGroupForm />
      </div>
    </>
  );
}
