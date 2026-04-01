/** Marketing / signup: Brokerteq package tiers (see Pricing page). */
export type PlanKey = "core" | "growth" | "pro";

export const PLAN_ORDER: PlanKey[] = ["core", "growth", "pro"];

export const PLAN_DETAILS: Record<
  PlanKey,
  { label: string; pricePerMonth: number; tagline: string }
> = {
  core: {
    label: "Core",
    pricePerMonth: 299,
    tagline: "For independent brokerages building a stronger back office foundation.",
  },
  growth: {
    label: "Growth",
    pricePerMonth: 399,
    tagline: "For brokerages ready to scale lead generation and support.",
  },
  pro: {
    label: "Pro",
    pricePerMonth: 499,
    tagline: "For teams and brokerages that need advanced oversight and flexibility.",
  },
};

export function parsePlanKey(raw: string | null | undefined): PlanKey | null {
  const k = (raw ?? "").trim().toLowerCase();
  if (k === "core" || k === "growth" || k === "pro") return k;
  return null;
}
