"use server";

import { redirect } from "next/navigation";
import type { FormState } from "@/app/auth/actions";
import { parseName } from "@/lib/names";
import { createClient } from "@/lib/supabase/server";

// Invite link (/join/<code>). Signed-out visitors type a name and get a name-only account first; then everyone
// joins with the same join_group RPC the join-code form uses.
export async function joinByInvite(code: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) {
    const email = String(formData.get("email") ?? "").trim();
    if (email) {
      // "Have an account? Sign in" on the invite page: sign in with email, then join.
      const { error } = await supabase.auth.signInWithPassword({ email, password: String(formData.get("password") ?? "") });
      if (error) return { error: error.message };
    } else {
      const { name, error: nameError } = parseName(formData.get("name"));
      if (!name) return { error: nameError };
      const { error } = await supabase.auth.signInAnonymously({ options: { data: { display_name: name } } });
      if (error) return { error: error.message };
    }
  }
  const { data: groupId, error } = await supabase.rpc("join_group", { code });
  if (error) {
    return { error: /No group found/.test(error.message) ? "This invite link doesn't work anymore. Ask your friend for a new one." : error.message };
  }
  redirect(`/groups/${groupId}?joined=1`);
}
