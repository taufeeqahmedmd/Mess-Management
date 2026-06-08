import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { CategoryForm, type CategoryData } from "../../category-form";
import { updateCategoryAction } from "../../actions";

export default async function EditCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireActor();
  if (!can(actor, "categories.manage")) redirect("/dashboard");

  const { id } = await params;
  let categoryId: bigint;
  try {
    categoryId = BigInt(id);
  } catch {
    notFound();
  }

  const cat = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!cat) notFound();

  const category: CategoryData = {
    id: cat.id.toString(),
    code: cat.code,
    name: cat.name,
    identifierLabel: cat.identifierLabel,
    identifierRegex: cat.identifierRegex,
    identifierRequired: cat.identifierRequired,
    identifierUnique: cat.identifierUnique,
    status: cat.status === "inactive" ? "inactive" : "active",
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-5 sm:p-6">
      <div>
        <p className="text-xs text-muted">
          <Link href="/settings/categories" className="hover:text-gold-deep">Categories</Link> / {cat.name}
        </p>
        <h1 className="font-display text-2xl font-semibold text-ink">Edit category</h1>
      </div>
      <CategoryForm action={updateCategoryAction} category={category} />
    </div>
  );
}
