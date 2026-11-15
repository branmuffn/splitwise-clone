import { createClient } from "@supabase/supabase-js";
import { ImageResponse } from "next/og";
import type { Database } from "@/lib/database.types";
import { Card, OG_SIZE, plain } from "@/lib/og";

// The card people see when an invite link is shared in Messages, WhatsApp, etc.
export const alt = "Invite to a group on Splitwise clone";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const code = decodeURIComponent((await params).code).trim().toUpperCase();
  let name = "", members = 0;
  if (/^[A-Z0-9]{6}$/.test(code)) {
    const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
    const { data } = await supabase.rpc("group_invite_preview", { code });
    name = plain(data?.[0]?.name ?? "");
    members = data?.[0]?.members ?? 0;
  }
  return new ImageResponse(
    name
      ? <Card kicker="You're invited to" title={name} lines={[`${members} ${members === 1 ? "member" : "members"} so far`, "Join with just your name: no sign-up"]} />
      : <Card kicker="Splitwise clone" title="Split costs with friends" lines={["Start with just your name: no sign-up"]} />,
    size,
  );
}
