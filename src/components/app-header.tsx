import Link from "next/link";
import { Suspense } from "react";
import { signOut } from "@/app/auth/actions";
import { isDemoEmail } from "@/lib/demo";
import { getCurrentUser } from "@/lib/supabase/server";
import { Button, Logo } from "./ui";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-10 bg-brand-500 text-white shadow-sm">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
        <Link href="/">
          <Logo className="[&>span:first-child]:bg-white [&>span:first-child]:text-brand-600" />
        </Link>
        <Suspense fallback={null}>
          <UserMenu />
        </Suspense>
      </div>
      <Suspense fallback={null}>
        <DemoBanner />
      </Suspense>
    </header>
  );
}

// Shown to one-click demo accounts so reviewers know the data is a private sample.
async function DemoBanner() {
  const user = await getCurrentUser();
  if (!user || !isDemoEmail(user.email)) return null;
  return (
    <div className="bg-amber-50 text-amber-900">
      <div className="mx-auto max-w-3xl px-4 py-2 text-xs sm:text-sm">
        👋 <b>You&apos;re in a demo account.</b> Sam and Riley are sample friends, and everything here is a private sandbox:
        add, edit, or delete anything. Signing out ends the demo.{" "}
        <form action={signOut} className="inline">
          <input type="hidden" name="next" value="/signup" />
          <button type="submit" className="font-semibold underline">Create a real account</button>
        </form>
      </div>
    </div>
  );
}

async function UserMenu() {
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <div className="flex items-center gap-3">
      <Link href="/profile" className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-white/15" title="Your profile">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-white/25 font-semibold">
          {(user.displayName || user.email).charAt(0).toUpperCase()}
        </span>
        <span className="hidden opacity-90 sm:inline">{user.displayName || user.email}</span>
      </Link>
      <form action={signOut}>
        <Button variant="ghost" className="px-3 py-1.5 text-white hover:bg-white/15">
          Sign out
        </Button>
      </form>
    </div>
  );
}
