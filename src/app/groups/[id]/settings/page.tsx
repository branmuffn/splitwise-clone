import { ActionButton } from "@/components/action-button";
import { PageShell } from "@/components/page-shell";
import { Avatar, BackLink, Card, FormMessage, SectionTitle } from "@/components/ui";
import { loadGroup } from "@/lib/group-data";
import { formatMoney } from "@/lib/money";
import { deleteGroup, leaveGroup, regenerateCode, removeMember } from "../../actions";
import { CopyCode } from "../../copy-code";
import { GroupSettingsForm } from "../../settings-form";

export default function SettingsPage({ params, searchParams }: PageProps<"/groups/[id]/settings">) {
  return (
    <PageShell>
      <Settings params={params} searchParams={searchParams} />
    </PageShell>
  );
}

const savedMessages: Record<string, string> = {
  "1": "Settings saved.",
  code: "New invite code created. The old one no longer works.",
  removed: "Member removed.",
};

async function Settings({ params, searchParams }: Pick<PageProps<"/groups/[id]/settings">, "params" | "searchParams">) {
  const { id } = await params;
  const { saved } = await searchParams;
  const { group, members, user, balances } = await loadGroup(id);
  const owes = (uid: string) =>
    [...balances].map(([cur, m]) => ({ cur, cents: m.get(uid) ?? 0 })).filter((x) => x.cents !== 0);

  return (
    <>
      <BackLink href={`/groups/${id}`}>{group.name}</BackLink>
      <h1 className="text-2xl font-semibold">Group settings</h1>
      {typeof saved === "string" && savedMessages[saved] && <FormMessage state={{ message: savedMessages[saved] }} />}

      <Card>
        <GroupSettingsForm groupId={id} name={group.name} currency={group.default_currency} simplify={group.simplify_debts} />
      </Card>

      <section>
        <SectionTitle>Invite code</SectionTitle>
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <CopyCode code={group.join_code} />
          <ActionButton
            action={regenerateCode.bind(null, id)}
            confirmText="Create a new code? The current code will stop working."
            pendingText="Creating…"
          >
            New code
          </ActionButton>
        </Card>
      </section>

      <section>
        <SectionTitle>Members</SectionTitle>
        <Card className="divide-y divide-gray-100 p-0">
          {members.map((m) => {
            const bal = owes(m.id);
            return (
              <div key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <Avatar name={m.name} id={m.id} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {m.name}
                    {m.id === user.id && <span className="text-gray-400"> (you)</span>}
                    {m.id === group.created_by && <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">creator</span>}
                  </p>
                  <p className="truncate text-xs text-gray-500">
                    {m.email}
                    {bal.length > 0 && <> · balance {bal.map((b) => `${b.cents > 0 ? "+" : "−"}${formatMoney(Math.abs(b.cents), b.cur)}`).join(", ")}</>}
                  </p>
                </div>
                {m.id !== user.id && (
                  <ActionButton
                    action={removeMember.bind(null, id, m.id)}
                    confirmText={`Remove ${m.name} from the group?`}
                    variant="ghost"
                    className="px-2 py-1 text-xs"
                    pendingText="Removing…"
                  >
                    Remove
                  </ActionButton>
                )}
              </div>
            );
          })}
        </Card>
        <p className="mt-2 px-1 text-xs text-gray-500">Members must be settled up (zero balance) before they can leave or be removed.</p>
      </section>

      <section>
        <SectionTitle>Danger zone</SectionTitle>
        <Card className="flex flex-wrap gap-3">
          <ActionButton
            action={leaveGroup.bind(null, id)}
            confirmText={members.length === 1 ? "You're the last member, so leaving deletes the group. Continue?" : "Leave this group?"}
            variant="danger"
            pendingText="Leaving…"
          >
            Leave group
          </ActionButton>
          {group.created_by === user.id && (
            <ActionButton
              action={deleteGroup.bind(null, id)}
              confirmText={`Delete “${group.name}” and all its expenses for everyone? This can't be undone.`}
              variant="danger"
              pendingText="Deleting…"
            >
              Delete group
            </ActionButton>
          )}
        </Card>
      </section>
    </>
  );
}
