import Link from "next/link";
import { ButtonLink, Card, Logo } from "@/components/ui";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { joinByInvite } from "../actions";
import { JoinForm } from "./join-form";

// Invite link: /join/<join code>. Friends open it, type a name, and land in the group (no sign-up).
export default async function JoinPage({ params }: PageProps<"/join/[code]">) {
  const code = decodeURIComponent((await params).code).trim().toUpperCase();
  const valid = /^[A-Z0-9]{6}$/.test(code);
  const supabase = await createClient();
  const user = await getCurrentUser();

  // Name + member count for the invite card. If the preview function isn't in the database yet, show a generic card.
  const preview = valid ? await supabase.rpc("group_invite_preview", { code }) : null;
  const group = preview?.data?.[0] ?? null;
  const known = Boolean(preview && !preview.error);
  const broken = !valid || (known && !group);
  // Members can read their own groups, so this finds the group only if you're already in it.
  const standins = valid && known ? ((await supabase.rpc("group_standins", { code })).data ?? []) : [];
  const mine = valid && user ? (await supabase.from("groups").select("id, name").eq("join_code", code).maybeSingle()).data : null;

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Link href="/"><Logo className="text-xl" /></Link>
        </div>
        <Card>
          {broken ? (
            <>
              <h1 className="text-xl font-semibold">This invite link doesn&apos;t work</h1>
              <p className="mt-2 text-sm text-gray-600">The group may have made a new link. Ask your friend to send it again.</p>
              <ButtonLink href={user ? "/" : "/start"} className="mt-5 w-full py-3 text-base">{user ? "Go to your groups" : "Start your own group"}</ButtonLink>
            </>
          ) : mine ? (
            <>
              <h1 className="text-xl font-semibold">You&apos;re already in {mine.name}</h1>
              {standins.length > 0 && (
                <p className="mt-2 text-sm text-gray-600">Are you one of the people added by name? In the group&apos;s Settings, tap &quot;That&apos;s me&quot; next to your name.</p>
              )}
              <ButtonLink href={`/groups/${mine.id}`} className="mt-5 w-full py-3 text-base">Open the group</ButtonLink>
            </>
          ) : (
            <>
              <span className="inline-block rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">Invite</span>
              <div className="mt-3 flex items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-100 text-lg font-semibold text-brand-700">
                  {(group?.name ?? "G").charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <h1 className="truncate text-xl font-semibold">{group?.name ?? "You're invited to a group"}</h1>
                  {group && <p className="text-sm text-gray-500">{group.members} {group.members === 1 ? "member" : "members"}</p>}
                </div>
              </div>
              <JoinForm action={joinByInvite.bind(null, code)} signedInAs={user?.displayName ?? null} standins={standins} />
            </>
          )}
        </Card>
      </div>
    </main>
  );
}
