import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { LocalTime } from "@/components/local-time";
import { PageShell } from "@/components/page-shell";
import { Avatar, BackLink, ButtonLink, Card, SectionTitle, formatDate } from "@/components/ui";
import { categoryOf } from "@/lib/categories";
import { loadGroup } from "@/lib/group-data";
import { formatMoney } from "@/lib/money";
import { SPLIT_TYPES } from "@/lib/splits";
import { deleteExpense } from "../../../expense-actions";

export default function ExpensePage({ params }: PageProps<"/groups/[id]/expenses/[expenseId]">) {
  return (
    <PageShell>
      <ExpenseDetail params={params} />
    </PageShell>
  );
}

async function ExpenseDetail({ params }: Pick<PageProps<"/groups/[id]/expenses/[expenseId]">, "params">) {
  const { id, expenseId } = await params;
  const { group, expenses, youOr, user } = await loadGroup(id);
  const e = expenses.find((x) => x.id === expenseId);
  if (!e) notFound();
  const cat = categoryOf(e.category);

  return (
    <>
      <BackLink href={`/groups/${id}`}>{group.name}</BackLink>
      <Card className="space-y-4">
        <div className="flex items-start gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-gray-100 text-3xl">{cat.icon}</span>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold break-words">{e.description}</h1>
            <p className="text-3xl font-bold">{formatMoney(e.amount_cents, e.currency)}</p>
            <p className="mt-1 text-sm text-gray-500">
              {cat.label} · {formatDate(e.expense_date)}
            </p>
          </div>
        </div>
        <p className="text-sm text-gray-500">
          Added by {youOr(e.created_by)} on <LocalTime iso={e.created_at} />
          {e.updated_at !== e.created_at && new Date(e.updated_at).getTime() - new Date(e.created_at).getTime() > 1000 && (
            <> · edited <LocalTime iso={e.updated_at} /></>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href={`/groups/${id}/expenses/${e.id}/edit`} variant="secondary">Edit</ButtonLink>
          <ActionButton
            action={deleteExpense.bind(null, id, e.id)}
            confirmText={`Delete “${e.description}”? This can't be undone.`}
            variant="danger"
            pendingText="Deleting…"
          >
            Delete
          </ActionButton>
        </div>
      </Card>

      <section>
        <SectionTitle>
          Split {SPLIT_TYPES.find((t) => t.value === e.split_type)?.label.toLowerCase()}
        </SectionTitle>
        <Card className="divide-y divide-gray-100 p-0">
          <div className="flex items-center gap-3 px-5 py-3">
            <Avatar name={youOr(e.paid_by)} id={e.paid_by} />
            <span className="flex-1">
              <span className="font-medium">{youOr(e.paid_by)}</span> paid {formatMoney(e.amount_cents, e.currency)}
            </span>
          </div>
          {e.splits.map((s) => (
            <div key={s.user_id} className="flex items-center gap-3 px-5 py-3 pl-12">
              <Avatar name={youOr(s.user_id)} id={s.user_id} size="sm" />
              <span className="flex-1 text-sm">
                {youOr(s.user_id)} {s.user_id === user.id ? "owe" : "owes"}{" "}
                <span className="font-semibold">{formatMoney(s.share_cents, e.currency)}</span>
              </span>
            </div>
          ))}
        </Card>
      </section>

      {e.notes && (
        <section>
          <SectionTitle>Notes</SectionTitle>
          <Card className="whitespace-pre-wrap text-sm">{e.notes}</Card>
        </section>
      )}
    </>
  );
}
