import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-next";

// Email confirmation and password reset links land here with a one-time code.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  // Only same-origin paths; "//evil.com", "/\evil.com" and other hosts fall back to "/".
  const safeNext = safeNextPath(request.nextUrl.searchParams.get("next"), request.url);
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(safeNext, request.url));
  }
  return NextResponse.redirect(new URL("/login?error=confirm", request.url));
}
