import Link from "next/link";
import { LiveRefresh } from "@/components/live-refresh";
import { LocalTime } from "@/components/local-time";
import { PageShell } from "@/components/page-shell";
import { BackLink, Card } from "@/components/ui";
import { loadGroup } from "@/lib/group-data";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export default function ActivityPage({ params }: PageProps<"/groups/[id]/activity">) {
  return (
    <PageShell>
      <Activity params={params} />
    </PageShell>
  );
}

const icons: Record<string, string> = {
  expense_added: "➕",
  expense_updated: "✏️",
  expense_deleted: "🗑️",
  payment_added: "💸",
  payment_deleted: "↩️",
  member_joined: "👋",
  member_left: "🚪",
  member_removed: "🚫",
  group_renamed: "🏷️",
  comment_added: "💬",
  comment_deleted: "💬",
};

async function Activity({ params }: Pick<PageProps<"/groups/[id]/activity">, "params">) {
  const { id } = await params;
  const { group, youOr, expenses, user } = await loadGroup(id);
  const supabase = await createClient();
  const { data: items } = await supabase
    .from("activity")
    .select("*")
    .eq("group_id", id)
    .order("created_at", { ascending: false })
    .limit(200);

  const who = (uid: unknown) => (typeof uid === "string" ? youOr(uid) : "Someone");
  const money = (d: Record<string, unknown>) => formatMoney(Number(d.amount_cents ?? 0), String(d.currency ?? "USD"));
  const describe = (kind: string, actor: string | null, d: Record<string, unknown>) => {
    const a = who(actor);
    switch (kind) {
      case "expense_added":
        return d.recurring ? <>Recurring expense <b>“{String(d.description)}”</b> ({money(d)}) was added automatically</> : <>{a} added <b>“{String(d.description)}”</b> ({money(d)})</>;
      case "expense_updated": return <>{a} updated <b>“{String(d.description)}”</b> ({money(d)})</>;
      case "expense_deleted": return <>{a} deleted <b>“{String(d.description)}”</b> ({money(d)})</>;
      case "payment_added": return <>{a} recorded a payment: {who(d.from_user)} paid {d.to_user === user.id ? "you" : who(d.to_user)} {money(d)}</>;
      case "payment_deleted": return <>{a} deleted a payment: {who(d.from_user)} → {who(d.to_user)} {money(d)}</>;
      case "member_joined": return <>{who(d.user_id)} joined the group</>;
      case "member_left": return <>{who(d.user_id)} left the group</>;
      case "member_removed": return <>{a} removed {who(d.user_id)}</>;
      case "comment_added": return <>{a} commented on <b>“{String(d.description ?? "an expense")}”</b>: “{String(d.body)}”</>;
      case "comment_deleted": return <>{a} deleted a comment on <b>“{String(d.description ?? "an expense")}”</b></>;
      case "group_renamed": return <>{a} renamed the group from “{String(d.from)}” to “{String(d.to)}”</>;
      default: return <>{a}: {kind}</>;
    }
  };
  const live = new Set(expenses.map((e) => e.id));

  return (
    <>
      <div className="flex items-center justify-between">
        <BackLink href={`/groups/${id}`}>{group.name}</BackLink>
        <LiveRefresh groupId={id} />
      </div>
      <h1 className="text-2xl font-semibold">Activity</h1>
      <Card className="divide-y divide-gray-100 p-0">
        {(items ?? []).length === 0 && <p className="px-5 py-6 text-center text-gray-500">No activity yet.</p>}
        {(items ?? []).map((item) => {
          const d = item.details as Record<string, unknown>;
          const body = describe(item.kind, item.actor_id, d);
          const expenseId = typeof d.expense_id === "string" && live.has(d.expense_id) ? d.expense_id : null;
          return (
            <div key={item.id} className="flex gap-3 px-5 py-3">
              <span className="text-lg">{icons[item.kind] ?? "•"}</span>
              <div className="min-w-0 flex-1 text-sm">
                <p className="break-words">
                  {expenseId ? <Link href={`/groups/${id}/expenses/${expenseId}`} className="hover:underline">{body}</Link> : body}
                </p>
                <p className="text-xs text-gray-500"><LocalTime iso={item.created_at} /></p>
              </div>
            </div>
          );
        })}
      </Card>
    </>
  );
}
