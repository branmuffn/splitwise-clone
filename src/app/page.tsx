import Link from "next/link";
import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { Card } from "@/components/ui";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { CreateGroupForm, JoinGroupForm } from "./groups/group-forms";

export default function HomePage() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-6">
        <Suspense fallback={<p className="text-gray-500">Loading your groups…</p>}>
          <Dashboard />
        </Suspense>
        <div className="grid gap-4 sm:grid-cols-2">
          <CreateGroupForm />
          <JoinGroupForm />
        </div>
      </main>
    </>
  );
}

async function Dashboard() {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const { data: groups } = await supabase
    .from("groups")
    .select("id, name, group_members(count)")
    .order("created_at", { ascending: false });

  return (
    <section>
      <h1 className="mb-3 text-2xl font-semibold">Hi, {user?.displayName} 👋</h1>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Your groups</h2>
      {groups && groups.length > 0 ? (
        <Card className="divide-y divide-gray-100 p-0">
          {groups.map((g) => (
            <Link
              key={g.id}
              href={`/groups/${g.id}`}
              className="flex items-center justify-between px-5 py-4 transition hover:bg-gray-50"
            >
              <span className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-100 font-semibold text-brand-700">
                  {g.name.charAt(0).toUpperCase()}
                </span>
                <span className="font-medium">{g.name}</span>
              </span>
              <span className="text-sm text-gray-500">
                {g.group_members[0]?.count ?? 0} members ›
              </span>
            </Link>
          ))}
        </Card>
      ) : (
        <Card className="text-center text-gray-500">
          You&apos;re not in any groups yet. Create one or join with a code below.
        </Card>
      )}
    </section>
  );
}
