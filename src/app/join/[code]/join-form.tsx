"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/auth/actions";
import { Button, FormMessage, Input, Label } from "@/components/ui";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

// Signed out: a name is enough (name-only account), or sign in with an email account. Signed in: one button.
export function JoinForm({ action, signedInAs }: { action: Action; signedInAs: string | null }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [emailState, emailAction, emailPending] = useActionState(action, undefined);
  if (signedInAs !== null) {
    return (
      <form action={formAction} className="mt-5 space-y-3">
        <p className="text-sm text-gray-600">Joining as <b>{signedInAs}</b>.</p>
        <FormMessage state={state} />
        <Button type="submit" disabled={pending} className="w-full py-3 text-base">{pending ? "Joining…" : "Join the group"}</Button>
      </form>
    );
  }
  return (
    <>
      <form action={formAction} className="mt-5 space-y-4">
        <div>
          <Label htmlFor="name">Your name</Label>
          <Input id="name" name="name" autoComplete="given-name" maxLength={60} required />
        </div>
        <FormMessage state={state} />
        <Button type="submit" disabled={pending} className="w-full py-3 text-base">{pending ? "Joining…" : "Join the group"}</Button>
        <p className="text-xs leading-relaxed text-gray-500">No sign-up. Your account stays on this device; you can add an email later in your profile.</p>
      </form>
      <details className="group mt-4 border-t border-gray-100 pt-3" open={Boolean(emailState?.error)}>
        <summary className="cursor-pointer list-none text-center text-sm text-gray-600 [&::-webkit-details-marker]:hidden">
          Have an account with an email? <span className="font-semibold text-brand-600">Sign in</span>
        </summary>
        <form action={emailAction} className="mt-3 space-y-3">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          <FormMessage state={emailState} />
          <Button type="submit" variant="secondary" disabled={emailPending} className="w-full">{emailPending ? "Signing in…" : "Sign in and join"}</Button>
        </form>
      </details>
    </>
  );
}
