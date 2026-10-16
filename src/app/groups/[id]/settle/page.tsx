import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { BackLink, Card, SectionTitle } from "@/components/ui";
import { loadGroup } from "@/lib/group-data";
import { formatMoney, isCurrency, toDecimalString } from "@/lib/money";
import { SettleForm } from "../../settle-form";

export default function SettlePage({ params, searchParams }: PageProps<"/groups/[id]/settle">) {
  return (
    <PageShell>
      <Settle params={params} searchParams={searchParams} />
    </PageShell>
  );
}

async function Settle({ params, searchParams }: Pick<PageProps<"/groups/[id]/settle">, "params" | "searchParams">) {
  const { id } = await params;
  const sp = await searchParams;
  const { group, members, user, transfers, youOr } = await loadGroup(id);
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const isMember = (uid: string) => members.some((m) => m.id === uid);

  // Default to the current user's biggest debt if nothing was picked.
  const mine = transfers.find((t) => t.from === user.id) ?? transfers.find((t) => t.to === user.id);
  const from = isMember(str("from")) ? str("from") : (mine?.from ?? user.id);
  const to = isMember(str("to")) ? str("to") : (mine?.to ?? members.find((m) => m.id !== from)?.id ?? user.id);
  const currency = isCurrency(str("currency")) ? str("currency") : (mine?.currency ?? group.default_currency);
  const amount = /^[\d.]+$/.test(str("amount")) ? str("amount") : mine && !str("from") ? toDecimalString(mine.cents, mine.currency) : "";

  return (
    <>
      <BackLink href={`/groups/${id}`}>{group.name}</BackLink>
      <h1 className="text-2xl font-semibold">Record a payment</h1>
      {members.length < 2 ? (
        <Card className="text-gray-500">Invite someone to the group first.</Card>
      ) : (
        <SettleForm
          key={`${from}-${to}-${amount}-${currency}`}
          groupId={id}
          members={members}
          currentUserId={user.id}
          defaults={{ from, to, amount, currency, date: new Date().toISOString().slice(0, 10) }}
        />
      )}
      {transfers.length > 0 && (
        <section>
          <SectionTitle>Suggested</SectionTitle>
          <Card className="divide-y divide-gray-100 p-0">
            {transfers.map((t) => (
              <Link
                key={`${t.currency}-${t.from}-${t.to}`}
                href={`/groups/${id}/settle?from=${t.from}&to=${t.to}&amount=${toDecimalString(t.cents, t.currency)}&currency=${t.currency}`}
                className="flex justify-between px-5 py-3 text-sm hover:bg-gray-50"
              >
                <span>
                  {youOr(t.from)} → {t.to === user.id ? "you" : youOr(t.to)}
                </span>
                <span className="font-semibold">{formatMoney(t.cents, t.currency)}</span>
              </Link>
            ))}
          </Card>
        </section>
      )}
    </>
  );
}
