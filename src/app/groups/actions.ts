"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isCurrency } from "@/lib/money";
import type { FormState } from "@/app/auth/actions";

export async function createGroup(_prev: FormState, formData: FormData): Promise<FormState> {
  const name = String(formData.get("name") ?? "").trim();
  const currency = String(formData.get("currency") ?? "USD");
  if (!name) return { error: "Give your group a name." };
  if (name.length > 80) return { error: "Group name is too long." };
  if (!isCurrency(currency)) return { error: "Choose a currency." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_group", { group_name: name, group_currency: currency });
  if (error) return { error: error.message };
  redirect(`/groups/${data}`);
}

export async function joinGroup(_prev: FormState, formData: FormData): Promise<FormState> {
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) return { error: "Join codes are 6 letters or numbers." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_group", { code });
  if (error) return { error: error.message };
  redirect(`/groups/${data}`);
}

export async function updateGroupSettings(groupId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const name = String(formData.get("name") ?? "").trim();
  const currency = String(formData.get("currency") ?? "");
  const simplify = formData.get("simplify_debts") === "on";
  if (!name) return { error: "Group name is required." };
  if (name.length > 80) return { error: "Group name is too long." };
  if (!isCurrency(currency)) return { error: "Choose a currency." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("groups")
    .update({ name, default_currency: currency, simplify_debts: simplify })
    .eq("id", groupId)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "You can't edit this group." };
  redirect(`/groups/${groupId}/settings?saved=1`);
}

export async function regenerateCode(groupId: string): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("regenerate_join_code", { gid: groupId });
  if (error) return { error: error.message };
  redirect(`/groups/${groupId}/settings?saved=code`);
}

export async function removeMember(groupId: string, userId: string): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_member", { gid: groupId, uid: userId });
  if (error) return { error: error.message };
  redirect(`/groups/${groupId}/settings?saved=removed`);
}

export async function leaveGroup(groupId: string): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("leave_group", { gid: groupId });
  if (error) return { error: error.message };
  redirect("/?left=1");
}

export async function deleteGroup(groupId: string): Promise<FormState> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("groups").delete().eq("id", groupId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Only the person who created the group can delete it." };
  redirect("/?deleted=1");
}
