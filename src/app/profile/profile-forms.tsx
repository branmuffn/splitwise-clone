"use client";

import { useActionState } from "react";
import { changePassword, updateProfile } from "./actions";
import { Button, FormMessage, Input, Label, Select } from "@/components/ui";
import { CURRENCIES } from "@/lib/money";

export function ProfileForm({ name, currency }: { name: string; currency: string }) {
  const [state, action, pending] = useActionState(updateProfile, undefined);
  return (
    <form action={action} className="space-y-4">
      <div>
        <Label htmlFor="name">Display name</Label>
        <Input id="name" name="name" defaultValue={name} maxLength={60} required />
      </div>
      <div>
        <Label htmlFor="currency">Default currency for new groups</Label>
        <Select id="currency" name="currency" defaultValue={currency}>
          {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.name}</option>)}
        </Select>
      </div>
      <FormMessage state={state} />
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save profile"}</Button>
    </form>
  );
}

export function PasswordForm({ next = "" }: { next?: string }) {
  const [state, action, pending] = useActionState(changePassword, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <Label htmlFor="password">New password</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={6} required />
      </div>
      <div>
        <Label htmlFor="confirm">Confirm new password</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={6} required />
      </div>
      <FormMessage state={state} />
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Update password"}</Button>
    </form>
  );
}
