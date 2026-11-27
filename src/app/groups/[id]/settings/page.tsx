import { headers } from "next/headers";
import { ActionButton } from "@/components/action-button";
import { PageShell } from "@/components/page-shell";
import { Avatar, BackLink, Card, FormMessage, SectionTitle } from "@/components/ui";
import { loadGroup } from "@/lib/group-data";
import { formatMoney } from "@/lib/money";
import { deleteGroup, leaveGroup, regenerateCode, removeMember, updateGroupSettings } from "../../actions";
import { CopyCode, InviteLink } from "../../copy-code";
import { AddStandInForm, GroupSettingsForm } from "../../settings-form";
import { addStandIn, claimStandIn } from "../../standin-actions";

export default function SettingsPage({ params, searchParams }: PageProps<"/groups/[id]/settings">) {
  return (
    <PageShell>
      <Settings params={params} searchParams={searchParams} />
    </PageShell>
  );
}

const savedMessages: Record<string, string> = {
  "1": "Settings saved.",
  code: "New invite code and link created. The old ones no longer work.",
  removed: "Member removed.",
  standin: "Added. They can take over their spot from the invite link.",
};

async function Settings({ params, searchParams }: Pick<PageProps<"/groups/[id]/settings">, "params" | "searchParams">) {
  const { id } = await params;
  const { saved } = await searchParams;
  const { group, members, user, balances } = await loadGroup(id);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const owes = (uid: string) =>
    [...balances].map(([cur, m]) => ({ cur, cents: m.get(uid) ?? 0 })).filter((x) => x.cents !== 0);

  return (
    <>
      <BackLink href={`/groups/${id}`}>{group.name}</BackLink>
      <h1 className="text-2xl font-semibold">Group settings</h1>
      {typeof saved === "string" && savedMessages[saved] && <FormMessage state={{ message: savedMessages[saved] }} />}

      <Card>
        <GroupSettingsForm action={updateGroupSettings.bind(null, id)} name={group.name} currency={group.default_currency} simplify={group.simplify_debts} />
      </Card>

      <section>
        <SectionTitle>Invite code</SectionTitle>
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex flex-wrap items-center gap-2">
            <InviteLink url={`${origin}/join/${group.join_code}`} groupName={group.name} />
            <CopyCode code={group.join_code} />
          </span>
          <ActionButton
            action={regenerateCode.bind(null, id)}
            confirmText="Create a new code? The current code and invite link will stop working."
            pendingText="Creating…"
          >
            New code
          </ActionButton>
        </Card>
      </section>

      <section id="members">
        <SectionTitle>Members</SectionTitle>
        <Card className="divide-y divide-gray-100 p-0">
          {members.map((m) => {
            const bal = owes(m.id);
            return (
              <div key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <Avatar name={m.name} id={m.id} />
                <div className="min-w-0 flex-1">
                  <p className="flex min-w-0 items-baseline font-medium">
                    <span className="truncate">{m.name}</span>
                    {m.id === user.id && <span className="ml-1 shrink-0 text-gray-400">(you)</span>}
                    {m.id === group.created_by && <span className="ml-2 shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">creator</span>}
                    {m.standin && <span className="ml-2 shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">not joined yet</span>}
                  </p>
                  <p className="truncate text-xs text-gray-500">
                    {m.standin ? "added by name" : m.email || "no email (name only)"}
                    {bal.length > 0 && <> · balance {bal.map((b) => `${b.cents > 0 ? "+" : "−"}${formatMoney(Math.abs(b.cents), b.cur)}`).join(", ")}</>}
                  </p>
                </div>
                {/* "That's me" for anyone but the person who added them */}
                {m.standin && m.addedBy !== user.id && (
                  <ActionButton
                    action={claimStandIn.bind(null, id, m.id)}
                    confirmText={`Are you ${m.name}? Everything logged for ${m.name} becomes yours, and ${m.name} disappears from the list.`}
                    variant="secondary"
                    className="px-2 py-1 text-xs max-sm:min-h-10 max-sm:px-3 max-sm:text-sm"
                    pendingText="Moving…"
                  >
                    That&apos;s me
                  </ActionButton>
                )}
                {m.id !== user.id && (
                  <ActionButton
                    action={removeMember.bind(null, id, m.id)}
                    confirmText={`Remove ${m.name} from the group?`}
                    variant="ghost"
                    className="px-2 py-1 text-xs max-sm:min-h-10 max-sm:px-3 max-sm:text-sm"
                    pendingText="Removing…"
                  >
                    Remove
                  </ActionButton>
                )}
              </div>
            );
          })}
          <div className="px-5 py-4">
            <AddStandInForm action={addStandIn.bind(null, id)} />
          </div>
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
