"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { saveExpense } from "./expense-actions";
import { Avatar, Button, Card, FormMessage, Input, Label, Select, Textarea } from "@/components/ui";
import { CATEGORIES } from "@/lib/categories";
import { CURRENCIES, formatMoney, parseAmount } from "@/lib/money";
import { computeSplit, SPLIT_TYPES, type SplitType } from "@/lib/splits";

type Member = { id: string; name: string };

export type ExpenseDefaults = {
  description: string;
  amount: string;
  currency: string;
  paidBy: string;
  category: string;
  notes: string;
  date: string;
  splitType: SplitType;
  included: string[];
  values: Record<string, string>;
};

const valueSuffix: Record<SplitType, string> = { equal: "", exact: "", percent: "%", shares: "share(s)" };

export function ExpenseForm({
  groupId,
  expenseId,
  members,
  currentUserId,
  defaults,
}: {
  groupId: string;
  expenseId: string | null;
  members: Member[];
  currentUserId: string;
  defaults: ExpenseDefaults;
}) {
  const [state, action, pending] = useActionState(saveExpense.bind(null, groupId, expenseId), undefined);

  const [amountText, setAmountText] = useState(defaults.amount);
  const [currency, setCurrency] = useState(defaults.currency);
  const [splitType, setSplitType] = useState<SplitType>(defaults.splitType);
  const [included, setIncluded] = useState(() => new Set(defaults.included));
  const [values, setValues] = useState<Record<string, string>>(defaults.values);
  const [date, setDate] = useState(defaults.date);

  // New expenses default to today in the viewer's timezone, not the server's.
  useEffect(() => {
    if (!expenseId) {
      const d = new Date();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- needs the browser's timezone
      setDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    }
  }, [expenseId]);

  const amount = parseAmount(amountText, currency) ?? 0;
  const ids = useMemo(() => members.map((m) => m.id), [members]);
  const preview = computeSplit(splitType, amount, currency, ids, included, values);
  const shareOf = (id: string) => (preview.ok ? (preview.shares.find((s) => s.user_id === id)?.share_cents ?? 0) : null);

  const fillEvenly = () => {
    if (splitType === "percent") {
      const base = Math.floor(10000 / ids.length);
      setValues(Object.fromEntries(ids.map((id, i) => [id, ((base + (i < 10000 - base * ids.length ? 1 : 0)) / 100).toString()])));
    } else if (splitType === "shares") {
      setValues(Object.fromEntries(ids.map((id) => [id, "1"])));
    }
  };

  return (
    <form action={action} className="space-y-4">
      <Card className="space-y-4">
        <div>
          <Label htmlFor="description">Description</Label>
          <Input id="description" name="description" defaultValue={defaults.description} placeholder="e.g. Groceries" maxLength={120} required />
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <div>
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount"
              name="amount"
              inputMode="decimal"
              placeholder="0.00"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="currency">Currency</Label>
            <Select id="currency" name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-28">
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>{c.code}</option>
              ))}
            </Select>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="paid_by">Paid by</Label>
            <Select id="paid_by" name="paid_by" defaultValue={defaults.paidBy}>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.id === currentUserId ? `${m.name} (you)` : m.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="category">Category</Label>
            <Select id="category" name="category" defaultValue={defaults.category}>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.icon} {c.label}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="expense_date">Date</Label>
            <Input id="expense_date" name="expense_date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
        </div>
      </Card>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Split</h2>
          {(splitType === "percent" || splitType === "shares") && (
            <button type="button" onClick={fillEvenly} className="text-sm font-medium text-brand-600 hover:underline">
              Fill evenly
            </button>
          )}
        </div>
        <div role="radiogroup" aria-label="Split type" className="grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1 sm:grid-cols-4">
          {SPLIT_TYPES.map((t) => (
            <label
              key={t.value}
              className={`cursor-pointer rounded-md px-2 py-1.5 text-center text-sm font-medium transition has-focus-visible:ring-2 has-focus-visible:ring-brand-500 ${
                splitType === t.value ? "bg-white text-brand-700 shadow-sm" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <input
                type="radio"
                name="split_type"
                value={t.value}
                checked={splitType === t.value}
                onChange={() => setSplitType(t.value)}
                className="sr-only"
              />
              {t.label}
            </label>
          ))}
        </div>

        <ul className="divide-y divide-gray-100">
          {members.map((m) => {
            const share = shareOf(m.id);
            return (
              <li key={m.id} className="flex items-center gap-3 py-2.5">
                {splitType === "equal" ? (
                  <input
                    type="checkbox"
                    name={`include_${m.id}`}
                    id={`include_${m.id}`}
                    checked={included.has(m.id)}
                    onChange={(e) => {
                      const next = new Set(included);
                      if (e.target.checked) next.add(m.id);
                      else next.delete(m.id);
                      setIncluded(next);
                    }}
                    className="h-5 w-5 accent-brand-500"
                  />
                ) : null}
                <Avatar name={m.name} id={m.id} />
                <label htmlFor={splitType === "equal" ? `include_${m.id}` : `value_${m.id}`} className="min-w-0 flex-1 truncate">
                  {m.name}
                  {m.id === currentUserId && <span className="text-gray-400"> (you)</span>}
                </label>
                {splitType !== "equal" && (
                  <span className="flex items-center gap-1.5">
                    <Input
                      id={`value_${m.id}`}
                      name={`value_${m.id}`}
                      inputMode="decimal"
                      placeholder="0"
                      value={values[m.id] ?? ""}
                      onChange={(e) => setValues({ ...values, [m.id]: e.target.value })}
                      className="w-24 py-1.5 text-right"
                    />
                    <span className="w-14 text-xs text-gray-500">{splitType === "exact" ? currency : valueSuffix[splitType]}</span>
                  </span>
                )}
                <span className={`w-20 shrink-0 text-right text-sm tabular-nums ${share ? "text-gray-800" : "text-gray-300"}`}>
                  {share !== null ? formatMoney(share, currency) : "—"}
                </span>
              </li>
            );
          })}
        </ul>
        {amount > 0 && !preview.ok && <p className="text-sm text-owe">{preview.error}</p>}
      </Card>

      <Card>
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea id="notes" name="notes" defaultValue={defaults.notes} rows={2} maxLength={1000} />
      </Card>

      <FormMessage state={state} />
      <Button type="submit" disabled={pending} className="w-full py-3 text-base">
        {pending ? "Saving…" : expenseId ? "Save changes" : "Add expense"}
      </Button>
    </form>
  );
}
