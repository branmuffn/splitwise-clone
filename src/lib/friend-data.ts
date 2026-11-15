import type { ExpenseInput, PaymentInput } from "@/lib/balances";
import { friendBalances, type FriendGroupInput } from "@/lib/friends";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

type GroupRow = { id: string; name: string; simplify_debts: boolean; join_code: string };
type MemberRow = {
  group_id: string;
  user_id: string;
  profiles: { display_name: string | null; email: string | null; standin_group: string | null } | null;
};
type ExpenseRow = Omit<ExpenseInput, "splits"> & { group_id: string; expense_splits: ExpenseInput["splits"] };
type PaymentRow = PaymentInput & { group_id: string };

// Raw rows (already limited to the user's groups by RLS) -> friends with per-group balances.
// firstCurrency: the user's default currency, listed first in each friend's amounts.
export function buildFriends(userId: string, groups: GroupRow[], members: MemberRow[], expenses: ExpenseRow[], payments: PaymentRow[], firstCurrency?: string) {
  const inputs: FriendGroupInput[] = groups.map((g) => ({
    id: g.id,
    name: g.name,
    simplify: g.simplify_debts,
    joinCode: g.join_code,
    members: members
      .filter((m) => m.group_id === g.id)
      .map((m) => ({
        id: m.user_id,
        name: m.profiles?.display_name ?? "Unknown",
        email: m.profiles?.email ?? "",
        standin: Boolean(m.profiles?.standin_group),
      })),
    expenses: expenses.filter((e) => e.group_id === g.id).map((e) => ({ ...e, splits: e.expense_splits })),
    payments: payments.filter((p) => p.group_id === g.id),
  }));
  return friendBalances(userId, inputs, firstCurrency);
}

export const MEMBER_SELECT = "group_id, user_id, profiles(display_name, email, standin_group)";

// Everything the friend page needs, under the current user's RLS.
export async function loadFriends() {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data: mine } = await supabase.from("group_members").select("group_id").eq("user_id", user.id);
  const ids = (mine ?? []).map((g) => g.group_id);
  // Add any recurring expenses that have come due, as the group pages do.
  await Promise.all(ids.map((gid) => supabase.rpc("materialize_recurring", { gid })));
  const [{ data: groups }, { data: members }, { data: expenses }, { data: payments }] = await Promise.all([
    supabase.from("groups").select("id, name, simplify_debts, join_code").in("id", ids),
    supabase.from("group_members").select(MEMBER_SELECT).in("group_id", ids).order("joined_at"),
    supabase.from("expenses").select("group_id, amount_cents, currency, paid_by, expense_splits(user_id, share_cents)").in("group_id", ids),
    supabase.from("payments").select("group_id, from_user, to_user, amount_cents, currency").in("group_id", ids),
  ]);
  return { user, friends: buildFriends(user.id, groups ?? [], members ?? [], expenses ?? [], payments ?? [], user.defaultCurrency) };
}
