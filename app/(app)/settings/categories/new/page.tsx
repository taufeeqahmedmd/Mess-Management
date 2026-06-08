import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { CategoryForm } from "../category-form";
import { createCategoryAction } from "../actions";

export default async function NewCategoryPage() {
  const actor = await requireActor();
  if (!can(actor, "categories.manage")) redirect("/dashboard");

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <p className="text-xs text-muted">
          <Link href="/settings/categories" className="hover:text-gold-deep">Categories</Link> / New
        </p>
        <h1 className="font-display text-2xl font-semibold text-ink">New category</h1>
      </div>
      <CategoryForm action={createCategoryAction} />
    </div>
  );
}
