import { redirect } from "next/navigation";

// Recharge management moved into Reports → Recharges tab. Keep this route as a
// redirect so existing links + the recharge actions' fallback still resolve.
export default async function RechargePage({
  searchParams,
}: {
  searchParams: Promise<{ flash?: string }>;
}) {
  const sp = await searchParams;
  const flash = sp.flash ? `&flash=${encodeURIComponent(sp.flash)}` : "";
  redirect(`/reports?tab=recharges${flash}`);
}
