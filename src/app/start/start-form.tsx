"use client";

import Link from "next/link";
import { useActionState } from "react";
import { startNameOnly } from "../auth/actions";
import { Button, Card, Chevron, FormMessage, Input, Label, Logo } from "@/components/ui";

// "Start now": just a name. Creates a name-only account that lives in this browser (see startNameOnly).
export function StartForm() {
  const [state, action, pending] = useActionState(startNameOnly, undefined);
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Logo className="text-xl" />
        </div>
        <Card>
          <h1 className="mb-4 text-xl font-semibold">What should friends call you?</h1>
          <form action={action} className="space-y-4">
            <div>
              <Label htmlFor="name">Your name</Label>
              <Input id="name" name="name" autoComplete="given-name" maxLength={60} required autoFocus />
            </div>
            <FormMessage state={state} />
            <Button type="submit" disabled={pending} className="w-full py-3 text-base">{pending ? "Starting…" : "Start"}</Button>
          </form>
          <p className="mt-4 text-xs leading-relaxed text-gray-500">
            No email or phone number. To use another phone or browser later, add an email in your profile (optional).
          </p>
        </Card>
        <p className="mt-4 text-center text-sm">
          <Link href="/login" className="inline-flex items-center gap-0.5 text-brand-600 hover:underline"><Chevron dir="left" /> Back</Link>
        </p>
      </div>
    </main>
  );
}
