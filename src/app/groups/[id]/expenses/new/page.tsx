import { PageShell } from "@/components/page-shell";
import { BackLink } from "@/components/ui";
import { loadGroup } from "@/lib/group-data";
import { saveExpense } from "../../../expense-actions";
import { ExpenseForm } from "../../../expense-form";

export default function NewExpensePage({ params }: PageProps<"/groups/[id]/expenses/new">) {
  return (
    <PageShell>
      <NewExpense params={params} />
    </PageShell>
  );
}

async function NewExpense({ params }: Pick<PageProps<"/groups/[id]/expenses/new">, "params">) {
  const { id } = await params;
  const { group, members, user } = await loadGroup(id);
  return (
    <>
      <BackLink href={`/groups/${id}`}>{group.name}</BackLink>
      <h1 className="text-2xl font-semibold">Add an expense</h1>
      <ExpenseForm
        action={saveExpense.bind(null, id, null)}
        expenseId={null}
        members={members}
        currentUserId={user.id}
        defaults={{
          description: "",
          amount: "",
          currency: group.default_currency,
          paidBy: user.id,
          category: "general",
          notes: "",
          date: new Date().toISOString().slice(0, 10),
          splitType: "equal",
          included: members.map((m) => m.id),
          values: {},
        }}
      />
    </>
  );
}
