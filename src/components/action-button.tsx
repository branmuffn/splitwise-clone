"use client";

import { useActionState, useRef } from "react";
import type { FormState } from "@/app/auth/actions";
import { Button } from "./ui";

// A one-button form for a server action, with optional confirm and inline error.
// SP-02 (2026-11-27): the confirm is the app's own small sheet (the question, Cancel and the action's own label), not
// the browser's "split-tea.vercel.app says… OK / Cancel" box. Esc, a tap outside or Cancel closes it; without
// JavaScript the form still posts as before.
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
  const form = useRef<HTMLFormElement>(null);
  const ask = useRef<HTMLDialogElement>(null);
  const confirmed = useRef(false);
  return (
    <form
      ref={form}
      action={formAction}
      onSubmit={(e) => {
        if (!confirmText || confirmed.current) return void (confirmed.current = false);
        e.preventDefault();
        ask.current?.showModal();
      }}
      className="inline-flex flex-col items-start gap-1"
    >
      <Button type="submit" variant={variant} disabled={pending} className={className}>
        {pending ? pendingText : children}
      </Button>
      {state?.error && <span role="alert" className="text-xs text-red-600">{state.error}</span>}
      {confirmText && (
        <dialog
          ref={ask}
          aria-label="Please confirm"
          onClick={(e) => {
            if (e.target === e.currentTarget) ask.current?.close(); // a tap on the dimmed area outside
          }}
          className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-[var(--app-text)] shadow-xl backdrop:bg-black/50"
        >
          <div className="p-5">
            <p className="text-base leading-relaxed">{confirmText}</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => ask.current?.close()} autoFocus>
                Cancel
              </Button>
              <Button
                type="button"
                variant={variant === "danger" ? "danger" : "primary"}
                onClick={() => {
                  ask.current?.close();
                  confirmed.current = true;
                  form.current?.requestSubmit();
                }}
              >
                {children}
              </Button>
            </div>
          </div>
        </dialog>
      )}
    </form>
  );
}
