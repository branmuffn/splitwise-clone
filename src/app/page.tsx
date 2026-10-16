import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { Card } from "@/components/ui";
import { getCurrentUser } from "@/lib/supabase/server";

export default function HomePage() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <Suspense fallback={<p className="text-gray-500">Loading…</p>}>
          <Dashboard />
        </Suspense>
      </main>
    </>
  );
}

async function Dashboard() {
  const user = await getCurrentUser();
  return (
    <Card>
      <h1 className="text-xl font-semibold">Hi, {user?.displayName}!</h1>
      <p className="text-sm text-gray-500">Signed in as {user?.email}</p>
    </Card>
  );
}
