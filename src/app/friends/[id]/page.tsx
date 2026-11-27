import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { OwedLines } from "@/components/owed-lines";
import { PageShell } from "@/components/page-shell";
import { RemindButton } from "@/components/remind-button";
import { Avatar, BackLink, Card, SectionTitle } from "@/components/ui";
import { loadFriends } from "@/lib/friend-data";
import type { Line } from "@/lib/friends";
import { formatMoney, toDecimalString } from "@/lib/money";
import { joinAnd, reminderText } from "@/lib/remind";

// One friend (Brian picked F1, 2026-11-15): what you owe each other in total and in each shared group, with Remind,
// Record payment and Settle up acting on that group's suggested payment.
export default function FriendPage({ params }: PageProps<"/friends/[id]">) {
  return (
    <PageShell fallback="Loading…">
      <FriendDetail params={params} />
    </PageShell>
  );
}

const button = "inline-flex min-h-10 items-center rounded-lg border px-3.5 text-sm font-semibold transition";

async function FriendDetail({ params }: Pick<PageProps<"/friends/[id]">, "params">) {
  const { id } = await params;
  const data = await loadFriends();
  if (!data) return null;
  const f = data.friends.find((x) => x.id === id);
  if (!f) notFound();
  const { user } = data;
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const me = user.displayName || "me";
  const money = (l: Line) => formatMoney(Math.abs(l.cents), l.currency);
  const settleUrl = (groupId: string, from: string, to: string, l: Line) =>
    `/groups/${groupId}/settle?from=${from}&to=${to}&amount=${toDecimalString(Math.abs(l.cents), l.currency)}&currency=${l.currency}`;
  const theyOwe = f.totals.filter((l) => l.cents > 0).map(money);
  const youOwe = f.totals.filter((l) => l.cents < 0).map(money);

  return (
    <>
      <BackLink href="/?tab=friends">Friends</BackLink>
      <Card className="space-y-3">
        <div className="flex items-center gap-3.5">
          <Avatar name={f.name} id={f.id} size="lg" />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold">{f.name}</h1>
            <p className="text-sm text-gray-500">
              {f.standin && "Not joined yet · "}In {joinAnd(f.groups.map((g) => g.groupName))}
            </p>
          </div>
        </div>
        {theyOwe.length === 0 && youOwe.length === 0 ? (
          <p className="text-lg font-semibold text-gray-500">All settled up 🎉</p>
        ) : (
          <div className="space-y-0.5 text-lg font-semibold">
            {theyOwe.length > 0 && <p className="text-brand-600">{f.name} owes you {joinAnd(theyOwe)}</p>}
            {youOwe.length > 0 && <p className="text-owe">You owe {f.name} {joinAnd(youOwe)}</p>}
          </div>
        )}
      </Card>

      <section>
        <SectionTitle>By group</SectionTitle>
        <Card className="divide-y divide-gray-100 p-0">
          {f.groups.map((g) => {
            const owedToMe = g.lines.filter((l) => l.cents > 0);
            const iOwe = g.lines.filter((l) => l.cents < 0);
            // Stand-ins can't open the group until they pick their name, so their reminder carries the invite link.
            const reminder =
              owedToMe.length > 0
                ? reminderText({
                    to: f.name, from: me, amounts: owedToMe.map(money), groupName: g.groupName, standin: f.standin,
                    link: f.standin ? `${origin}/join/${g.joinCode}` : `${origin}${settleUrl(g.groupId, f.id, user.id, owedToMe[0])}`,
                  })
                : null;
            return (
              <div key={g.groupId} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <Link href={`/groups/${g.groupId}`} className="block truncate font-medium hover:underline pointer-coarse:-my-2 pointer-coarse:py-2">{g.groupName}</Link>
                    <span className="text-xs text-gray-500">{g.memberCount} {g.memberCount === 1 ? "member" : "members"}</span>
                  </span>
                  <span className="shrink-0 text-right text-sm">
                    <OwedLines lines={g.lines} />
                  </span>
                </div>
                {(reminder || iOwe.length > 0) && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {reminder && (
                      <RemindButton name={f.name} email={f.email} reminder={reminder} className={`${button} border-gray-300 text-gray-700 hover:bg-gray-50`} />
                    )}
                    {owedToMe.length > 0 && (
                      <Link href={settleUrl(g.groupId, f.id, user.id, owedToMe[0])} className={`${button} border-brand-500 text-brand-700 hover:bg-brand-50`}>
                        Record payment
                      </Link>
                    )}
                    {iOwe.length > 0 && (
                      <Link href={settleUrl(g.groupId, user.id, f.id, iOwe[0])} className={`${button} border-transparent bg-owe text-white hover:brightness-95`}>
                        Settle up
                      </Link>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      </section>
    </>
  );
}
