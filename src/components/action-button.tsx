"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/auth/actions";
import { Button } from "./ui";

// A one-button form for a server action, with optional confirm and inline error.
export function ActionButton({
  action,
  children,
  pendingText = "Working…",
  confirmText,
  variant = "secondary",
  className = "",
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  children: React.ReactNode;
  pendingText?: string;
  confirmText?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
      className="inline-flex flex-col items-start gap-1"
    >
      <Button type="submit" variant={variant} disabled={pending} className={className}>
        {pending ? pendingText : children}
      </Button>
      {state?.error && <span role="alert" className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
