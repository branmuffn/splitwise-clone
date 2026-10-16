"use server";

import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { isCurrency } from "@/lib/money";
import type { FormState } from "@/app/auth/actions";

export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const name = String(formData.get("name") ?? "").trim();
  const currency = String(formData.get("currency") ?? "");
  if (!name) return { error: "Name is required." };
  if (name.length > 60) return { error: "Name is too long." };
  if (!isCurrency(currency)) return { error: "Choose a currency." };

  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ display_name: name, default_currency: currency }).eq("id", user.id);
  if (error) return { error: error.message };
  redirect("/profile?saved=profile");
}

export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 6) return { error: "Password must be at least 6 characters." };
  if (password !== confirm) return { error: "Passwords don't match." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  redirect(String(formData.get("next") ?? "") === "/" ? "/?password=1" : "/profile?saved=password");
}
