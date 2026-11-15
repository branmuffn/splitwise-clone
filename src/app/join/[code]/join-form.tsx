"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/app/auth/actions";
import { Button, FormMessage, Input, Label, Select } from "@/components/ui";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;
type StandIn = { id: string; name: string };

// "Which one are you?": people the group added by name before they joined (stand-ins). Picking one takes over their
// spot; "someone new" joins as a new member. Works without JavaScript too (the name box is ignored when a name is picked).
function WhichOne({ standins, value, onChange }: { standins: StandIn[]; value: string; onChange: (v: string) => void }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1 text-sm font-semibold text-gray-800">Which one are you?</legend>
      {[...standins, { id: "", name: "I'm someone new" }].map((s) => (
        <label key={s.id || "new"} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 ${value === s.id ? "border-brand-500 bg-brand-50" : "border-gray-200"}`}>
          <input type="radio" name="standin" value={s.id} checked={value === s.id} onChange={() => onChange(s.id)} className="accent-brand-600" />
          <span className="font-medium">{s.name}</span>
        </label>
      ))}
    </fieldset>
  );
}

export function JoinForm({ action, signedInAs, standins = [] }: { action: Action; signedInAs: string | null; standins?: StandIn[] }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [emailState, emailAction, emailPending] = useActionState(action, undefined);
  const [pick, setPick] = useState(""); // nobody picked until they tap their name
  const pickedName = standins.find((s) => s.id === pick)?.name;
  const cta = pending ? "Joining…" : pickedName ? `Join as ${pickedName}` : "Join the group";
  if (signedInAs !== null) {
    return (
      <form action={formAction} className="mt-5 space-y-3">
        {standins.length > 0 && <WhichOne standins={standins} value={pick} onChange={setPick} />}
        <p className="text-sm text-gray-600">You&apos;re signed in as <b>{signedInAs}</b>.</p>
        <FormMessage state={state} />
        <Button type="submit" disabled={pending} className="w-full py-3 text-base">{cta}</Button>
      </form>
    );
  }
  return (
    <>
      <form action={formAction} className="mt-5 space-y-4">
        {standins.length > 0 && <WhichOne standins={standins} value={pick} onChange={setPick} />}
        <div className={pickedName ? "hidden" : ""}>
          <Label htmlFor="name">Your name</Label>
          <Input id="name" name="name" autoComplete="given-name" maxLength={60} required={standins.length === 0} />
        </div>
        <FormMessage state={state} />
        <Button type="submit" disabled={pending} className="w-full py-3 text-base">{cta}</Button>
        <p className="text-xs leading-relaxed text-gray-500">No sign-up. Your account stays on this device; you can add an email later in your profile.</p>
      </form>
      <details className="group mt-4 border-t border-gray-100 pt-3" open={Boolean(emailState?.error)}>
        <summary className="cursor-pointer list-none text-center text-sm text-gray-600 [&::-webkit-details-marker]:hidden">
          Have an account with an email? <span className="font-semibold text-brand-600">Sign in</span>
        </summary>
        <form action={emailAction} className="mt-3 space-y-3">
          {standins.length > 0 && (
            <div>
              <Label htmlFor="standin-email">Which one are you?</Label>
              <Select id="standin-email" name="standin" defaultValue="">
                {standins.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                <option value="">I&apos;m someone new</option>
              </Select>
            </div>
          )}
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
