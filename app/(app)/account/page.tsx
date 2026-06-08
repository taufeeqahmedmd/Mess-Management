import { auth } from "@/lib/auth";
import { ChangePasswordForm } from "./change-password-form";

export default async function AccountPage() {
  const session = await auth();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-5 sm:p-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Your account</h1>
        <p className="mt-1 text-sm text-ink-2">
          Signed in as{" "}
          <span className="font-medium text-ink">{session?.user?.name}</span>
          {session?.user?.roleName ? ` · ${session.user.roleName}` : null}
        </p>
      </div>

      <section className="rounded-md border border-line bg-surface-2 p-6">
        <h2 className="font-display text-lg font-semibold text-ink">Change password</h2>
        <p className="mb-4 mt-1 text-sm text-ink-2">
          Verify your current password, then set a new one.
        </p>
        <ChangePasswordForm />
      </section>
    </div>
  );
}
