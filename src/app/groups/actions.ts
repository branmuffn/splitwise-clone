"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/app/auth/actions";

export async function createGroup(_prev: FormState, formData: FormData): Promise<FormState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give your group a name." };
  if (name.length > 80) return { error: "Group name is too long." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_group", { group_name: name });
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
