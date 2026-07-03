import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { ImportForm } from "./import-form";

export default async function ImportUsersPage() {
  const actor = await requireActor();
  if (!can(actor, "users.import")) redirect("/dashboard");

  return (
    <div className="flex w-full max-w-3xl flex-col gap-6 px-5 py-5 sm:px-8 sm:py-6">
      <div>
        <p className="text-xs text-muted">
          <Link href="/users" className="hover:text-gold-deep">Cardholders</Link> / Import
        </p>
        <h1 className="font-display text-2xl font-semibold text-ink">Import cardholders</h1>
        <p className="mt-1 text-sm text-ink-2">
          Upload a CSV to bulk-create cardholders. Each valid row creates a cardholder (and a
          card if a UID is given); invalid rows are reported and skipped.{" "}
          <a href="/api/users/sample" className="font-medium text-gold-deep hover:underline">
            Download a sample template
          </a>
          .
        </p>
      </div>

      <ImportForm />
    </div>
  );
}
