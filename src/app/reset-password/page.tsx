import { Card, Logo } from "@/components/ui";
import { PasswordForm } from "../profile/profile-forms";

// Reached from the reset email via /auth/callback, which signs the user in first.
export default function ResetPasswordPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center"><Logo className="text-xl" /></div>
        <Card>
          <h1 className="mb-4 text-xl font-semibold">Choose a new password</h1>
          <PasswordForm next="/" />
        </Card>
      </div>
    </main>
  );
}
