"use client";

import { useActionState } from "react";
import { createGroup, joinGroup } from "./actions";
import { Button, Card, FormMessage, Input, Label } from "@/components/ui";

export function CreateGroupForm() {
  const [state, action, pending] = useActionState(createGroup, undefined);
  return (
    <Card>
      <h2 className="mb-3 font-semibold">Start a new group</h2>
      <form action={action} className="space-y-3">
        <div>
          <Label htmlFor="group-name">Group name</Label>
          <Input id="group-name" name="name" placeholder="e.g. Beach trip" maxLength={80} required />
        </div>
        <FormMessage state={state} />
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Creating…" : "Create group"}
        </Button>
      </form>
    </Card>
  );
}

export function JoinGroupForm() {
  const [state, action, pending] = useActionState(joinGroup, undefined);
  return (
    <Card>
      <h2 className="mb-3 font-semibold">Join with a code</h2>
      <form action={action} className="space-y-3">
        <div>
          <Label htmlFor="join-code">6-character code</Label>
          <Input
            id="join-code"
            name="code"
            placeholder="ABC123"
            maxLength={6}
            autoCapitalize="characters"
            autoComplete="off"
            className="font-mono uppercase tracking-widest"
            required
          />
        </div>
        <FormMessage state={state} />
        <Button type="submit" variant="secondary" disabled={pending} className="w-full">
          {pending ? "Joining…" : "Join group"}
        </Button>
      </form>
    </Card>
  );
}
