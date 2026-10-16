"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CATEGORIES } from "@/lib/categories";
import type { Json } from "@/lib/database.types";
import { isCurrency, parseAmount } from "@/lib/money";
import { computeItemized, computeSplit, SPLIT_TYPES, type SplitType } from "@/lib/splits";
import type { FormState } from "@/app/auth/actions";

const REPEATS = ["none", "weekly", "biweekly", "monthly", "yearly"] as const;
const RECEIPT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
};
const MAX_RECEIPT_BYTES = 4 * 1024 * 1024;

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
  const repeat = (get("repeat_interval") || "none") as (typeof REPEATS)[number];
  const receipt = formData.get("receipt");
  const file = receipt instanceof File && receipt.size > 0 ? receipt : null;

  if (!description) return { error: "What was this expense for?" };
  if (description.length > 120) return { error: "Description is too long." };
  if (!isCurrency(currency)) return { error: "Choose a currency." };
  if (!paidBy) return { error: "Choose who paid." };
  if (!CATEGORIES.some((c) => c.value === category)) return { error: "Choose a category." };
  if (notes.length > 1000) return { error: "Notes are too long." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Choose a date." };
  if (!SPLIT_TYPES.some((t) => t.value === splitType)) return { error: "Choose how to split." };
  if (!REPEATS.includes(repeat)) return { error: "Choose how often it repeats." };
  if (file && !RECEIPT_TYPES[file.type]) return { error: "Receipts must be a JPG, PNG, WebP, GIF, or PDF." };
  if (file && file.size > MAX_RECEIPT_BYTES) return { error: "Receipt is too large (4 MB max)." };

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

  let amount: number;
  let shares: { user_id: string; share_cents: number }[];
  let details: Json | null = null;

  if (splitType === "itemized") {
    const count = Math.min(50, Number(get("item_count")) || 0);
    const items = [];
    for (let i = 0; i < count; i++) {
      const name = get(`item_${i}_name`).slice(0, 80);
      const priceText = get(`item_${i}_price`);
      if (!name && !priceText) continue;
      const price = parseAmount(priceText, currency);
      if (price === null) return { error: `Enter a valid price for “${name || `item ${i + 1}`}”.` };
      items.push({ name, price_cents: price, user_ids: memberIds.filter((id) => formData.get(`item_${i}_who_${id}`) === "on") });
    }
    const tax = parseAmount(get("tax") || "0", currency, true);
    const tip = parseAmount(get("tip") || "0", currency, true);
    if (tax === null || tip === null) return { error: "Enter valid tax and tip amounts." };
    const result = computeItemized({ items, tax_cents: tax, tip_cents: tip }, memberIds);
    if (!result.ok) return { error: result.error };
    amount = result.total;
    shares = result.shares;
    details = { items, tax_cents: tax, tip_cents: tip };
  } else {
    const parsed = parseAmount(get("amount"), currency);
    if (parsed === null) return { error: `Enter a valid amount${currency === "JPY" ? " (no decimals for yen)" : ""}.` };
    amount = parsed;
    const included = new Set(memberIds.filter((id) => formData.get(`include_${id}`) === "on"));
    const values = Object.fromEntries(memberIds.map((id) => [id, get(`value_${id}`)]));
    const split = computeSplit(splitType, amount, currency, memberIds, included, values);
    if (!split.ok) return { error: split.error };
    shares = split.shares;
    if (splitType === "percent" || splitType === "shares") {
      details = { values: Object.fromEntries(Object.entries(values).filter(([, v]) => v)) };
    }
  }

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
    p_splits: shares,
    p_split_details: details,
    p_repeat_interval: repeat,
  });
  if (error) {
    return { error: error.code === "42501" ? "Everyone in the split must be a group member." : error.message };
  }

  // Receipt changes happen after the expense is saved, so a storage hiccup never loses the expense.
  let receiptFailed = false;
  if (file || formData.get("remove_receipt") === "on") {
    const { data: row } = await supabase.from("expenses").select("receipt_path").eq("id", savedId).single();
    let newPath: string | null = null;
    if (file) {
      newPath = `${groupId}/${savedId}/${crypto.randomUUID()}.${RECEIPT_TYPES[file.type]}`;
      const { error: upErr } = await supabase.storage.from("receipts").upload(newPath, file, { contentType: file.type });
      if (upErr) {
        receiptFailed = true;
        newPath = null;
      }
    }
    if (!receiptFailed) {
      await supabase.from("expenses").update({ receipt_path: newPath }).eq("id", savedId);
      if (row?.receipt_path) await supabase.storage.from("receipts").remove([row.receipt_path]);
    }
  }

  const target = expenseId || receiptFailed ? `/groups/${groupId}/expenses/${savedId}` : `/groups/${groupId}`;
  redirect(receiptFailed ? `${target}?receipt=failed` : target);
}

export async function deleteExpense(groupId: string, expenseId: string): Promise<FormState> {
  const supabase = await createClient();
  const { data: row } = await supabase.from("expenses").select("receipt_path").eq("id", expenseId).maybeSingle();
  const { data, error } = await supabase.from("expenses").delete().eq("id", expenseId).eq("group_id", groupId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Expense not found." };
  if (row?.receipt_path) await supabase.storage.from("receipts").remove([row.receipt_path]);
  redirect(`/groups/${groupId}?deleted=expense`);
}

export async function stopRepeating(groupId: string, expenseId: string): Promise<FormState> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expenses")
    .update({ repeat_interval: "none", repeat_anchor: null })
    .eq("id", expenseId)
    .eq("group_id", groupId)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Expense not found." };
  redirect(`/groups/${groupId}/expenses/${expenseId}?stopped=1`);
}

export async function addComment(groupId: string, expenseId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Write a comment first." };
  if (body.length > 1000) return { error: "Comment is too long." };
  const supabase = await createClient();
  const { error } = await supabase.from("expense_comments").insert({ expense_id: expenseId, group_id: groupId, body });
  if (error) return { error: error.code === "42501" ? "You can't comment in this group." : error.message };
  redirect(`/groups/${groupId}/expenses/${expenseId}#comments`);
}

export async function deleteComment(groupId: string, expenseId: string, commentId: string): Promise<FormState> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("expense_comments").delete().eq("id", commentId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "You can only delete your own comments." };
  redirect(`/groups/${groupId}/expenses/${expenseId}#comments`);
}
