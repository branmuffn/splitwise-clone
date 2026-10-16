"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn, signUp } from "./actions";
import { Button, Card, FormMessage, Input, Label, Logo } from "@/components/ui";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const isSignup = mode === "signup";
  const [state, action, pending] = useActionState(isSignup ? signUp : signIn, undefined);

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Logo className="text-xl" />
        </div>
        <Card>
          <h1 className="mb-1 text-xl font-semibold">{isSignup ? "Create your account" : "Welcome back"}</h1>
          <p className="mb-5 text-sm text-gray-500">
            {isSignup ? "Split bills with friends in seconds." : "Sign in to see your groups."}
          </p>
          <form action={action} className="space-y-4">
            {isSignup && (
              <div>
                <Label htmlFor="name">Your name</Label>
                <Input id="name" name="name" autoComplete="name" required />
              </div>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete={isSignup ? "new-password" : "current-password"}
                minLength={6}
                required
              />
            </div>
            {!isSignup && (
              <p className="-mt-2 text-right text-sm">
                <Link href="/forgot-password" className="text-brand-600 hover:underline">Forgot password?</Link>
              </p>
            )}
            <FormMessage state={state} />
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Please wait…" : isSignup ? "Sign up" : "Sign in"}
            </Button>
          </form>
        </Card>
        <p className="mt-4 text-center text-sm text-gray-600">
          {isSignup ? "Already have an account? " : "New here? "}
          <Link href={isSignup ? "/login" : "/signup"} className="font-semibold text-brand-600 hover:underline">
            {isSignup ? "Sign in" : "Create an account"}
          </Link>
        </p>
      </div>
    </main>
  );
}
