"use client";

import { useActionState, useEffect, useState } from "react";
import type { FormState } from "@/app/auth/actions";
import { Button, Card, FormMessage, Input, Label, Select } from "@/components/ui";
import { CURRENCIES } from "@/lib/money";

type Member = { id: string; name: string };

export function SettleForm({
  action: recordAction,
  members,
  currentUserId,
  defaults,
}: {
  // recordPayment bound to the group id in the Server Component (see ExpenseForm).
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  members: Member[];
  currentUserId: string;
  defaults: { from: string; to: string; amount: string; currency: string; date: string };
}) {
  const [state, action, pending] = useActionState(recordAction, undefined);
  const [date, setDate] = useState(defaults.date);
  useEffect(() => {
    const d = new Date();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- needs the browser's timezone
    setDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }, []);
  const label = (m: Member) => (m.id === currentUserId ? `${m.name} (you)` : m.name);

  return (
    <form action={action}>
      <Card className="space-y-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <div>
            <Label htmlFor="from_user">Who paid</Label>
            <Select id="from_user" name="from_user" defaultValue={defaults.from}>
              {members.map((m) => <option key={m.id} value={m.id}>{label(m)}</option>)}
            </Select>
          </div>
          <span className="pb-3 text-gray-400">→</span>
          <div>
            <Label htmlFor="to_user">Paid to</Label>
            <Select id="to_user" name="to_user" defaultValue={defaults.to}>
              {members.map((m) => <option key={m.id} value={m.id}>{label(m)}</option>)}
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <div>
            <Label htmlFor="amount">Amount</Label>
            <Input id="amount" name="amount" inputMode="decimal" placeholder="0.00" defaultValue={defaults.amount} required />
          </div>
          <div>
            <Label htmlFor="currency">Currency</Label>
            <Select id="currency" name="currency" defaultValue={defaults.currency} className="w-28">
              {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
            </Select>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="paid_on">Date</Label>
            <Input id="paid_on" name="paid_on" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="note">Note (optional)</Label>
            <Input id="note" name="note" placeholder="e.g. Venmo" maxLength={200} />
          </div>
        </div>
        <p className="text-xs text-gray-500">
          This only records that money changed hands outside the app. No real payment is made.
        </p>
        <FormMessage state={state} />
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Saving…" : "Record payment"}
        </Button>
      </Card>
    </form>
  );
}
