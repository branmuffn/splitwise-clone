"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn } from "./actions";
import { DemoButton } from "./demo-button";
import { Button, ButtonLink, Card, FormMessage, Input, Label, Logo } from "@/components/ui";

// Sign-in page (Brian picked N1, 2026-11-15): lead with "Start now" (just a name, no sign-up), then the demo.
// Email sign-in sits behind one tap, and opens by itself when a sign-in attempt fails.
export function LoginLanding() {
  const [state, action, pending] = useActionState(signIn, undefined);
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Logo className="text-xl" />
        </div>
        <Card className="space-y-3">
          <h1 className="text-xl font-semibold">Split costs with friends</h1>
          <p className="text-sm text-gray-600">No sign-up. Just your name, and your account lives on this device.</p>
          <ButtonLink href="/start" className="w-full py-3 text-base">Start now</ButtonLink>
          <DemoButton label="✨ Try the demo first" caption={false} />
        </Card>
        <details className="group mt-4 rounded-2xl border border-black/5 bg-white shadow-sm" open={Boolean(state?.error)}>
          <summary className="cursor-pointer list-none px-5 py-4 text-center text-sm text-gray-600 [&::-webkit-details-marker]:hidden">
            Have an account with an email? <span className="font-semibold text-brand-600">Sign in</span>
            <span className="ml-1 inline-block text-gray-400 transition group-open:rotate-90">›</span>
          </summary>
          <form action={action} className="space-y-4 border-t border-gray-100 px-5 pt-4 pb-5">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" minLength={6} required />
            </div>
            <p className="-mt-2 text-right text-sm">
              <Link href="/forgot-password" className="text-brand-600 hover:underline">Forgot password?</Link>
            </p>
            <FormMessage state={state} />
            <Button type="submit" disabled={pending} className="w-full">{pending ? "Please wait…" : "Sign in"}</Button>
            <p className="text-center text-sm text-gray-600">
              New, and want an email account?{" "}
              <Link href="/signup" className="font-semibold text-brand-600 hover:underline">Create one</Link>
            </p>
          </form>
        </details>
      </div>
    </main>
  );
}
