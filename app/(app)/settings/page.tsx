import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/session";
import { can, type Permission } from "@/lib/rbac";

type Section = {
  href: string;
  label: string;
  desc: string;
  permission: Permission;
  ready: boolean;
};

const SECTIONS: Section[] = [
  { href: "/settings/categories", label: "Categories", desc: "Cardholder types and identifier rules", permission: "categories.manage", ready: true },
  { href: "/settings/meals", label: "Meals", desc: "Meal types and time windows", permission: "meals.manage", ready: false },
  { href: "/settings/rates", label: "Rates", desc: "Charge + vendor price matrix", permission: "rates.manage", ready: false },
  { href: "/settings/consumption", label: "Consumption Settings", desc: "Wallet/coupon, duplicate window, session", permission: "categories.manage", ready: false },
  { href: "/settings/counters", label: "Counters", desc: "Counters and operator assignment", permission: "counters.manage", ready: false },
  { href: "/settings/staff", label: "Staff", desc: "Portal employees and roles", permission: "staff.manage", ready: false },
];

export default async function SettingsPage() {
  const actor = await requireActor();
  const sections = SECTIONS.filter((s) => can(actor, s.permission));
  if (sections.length === 0) redirect("/dashboard");

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-5 sm:p-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Configurations</h1>
        <p className="mt-1 text-sm text-ink-2">Master data for the cafeteria.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((s) =>
          s.ready ? (
            <Link
              key={s.href}
              href={s.href}
              className="rounded-md border border-line bg-surface p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <h2 className="font-display text-lg font-semibold text-ink">{s.label}</h2>
              <p className="mt-1 text-sm text-ink-2">{s.desc}</p>
            </Link>
          ) : (
            <div
              key={s.href}
              className="rounded-md border border-line bg-surface-2 p-5 opacity-70"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-lg font-semibold text-ink">{s.label}</h2>
                <span className="rounded-pill bg-line px-2 py-0.5 text-[11px] font-medium text-ink-2">
                  Soon
                </span>
              </div>
              <p className="mt-1 text-sm text-ink-2">{s.desc}</p>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
