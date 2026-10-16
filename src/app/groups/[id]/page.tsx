import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { CopyCode } from "../copy-code";

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

  const [{ data: group }, { data: members }] = await Promise.all([
    supabase.from("groups").select("id, name, join_code").eq("id", id).maybeSingle(),
    supabase
      .from("group_members")
      .select("user_id, profiles(display_name, email)")
      .eq("group_id", id)
      .order("joined_at"),
  ]);

  // RLS hides groups you aren't in, so this covers both "missing" and "not yours".
  if (!group) notFound();

  return (
    <>
      <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{group.name}</h1>
          <p className="text-sm text-gray-500">{members?.length ?? 0} members</p>
        </div>
        <div className="sm:text-right">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Invite code</p>
          <CopyCode code={group.join_code} />
        </div>
      </Card>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Members</h2>
        <Card className="flex flex-wrap gap-2">
          {members?.map((m) => (
            <span
              key={m.user_id}
              className="inline-flex items-center gap-2 rounded-full bg-gray-100 py-1 pl-1 pr-3 text-sm"
            >
              <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-500 text-xs font-semibold text-white">
                {(m.profiles?.display_name ?? "?").charAt(0).toUpperCase()}
              </span>
              {m.profiles?.display_name}
            </span>
          ))}
        </Card>
      </section>
    </>
  );
}
