import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { CounterForm } from "../counter-form";
import { createCounterAction } from "../actions";

export default async function NewCounterPage() {
  const actor = await requireActor();
  if (!can(actor, "counters.manage")) redirect("/dashboard");

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-5 sm:p-6">
      <div>
        <p className="text-xs text-muted">
          <Link href="/settings/counters" className="hover:text-gold-deep">Counters</Link> / New
        </p>
        <h1 className="font-display text-2xl font-semibold text-ink">New counter</h1>
        <p className="mt-1 text-sm text-ink-2">Create the counter, then assign operators from its edit page.</p>
      </div>
      <CounterForm action={createCounterAction} />
    </div>
  );
}
