import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { MealForm } from "../meal-form";
import { createMealAction } from "../actions";

export default async function NewMealPage() {
  const actor = await requireActor();
  if (!can(actor, "meals.manage")) redirect("/dashboard");

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-5 sm:p-6">
      <div>
        <p className="text-xs text-muted">
          <Link href="/settings/meals" className="hover:text-gold-deep">Meals</Link> / New
        </p>
        <h1 className="font-display text-2xl font-semibold text-ink">New meal</h1>
      </div>
      <MealForm action={createMealAction} />
    </div>
  );
}
