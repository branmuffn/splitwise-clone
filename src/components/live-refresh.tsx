"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";

const TABLES = ["expenses", "expense_splits", "payments", "group_members", "expense_comments", "groups"] as const;

// Subscribes to Supabase Realtime for one group and re-renders the page when anything changes.
// Row level security decides which changes this user receives.
export function LiveRefresh({ groupId }: { groupId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"connecting" | "live" | "offline">("connecting");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = getBrowserClient();
    const refresh = () => {
      // Several rows change per save (expense + splits); refresh once.
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 300);
    };
    let channel = supabase.channel(`group-${groupId}`);
    for (const table of TABLES) {
      const filter = table === "groups" ? `id=eq.${groupId}` : `group_id=eq.${groupId}`;
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table, filter }, refresh);
    }
    let cancelled = false;
    // Realtime needs the user's access token to apply row level security.
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) supabase.realtime.setAuth(data.session.access_token);
      channel.subscribe((s) => setStatus(s === "SUBSCRIBED" ? "live" : s === "CLOSED" || s === "CHANNEL_ERROR" || s === "TIMED_OUT" ? "offline" : "connecting"));
    });
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [groupId, router]);

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-500" title="Updates appear automatically when others make changes">
      <span className={`h-2 w-2 rounded-full ${status === "live" ? "bg-brand-500" : status === "offline" ? "bg-gray-300" : "bg-amber-400"}`} />
      {status === "live" ? "Live" : status === "offline" ? "Offline" : "Connecting…"}
    </span>
  );
}
