import { notFound } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { BackLink } from "@/components/ui";
import { loadGroup } from "@/lib/group-data";
import { toDecimalString } from "@/lib/money";
import { saveExpense } from "../../../../expense-actions";
import { ExpenseForm } from "../../../../expense-form";

export default function EditExpensePage({ params }: PageProps<"/groups/[id]/expenses/[expenseId]/edit">) {
  return (
    <PageShell>
      <EditExpense params={params} />
    </PageShell>
  );
}

type Details = {
  values?: Record<string, string>;
  items?: { name: string; price_cents: number; user_ids: string[] }[];
  tax_cents?: number;
  tip_cents?: number;
};

async function EditExpense({ params }: Pick<PageProps<"/groups/[id]/expenses/[expenseId]/edit">, "params">) {
  const { id, expenseId } = await params;
  const { members, user, expenses } = await loadGroup(id);
  const e = expenses.find((x) => x.id === expenseId);
  if (!e) notFound();

  const details = (e.split_details ?? {}) as Details;
  const shareOf = (uid: string) => e.splits.find((s) => s.user_id === uid)?.share_cents ?? 0;
  let values: Record<string, string> = {};
  if (e.split_type === "exact") {
    for (const m of members) if (shareOf(m.id)) values[m.id] = toDecimalString(shareOf(m.id), e.currency);
  } else if (e.split_type === "percent" || e.split_type === "shares") {
    // Prefer the exact numbers that were typed; fall back to reconstructing from amounts.
    values = details.values ?? Object.fromEntries(
      members
        .filter((m) => shareOf(m.id))
        .map((m) => [
          m.id,
          e.split_type === "percent"
            ? String(Math.round((shareOf(m.id) / e.amount_cents) * 10000) / 100)
            : toDecimalString(shareOf(m.id), e.currency),
        ]),
    );
  }
  const memberIds = members.map((m) => m.id);
  const items = details.items?.length
    ? details.items.map((i) => ({ name: i.name, price: toDecimalString(i.price_cents, e.currency), who: i.user_ids.filter((u) => memberIds.includes(u)) }))
    : [0, 1, 2].map(() => ({ name: "", price: "", who: memberIds }));

  return (
    <>
      <BackLink href={`/groups/${id}/expenses/${e.id}`}>Back to expense</BackLink>
      <h1 className="text-2xl font-semibold">Edit expense</h1>
      <ExpenseForm
        action={saveExpense.bind(null, id, e.id)}
        expenseId={e.id}
        members={members}
        currentUserId={user.id}
        defaults={{
          description: e.description,
          amount: toDecimalString(e.amount_cents, e.currency),
          currency: e.currency,
          paidBy: e.paid_by,
          category: e.category,
          notes: e.notes ?? "",
          date: e.expense_date,
          splitType: e.split_type,
          included: e.splits.map((s) => s.user_id),
          values,
          items,
          tax: details.tax_cents ? toDecimalString(details.tax_cents, e.currency) : "",
          tip: details.tip_cents ? toDecimalString(details.tip_cents, e.currency) : "",
          repeat: e.repeat_interval,
          hasReceipt: Boolean(e.receipt_path),
        }}
      />
    </>
  );
}
