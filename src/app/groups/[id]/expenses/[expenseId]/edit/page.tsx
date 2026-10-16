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

async function EditExpense({ params }: Pick<PageProps<"/groups/[id]/expenses/[expenseId]/edit">, "params">) {
  const { id, expenseId } = await params;
  const { members, user, expenses } = await loadGroup(id);
  const e = expenses.find((x) => x.id === expenseId);
  if (!e) notFound();

  // Former members who are still part of this split can't be edited in; keep current members only.
  const shareOf = (uid: string) => e.splits.find((s) => s.user_id === uid)?.share_cents ?? 0;
  const values: Record<string, string> = {};
  if (e.split_type === "exact") {
    for (const m of members) if (shareOf(m.id)) values[m.id] = toDecimalString(shareOf(m.id), e.currency);
  } else if (e.split_type === "percent" || e.split_type === "shares") {
    // Original percentages/shares aren't stored; reconstruct from the saved amounts.
    for (const m of members) {
      if (!shareOf(m.id)) continue;
      const pct = (shareOf(m.id) / e.amount_cents) * 100;
      values[m.id] = e.split_type === "percent" ? String(Math.round(pct * 100) / 100) : toDecimalString(shareOf(m.id), e.currency);
    }
  }

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
        }}
      />
    </>
  );
}
