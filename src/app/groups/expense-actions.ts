"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CATEGORIES } from "@/lib/categories";
import { isCurrency, parseAmount } from "@/lib/money";
import { computeSplit, SPLIT_TYPES, type SplitType } from "@/lib/splits";
import type { FormState } from "@/app/auth/actions";

export async function saveExpense(
  groupId: string,
  expenseId: string | null,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const description = get("description");
  const currency = get("currency");
  const paidBy = get("paid_by");
  const category = get("category") || "general";
  const notes = get("notes");
  const date = get("expense_date");
  const splitType = get("split_type") as SplitType;

  if (!description) return { error: "What was this expense for?" };
  if (description.length > 120) return { error: "Description is too long." };
  if (!isCurrency(currency)) return { error: "Choose a currency." };
  const amount = parseAmount(get("amount"), currency);
  if (amount === null) return { error: `Enter a valid amount${currency === "JPY" ? " (no decimals for yen)" : ""}.` };
  if (!paidBy) return { error: "Choose who paid." };
  if (!CATEGORIES.some((c) => c.value === category)) return { error: "Choose a category." };
  if (notes.length > 1000) return { error: "Notes are too long." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Choose a date." };
  if (!SPLIT_TYPES.some((t) => t.value === splitType)) return { error: "Choose how to split." };

  const supabase = await createClient();
  const { data: members } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId)
    .order("joined_at")
    .order("user_id");
  const memberIds = (members ?? []).map((m) => m.user_id);
  if (memberIds.length === 0) return { error: "You're not a member of this group." };
  if (!memberIds.includes(paidBy)) return { error: "The payer must be a group member." };

  const included = new Set(memberIds.filter((id) => formData.get(`include_${id}`) === "on"));
  const values = Object.fromEntries(memberIds.map((id) => [id, get(`value_${id}`)]));
  const split = computeSplit(splitType, amount, currency, memberIds, included, values);
  if (!split.ok) return { error: split.error };

  const { data: savedId, error } = await supabase.rpc("save_expense", {
    p_expense_id: expenseId,
    p_group_id: groupId,
    p_description: description,
    p_amount_cents: amount,
    p_currency: currency,
    p_paid_by: paidBy,
    p_category: category,
    p_notes: notes || null,
    p_expense_date: date,
    p_split_type: splitType,
    p_splits: split.shares,
  });
  if (error) {
    return { error: error.code === "42501" ? "Everyone in the split must be a group member." : error.message };
  }
  redirect(expenseId ? `/groups/${groupId}/expenses/${savedId}` : `/groups/${groupId}`);
}

export async function deleteExpense(groupId: string, expenseId: string): Promise<FormState> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("expenses").delete().eq("id", expenseId).eq("group_id", groupId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Expense not found." };
  redirect(`/groups/${groupId}?deleted=expense`);
}
