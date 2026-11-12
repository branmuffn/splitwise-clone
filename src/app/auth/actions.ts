"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createDemoAccount } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; message?: string } | undefined;

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const displayName = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!displayName) return { error: "Please enter your name." };
  if (!email) return { error: "Please enter your email." };
  if (password.length < 6) return { error: "Password must be at least 6 characters." };

  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) return { error: error.message };
  if (!data.session) {
    return { message: "Check your email for a confirmation link, then sign in." };
  }
  redirect("/");
}

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  redirect("/");
}

export async function signOut(formData?: FormData) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(formData?.get("next") === "/signup" ? "/signup" : "/login");
}

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Please enter your email." };

  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });
  // Don't reveal whether the email has an account; only surface rate limits.
  if (error && error.status === 429) return { error: "Too many emails sent. Please try again later." };
  return { message: "If that email has an account, a reset link is on its way." };
}

// One click: create a private demo sandbox, sign in as it, and open the sample group.
export async function startDemo(): Promise<FormState> {
  const supabase = await createClient();
  let tripId: string;
  try {
    ({ tripId } = await createDemoAccount(supabase));
  } catch (e) {
    console.error("Demo setup failed:", e);
    // If the demo user was created but seeding failed part-way, they're still signed in.
    const { data } = await supabase.auth.getClaims();
    if (data?.claims?.sub) redirect("/");
    return { error: "The demo couldn't be set up right now. Please try again in a minute." };
  }
  redirect(`/groups/${tripId}?demo=1`);
}
