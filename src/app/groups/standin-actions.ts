"use server";

import { createClient as createPlainClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { FormState } from "@/app/auth/actions";
import type { Database } from "@/lib/database.types";
import { parseName } from "@/lib/names";
import { createClient } from "@/lib/supabase/server";

// Stand-ins (Brian, 2026-11-15): add someone by name before they join. The app signs in a fresh anonymous account for
// them on a throwaway client (its session is dropped right away), then the member who asked marks it as a stand-in in
// this group (add_standin checks the account is brand new and in no group).
export async function addStandIn(groupId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { name, error: nameError } = parseName(formData.get("name"));
  if (!name) return { error: nameError };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login");

  const throwaway = createPlainClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await throwaway.auth.signInAnonymously({ options: { data: { display_name: name } } });
  if (error || !data.user) {
    return { error: error?.status === 429 ? "Too many new people at once. Please try again in a few minutes." : (error?.message ?? "Could not add that person.") };
  }
  const { error: addError } = await supabase.rpc("add_standin", { gid: groupId, sid: data.user.id });
  await throwaway.auth.signOut(); // nobody keeps the stand-in's session
  if (addError) return { error: addError.message };
  redirect(`/groups/${groupId}/settings?saved=standin#members`);
}

// "That's me" for someone already in the group: everything logged for the stand-in becomes yours.
export async function claimStandIn(groupId: string, standinId: string): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("claim_standin", { sid: standinId });
  if (error) return { error: error.message };
  redirect(`/groups/${groupId}?claimed=1`);
}
