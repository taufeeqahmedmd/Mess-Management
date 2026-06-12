import { redirect } from "next/navigation";

/** Consumption is now a tab on /reports. Preserve any incoming filters. */
export default async function ConsumptionRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams({ tab: "consumption" });
  for (const [k, v] of Object.entries(sp)) if (v && k !== "tab") qs.set(k, v);
  redirect(`/reports?${qs.toString()}`);
}
