"use client";

import { useActionState } from "react";
import { addExpense } from "./expense-actions";
import { Button, Card, FormMessage, Input, Label } from "@/components/ui";

type Member = { id: string; name: string };

export function ExpenseForm({
  groupId,
  members,
  currentUserId,
}: {
  groupId: string;
  members: Member[];
  currentUserId: string;
}) {
  const [state, action, pending] = useActionState(addExpense.bind(null, groupId), undefined);

  return (
    <Card>
      <h2 className="mb-3 font-semibold">Add an expense</h2>
      <form action={action} className="space-y-3">
        <div>
          <Label htmlFor="description">Description</Label>
          <Input id="description" name="description" placeholder="e.g. Groceries" maxLength={120} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="amount">Amount (USD)</Label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">$</span>
              <Input
                id="amount"
                name="amount"
                inputMode="decimal"
                placeholder="0.00"
                pattern="^\$?\d{1,7}(\.\d{0,2})?$"
                title="An amount like 12.50"
                className="pl-7"
                required
              />
            </div>
          </div>
          <div>
            <Label htmlFor="paid_by">Paid by</Label>
            <select
              id="paid_by"
              name="paid_by"
              defaultValue={currentUserId}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id === currentUserId ? `${m.name} (you)` : m.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs text-gray-500">Split equally among all {members.length} members.</p>
        <FormMessage state={state} />
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Saving…" : "Add expense"}
        </Button>
      </form>
    </Card>
  );
}
