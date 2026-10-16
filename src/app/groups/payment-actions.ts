"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isCurrency, parseAmount } from "@/lib/money";
import type { FormState } from "@/app/auth/actions";

export async function recordPayment(groupId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const from = get("from_user");
  const to = get("to_user");
  const currency = get("currency");
  const note = get("note");
  const date = get("paid_on");

  if (!from || !to) return { error: "Choose who paid and who received." };
  if (from === to) return { error: "Payer and recipient must be different people." };
  if (!isCurrency(currency)) return { error: "Choose a currency." };
  const amount = parseAmount(get("amount"), currency);
  if (amount === null) return { error: "Enter a valid amount." };
  if (note.length > 200) return { error: "Note is too long." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Choose a date." };

  const supabase = await createClient();
  const { error } = await supabase.from("payments").insert({
    group_id: groupId,
    from_user: from,
    to_user: to,
    amount_cents: amount,
    currency,
    note: note || null,
    paid_on: date,
  });
  if (error) {
    return { error: error.code === "42501" ? "Both people must be members of this group." : error.message };
  }
  redirect(`/groups/${groupId}?paid=1`);
}

export async function deletePayment(groupId: string, paymentId: string): Promise<FormState> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("payments").delete().eq("id", paymentId).eq("group_id", groupId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Payment not found." };
  redirect(`/groups/${groupId}?deleted=payment`);
}
