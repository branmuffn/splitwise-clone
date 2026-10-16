import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Email confirmation and password reset links land here with a one-time code.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next") ?? "/";
  // Only allow same-site paths, never "//evil.com".
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(safeNext, request.url));
  }
  return NextResponse.redirect(new URL("/login?error=confirm", request.url));
}
