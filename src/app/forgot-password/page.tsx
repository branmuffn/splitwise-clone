"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset } from "../auth/actions";
import { Button, Card, FormMessage, Input, Label, Logo } from "@/components/ui";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(requestPasswordReset, undefined);
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center"><Logo className="text-xl" /></div>
        <Card>
          <h1 className="mb-1 text-xl font-semibold">Reset your password</h1>
          <p className="mb-5 text-sm text-gray-500">We&apos;ll email you a link to choose a new one.</p>
          <form action={action} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <FormMessage state={state} />
            <Button type="submit" disabled={pending} className="w-full">{pending ? "Sending…" : "Send reset link"}</Button>
          </form>
        </Card>
        <p className="mt-4 text-center text-sm text-gray-600">
          <Link href="/login" className="font-semibold text-brand-600 hover:underline">Back to sign in</Link>
        </p>
      </div>
    </main>
  );
}
