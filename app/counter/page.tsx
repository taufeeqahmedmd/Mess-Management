import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { auth } from "@/lib/auth";
import { CounterScreen } from "./counter-screen";
import { ServiceWorkerRegister } from "./sw-register";

export default async function CounterPage() {
  const actor = await requireActor();
  if (!can(actor, "counter.operate")) redirect("/dashboard");
  const session = await auth();

  // A pure counter operator (only `counter.operate`, not Super Admin) has nowhere
  // to "exit" to, so they get a Logout button; anyone with wider access gets an
  // Exit back into the app (the vendor dashboard).
  const counterOnly =
    !actor.isSuperAdmin && Array.from(actor.permissions).every((p) => p === "counter.operate");

  const counters = await prisma.counter.findMany({
    where: {
      status: "active",
      operators: { some: { appUserId: BigInt(actor.id) } },
      ...(actor.branchId ? { branchId: BigInt(actor.branchId) } : {}),
    },
    orderBy: { code: "asc" },
  });

  if (counters.length === 0) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas p-6 text-center">
        <h1 className="font-display text-[27px] font-bold tracking-[-0.6px] text-ink">No counter assigned</h1>
        <p className="max-w-sm text-sm text-muted">
          You aren&rsquo;t assigned to any active counter. Ask an administrator to assign you under
          Settings → Counters.
        </p>
        <Link href="/dashboard" className="mt-2 rounded-pill border border-line-strong bg-surface px-[18px] py-2 text-[13px] font-semibold text-ink-2 transition-colors hover:border-gold-soft-2 hover:bg-gold-soft hover:text-gold-deep">
          Back to dashboard
        </Link>
      </main>
    );
  }

  return (
    <>
      <ServiceWorkerRegister />
      <CounterScreen
        counters={counters.map((c) => ({ id: c.id.toString(), name: c.name, code: c.code }))}
        operatorName={session?.user?.name ?? "Operator"}
        counterOnly={counterOnly}
      />
    </>
  );
}
