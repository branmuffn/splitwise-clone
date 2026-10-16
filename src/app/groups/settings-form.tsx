"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/auth/actions";
import { Button, FormMessage, Input, Label, Select } from "@/components/ui";
import { CURRENCIES } from "@/lib/money";

export function GroupSettingsForm({
  action: saveAction,
  name,
  currency,
  simplify,
}: {
  // updateGroupSettings bound to the group id in the Server Component (see ExpenseForm).
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  name: string;
  currency: string;
  simplify: boolean;
}) {
  const [state, action, pending] = useActionState(saveAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <div>
        <Label htmlFor="name">Group name</Label>
        <Input id="name" name="name" defaultValue={name} maxLength={80} required />
      </div>
      <div>
        <Label htmlFor="currency">Default currency</Label>
        <Select id="currency" name="currency" defaultValue={currency}>
          {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.name}</option>)}
        </Select>
      </div>
      <label className="flex items-start gap-3">
        <input type="checkbox" name="simplify_debts" defaultChecked={simplify} className="mt-1 h-5 w-5 accent-brand-500" />
        <span>
          <span className="font-medium">Simplify group debts</span>
          <span className="block text-sm text-gray-500">
            Combine debts so the group needs fewer payments. For example, if Ann owes Ben and Ben owes Cal, Ann pays Cal directly.
          </span>
        </span>
      </label>
      <FormMessage state={state} />
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save settings"}</Button>
    </form>
  );
}
