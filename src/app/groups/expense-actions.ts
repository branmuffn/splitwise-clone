"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseDollarsToCents } from "@/lib/money";
import type { FormState } from "@/app/auth/actions";

export async function addExpense(
  groupId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const description = String(formData.get("description") ?? "").trim();
  const amountCents = parseDollarsToCents(String(formData.get("amount") ?? ""));
  const paidBy = String(formData.get("paid_by") ?? "");

  if (!description) return { error: "What was this expense for?" };
  if (description.length > 120) return { error: "Description is too long." };
  if (amountCents === null) return { error: "Enter an amount like 12.50." };
  if (!paidBy) return { error: "Choose who paid." };

  const supabase = await createClient();
  const { error } = await supabase.from("expenses").insert({
    group_id: groupId,
    description,
    amount_cents: amountCents,
    paid_by: paidBy,
  });

  if (error) {
    // RLS rejects non-members and payers outside the group.
    return { error: error.code === "42501" ? "You can only add expenses for members of this group." : error.message };
  }

  refresh();
  return { message: `Added “${description}”.` };
}
