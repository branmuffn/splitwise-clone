import { PageShell } from "@/components/page-shell";
import { Card, FormMessage, SectionTitle } from "@/components/ui";
import { getCurrentUser } from "@/lib/supabase/server";
import { PasswordForm, ProfileForm } from "./profile-forms";

export default function ProfilePage({ searchParams }: PageProps<"/profile">) {
  return (
    <PageShell>
      <Profile searchParams={searchParams} />
    </PageShell>
  );
}

async function Profile({ searchParams }: Pick<PageProps<"/profile">, "searchParams">) {
  const { saved } = await searchParams;
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <>
      <h1 className="text-2xl font-semibold">Your profile</h1>
      {saved === "profile" && <FormMessage state={{ message: "Profile saved." }} />}
      {saved === "password" && <FormMessage state={{ message: "Password updated." }} />}
      <Card>
        <p className="mb-4 text-sm text-gray-500">Signed in as {user.email}</p>
        <ProfileForm name={user.displayName} currency={user.defaultCurrency} />
      </Card>
      <section>
        <SectionTitle>Change password</SectionTitle>
        <Card>
          <PasswordForm />
        </Card>
      </section>
    </>
  );
}
