"use server";

import { cookies } from "next/headers";
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

// Name-only account -> email account: same user id, so every group and expense stays. Confirm email is OFF in this
// project, so Supabase applies the email at once; refreshing the session clears the "anonymous" flag in the cookie.
export async function addEmail(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Please enter a valid email." };
  if (password.length < 6) return { error: "Password must be at least 6 characters." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ email, password });
  if (error) {
    return { error: /already been registered|already registered|exists/i.test(error.message) ? "That email already has an account. Use another email, or sign out and sign in with it (this name-only account would be left behind)." : error.message };
  }
  await supabase.auth.refreshSession();
  redirect("/profile?saved=email");
}

// "Not now" on the home page reminder: hide it for 30 days in this browser.
export async function hideEmailTip() {
  const store = await cookies();
  store.set("email_tip", "hidden", { maxAge: 60 * 60 * 24 * 30, path: "/", sameSite: "lax", httpOnly: true });
  redirect("/");
}
