"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import type { FormState } from "@/app/auth/actions";
import { Avatar, Button, Card, FormMessage, Input, Label, Select, Textarea } from "@/components/ui";
import { CATEGORIES } from "@/lib/categories";
import { CURRENCIES, formatMoney, parseAmount, toDecimalString } from "@/lib/money";
import { REPEAT_OPTIONS } from "@/lib/recurring";
import { computeItemized, computeSplit, SPLIT_TYPES, type SplitType } from "@/lib/splits";

type Member = { id: string; name: string };
type ItemRow = { name: string; price: string; who: string[] };

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
  items: ItemRow[];
  tax: string;
  tip: string;
  repeat: string;
  hasReceipt: boolean;
};

const valueSuffix: Record<SplitType, string> = { equal: "", exact: "", percent: "%", shares: "share(s)", itemized: "" };
const MAX_RECEIPT_BYTES = 4 * 1024 * 1024;

// Shrink big photos in the browser so uploads stay small (phones produce 5–10 MB images).
async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.size < 1_000_000) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export function ExpenseForm({
  action: saveAction,
  expenseId,
  members,
  currentUserId,
  defaults,
}: {
  // saveExpense bound to (groupId, expenseId) in the Server Component. Binding a server action
  // inside a client component made no-JS error responses hang, so it's bound on the server.
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  expenseId: string | null;
  members: Member[];
  currentUserId: string;
  defaults: ExpenseDefaults;
}) {
  const [state, action, pending] = useActionState(saveAction, undefined);

  const [amountText, setAmountText] = useState(defaults.amount);
  const [currency, setCurrency] = useState(defaults.currency);
  const [splitType, setSplitType] = useState<SplitType>(defaults.splitType);
  const [included, setIncluded] = useState(() => new Set(defaults.included));
  const [values, setValues] = useState<Record<string, string>>(defaults.values);
  const [date, setDate] = useState(defaults.date);
  const [items, setItems] = useState<ItemRow[]>(defaults.items);
  const [tax, setTax] = useState(defaults.tax);
  const [tip, setTip] = useState(defaults.tip);
  const [receiptNote, setReceiptNote] = useState("");

  // New expenses default to today in the viewer's timezone, not the server's.
  useEffect(() => {
    if (!expenseId) {
      const d = new Date();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- needs the browser's timezone
      setDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    }
  }, [expenseId]);

  const ids = useMemo(() => members.map((m) => m.id), [members]);
  const itemized = splitType === "itemized";
  const itemizedResult = itemized
    ? computeItemized(
        {
          items: items.map((i) => ({ name: i.name, price_cents: parseAmount(i.price, currency, true) ?? -1, user_ids: i.who })),
          tax_cents: parseAmount(tax || "0", currency, true) ?? -1,
          tip_cents: parseAmount(tip || "0", currency, true) ?? -1,
        },
        ids,
      )
    : null;
  const amount = itemized ? (itemizedResult?.ok ? itemizedResult.total : 0) : (parseAmount(amountText, currency) ?? 0);
  const preview = itemized ? itemizedResult! : computeSplit(splitType, amount, currency, ids, included, values);
  const shareOf = (id: string) => (preview.ok ? (preview.shares.find((s) => s.user_id === id)?.share_cents ?? 0) : null);

  const fillEvenly = () => {
    if (splitType === "percent") {
      const base = Math.floor(10000 / ids.length);
      setValues(Object.fromEntries(ids.map((id, i) => [id, ((base + (i < 10000 - base * ids.length ? 1 : 0)) / 100).toString()])));
    } else if (splitType === "shares") {
      setValues(Object.fromEntries(ids.map((id) => [id, "1"])));
    }
  };
  const setItem = (i: number, patch: Partial<ItemRow>) => setItems(items.map((row, k) => (k === i ? { ...row, ...patch } : row)));

  return (
    <form action={action} className="space-y-4">
      <Card className="space-y-4">
        <div>
          <Label htmlFor="description">Description</Label>
          <Input id="description" name="description" defaultValue={defaults.description} placeholder="e.g. Groceries" maxLength={120} required />
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <div>
            <Label htmlFor="amount">Amount{itemized && " (from items)"}</Label>
            {itemized ? (
              <>
                <Input id="amount" value={amount ? toDecimalString(amount, currency) : ""} placeholder="0.00" readOnly className="bg-gray-50" />
                <input type="hidden" name="amount" value={amount ? toDecimalString(amount, currency) : ""} />
              </>
            ) : (
              <Input
                id="amount"
                name="amount"
                inputMode="decimal"
                placeholder="0.00"
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
                required
              />
            )}
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
        <div className="grid gap-3 sm:grid-cols-2">
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
          <div>
            <Label htmlFor="repeat_interval">Repeat</Label>
            <Select id="repeat_interval" name="repeat_interval" defaultValue={defaults.repeat}>
              {REPEAT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
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
        <div role="radiogroup" aria-label="Split type" className="grid grid-cols-3 gap-1 rounded-lg bg-gray-100 p-1 sm:grid-cols-5">
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

        {itemized && (
          <div className="space-y-3">
            <input type="hidden" name="item_count" value={items.length} />
            {items.map((item, i) => (
              <div key={i} className="rounded-lg border border-gray-200 p-3">
                <div className="grid grid-cols-[1fr_7rem_auto] gap-2">
                  <Input name={`item_${i}_name`} placeholder={`Item ${i + 1}`} value={item.name} onChange={(e) => setItem(i, { name: e.target.value })} aria-label={`Item ${i + 1} name`} maxLength={80} />
                  <Input name={`item_${i}_price`} inputMode="decimal" placeholder="0.00" value={item.price} onChange={(e) => setItem(i, { price: e.target.value })} aria-label={`Item ${i + 1} price`} className="text-right" />
                  <button
                    type="button"
                    onClick={() => setItems(items.filter((_, k) => k !== i))}
                    className="rounded-md px-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
                    aria-label={`Remove item ${i + 1}`}
                    disabled={items.length === 1}
                  >
                    ✕
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {members.map((m) => {
                    const on = item.who.includes(m.id);
                    return (
                      <label key={m.id} className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium transition has-focus-visible:ring-2 has-focus-visible:ring-brand-500 ${on ? "border-brand-500 bg-brand-50 text-brand-700" : "border-gray-200 text-gray-500"}`}>
                        <input
                          type="checkbox"
                          name={`item_${i}_who_${m.id}`}
                          checked={on}
                          onChange={(e) => setItem(i, { who: e.target.checked ? [...item.who, m.id] : item.who.filter((x) => x !== m.id) })}
                          className="sr-only"
                        />
                        {m.id === currentUserId ? "You" : m.name}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setItems([...items, { name: "", price: "", who: ids }])}
              className="text-sm font-semibold text-brand-600 hover:underline"
              disabled={items.length >= 50}
            >
              + Add item
            </button>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="tax">Tax</Label>
                <Input id="tax" name="tax" inputMode="decimal" placeholder="0.00" value={tax} onChange={(e) => setTax(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="tip">Tip</Label>
                <Input id="tip" name="tip" inputMode="decimal" placeholder="0.00" value={tip} onChange={(e) => setTip(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-gray-500">Each item is split among the people who had it. Tax and tip are shared in proportion to what each person ordered.</p>
          </div>
        )}

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
                {splitType !== "equal" && !itemized && (
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
        {(amount > 0 || itemized) && !preview.ok && <p className="text-sm text-owe">{preview.error}</p>}
      </Card>

      <Card className="space-y-4">
        <div>
          <Label htmlFor="notes">Notes (optional)</Label>
          <Textarea id="notes" name="notes" defaultValue={defaults.notes} rows={2} maxLength={1000} />
        </div>
        <div>
          <Label htmlFor="receipt">Receipt photo or PDF (optional)</Label>
          <input
            id="receipt"
            name="receipt"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
            className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
            onChange={async (e) => {
              const input = e.currentTarget;
              const file = input.files?.[0];
              if (!file) return setReceiptNote("");
              const small = await shrinkImage(file);
              if (small !== file) {
                const dt = new DataTransfer();
                dt.items.add(small);
                input.files = dt.files;
              }
              setReceiptNote(
                small.size > MAX_RECEIPT_BYTES
                  ? "That file is over 4 MB. Please choose a smaller one."
                  : `${small.name} · ${(small.size / 1024).toFixed(0)} KB${small !== file ? " (resized)" : ""}`,
              );
            }}
          />
          {receiptNote && <p className="mt-1 text-xs text-gray-500">{receiptNote}</p>}
          {defaults.hasReceipt && (
            <label className="mt-2 flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" name="remove_receipt" className="h-4 w-4 accent-brand-500" />
              Remove the current receipt
            </label>
          )}
        </div>
      </Card>

      <FormMessage state={state} />
      <Button type="submit" disabled={pending} className="w-full py-3 text-base">
        {pending ? "Saving…" : expenseId ? "Save changes" : "Add expense"}
      </Button>
    </form>
  );
}
