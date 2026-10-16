import Link from "next/link";
import { Suspense } from "react";
import { signOut } from "@/app/auth/actions";
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
    </header>
  );
}

async function UserMenu() {
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <div className="flex items-center gap-3">
      <span className="hidden text-sm opacity-90 sm:inline">{user.displayName || user.email}</span>
      <form action={signOut}>
        <Button variant="ghost" className="px-3 py-1.5 text-white hover:bg-white/15">
          Sign out
        </Button>
      </form>
    </div>
  );
}
