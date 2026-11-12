"use client";

import { useActionState } from "react";
import { startDemo } from "./actions";
import { Button, FormMessage } from "@/components/ui";

// "Try the demo": one click creates a private sample account and signs you in.
export function DemoButton() {
  const [state, action, pending] = useActionState(startDemo, undefined);
  return (
    <form action={action} className="space-y-2">
      <Button type="submit" variant="secondary" disabled={pending} className="w-full border-brand-500 text-brand-700 hover:bg-brand-50">
        {pending ? "Setting up your demo…" : "✨ Try the demo (no sign-up)"}
      </Button>
      <p className="text-center text-xs text-gray-500">
        One click opens a private sample account with groups and expenses already filled in.
      </p>
      <FormMessage state={state} />
    </form>
  );
}
