import { signOut } from "@/app/auth/actions";
import { PageShell } from "@/components/page-shell";
import { Button, Card, FormMessage, SectionTitle } from "@/components/ui";
import { getCurrentUser } from "@/lib/supabase/server";
import { AddEmailForm, PasswordForm, ProfileForm } from "./profile-forms";
import { ThemeSwitch } from "./theme-switch";

export default function ProfilePage({ searchParams }: PageProps<"/profile">) {
  return (
    <PageShell>
      <Profile searchParams={searchParams} />
    </PageShell>
  );
}

async function Profile({ searchParams }: Pick<PageProps<"/profile">, "searchParams">) {
  const { saved, signout } = await searchParams;
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <>
      <h1 className="text-2xl font-semibold">Your profile</h1>
      {saved === "profile" && <FormMessage state={{ message: "Profile saved." }} />}
      {saved === "password" && <FormMessage state={{ message: "Password updated." }} />}
      {saved === "email" && <FormMessage state={{ message: "Email added. You can now sign in with it on any phone or computer." }} />}
      {user.nameOnly && signout && (
        <Card id="signout" className="space-y-3 border-amber-200 bg-amber-50">
          <h2 className="font-semibold text-amber-900">Sign out of a name-only account?</h2>
          <p className="text-sm text-amber-900">
            This account has no email, so there is no way to sign back in. You would lose access to your groups
            (your friends keep them). Add an email below first.
          </p>
          <form action={signOut}>
            <Button type="submit" variant="danger">Sign out anyway</Button>
          </form>
        </Card>
      )}
      <Card>
        <p className="mb-4 text-sm text-gray-500">
          {user.nameOnly ? "Name-only account: it lives in this browser, no email yet." : `Signed in as ${user.email}`}
        </p>
        <ProfileForm name={user.displayName} currency={user.defaultCurrency} />
      </Card>
      {user.nameOnly ? (
        <section id="add-email">
          <SectionTitle>Add an email</SectionTitle>
          <Card className="space-y-4">
            <p className="text-sm text-gray-600">
              Sign in on any phone or computer, and keep your account if this browser is cleared. Your groups and
              expenses stay the same.
            </p>
            <AddEmailForm />
          </Card>
        </section>
      ) : (
        <section>
          <SectionTitle>Change password</SectionTitle>
          <Card>
            <PasswordForm />
          </Card>
        </section>
      )}
      <section>
        <SectionTitle>Appearance</SectionTitle>
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-600">Dark mode. Auto follows your phone or computer.</p>
          <ThemeSwitch />
        </Card>
      </section>
    </>
  );
}
