import { notFound } from "next/navigation";
import {
  computeBalances,
  pairwiseTransfers,
  simplifiedTransfers,
  type ExpenseInput,
} from "@/lib/balances";
import { allocate } from "@/lib/splits";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export type Member = { id: string; name: string; email: string };

// Everything a group page needs, loaded under the current user's RLS.
// 404s if the group doesn't exist or the user isn't a member.
export async function loadGroup(groupId: string) {
  const user = await getCurrentUser();
  if (!user) notFound();
  const supabase = await createClient();

  const [{ data: group }, { data: memberRows }, { data: expenseRows }, { data: payments }] = await Promise.all([
    supabase.from("groups").select("*").eq("id", groupId).maybeSingle(),
    supabase
      .from("group_members")
      .select("user_id, joined_at, profiles(display_name, email)")
      .eq("group_id", groupId)
      .order("joined_at")
      .order("user_id"),
    supabase
      .from("expenses")
      .select("*, expense_splits(user_id, share_cents)")
      .eq("group_id", groupId)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("payments")
      .select("*")
      .eq("group_id", groupId)
      .order("paid_on", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);
  if (!group) notFound();

  const members: Member[] = (memberRows ?? []).map((m) => ({
    id: m.user_id,
    name: m.profiles?.display_name ?? "Unknown",
    email: m.profiles?.email ?? "",
  }));
  const memberIds = members.map((m) => m.id);

  const expenses = (expenseRows ?? []).map(({ expense_splits, ...e }) => ({
    ...e,
    // Expenses saved by the old app have no splits yet: treat as equal among current members.
    splits:
      expense_splits.length > 0
        ? expense_splits
        : allocate(e.amount_cents, memberIds.map(() => 1)).map((share_cents, i) => ({ user_id: memberIds[i], share_cents })),
  }));

  const inputs: ExpenseInput[] = expenses;
  const balances = computeBalances(inputs, payments ?? []);
  const transfers = group.simplify_debts
    ? simplifiedTransfers(balances)
    : pairwiseTransfers(inputs, payments ?? []);

  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "Former member";
  const youOr = (id: string) => (id === user.id ? "You" : nameOf(id));

  return { user, group, members, expenses, payments: payments ?? [], balances, transfers, nameOf, youOr };
}

export type GroupData = Awaited<ReturnType<typeof loadGroup>>;
