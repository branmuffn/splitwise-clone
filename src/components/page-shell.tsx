import { Suspense } from "react";
import { AppHeader } from "./app-header";

// Header + centered column; the dynamic (cookie-reading) content streams in behind Suspense.
export function PageShell({ children, fallback = "Loading…" }: { children: React.ReactNode; fallback?: string }) {
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-6">
        <Suspense fallback={<p className="text-gray-500">{fallback}</p>}>{children}</Suspense>
      </main>
    </>
  );
}
