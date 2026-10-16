"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/auth/actions";
import { Button, FormMessage, Textarea } from "@/components/ui";

// addComment is bound to (groupId, expenseId) in the Server Component.
export function CommentForm({ action }: { action: (prev: FormState, formData: FormData) => Promise<FormState> }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-2">
      <Textarea name="body" rows={2} maxLength={1000} placeholder="Add a comment…" aria-label="Comment" required />
      <FormMessage state={state} />
      <Button type="submit" disabled={pending} className="px-3 py-2">{pending ? "Posting…" : "Post comment"}</Button>
    </form>
  );
}
