import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../components/ui/card";

type PlanId = "core" | "growth" | "pro";

type BillingCycle = "monthly" | "annual";

type Plan = {
  id: PlanId;
  name: string;
  priceMonthly: number;
  priceAnnual: number;
  positioning: string;
  bullets: string[];
  cta: string;
};

const PLANS: Plan[] = [
  {
    id: "core",
    name: "Core",
    priceMonthly: 299,
    priceAnnual: 2999,
    positioning: "For independent brokerages building a stronger back office foundation.",
    bullets: [
      "BTQ system of record",
      "Lofty CRM + IDX website",
      "Transaction tracking + compliance",
      "Document organization + audit trail",
      "Email intake with auto document routing",
    ],
    cta: "Get started with Core",
  },
  {
    id: "growth",
    name: "Growth",
    priceMonthly: 350,
    priceAnnual: 3500,
    positioning: "For brokerages ready to scale lead generation and support.",
    bullets: [
      "Everything in Core",
      "Landvoice lead generation",
      "Priority support",
      "Workflow optimization guidance",
    ],
    cta: "Get started with Growth",
  },
  {
    id: "pro",
    name: "Pro",
    priceMonthly: 499,
    priceAnnual: 4999,
    positioning: "For teams and brokerages that need advanced oversight and flexibility.",
    bullets: [
      "Everything in Growth",
      "Advanced transaction management",
      "Broker dashboard + agent management",
      "Compliance oversight",
      "Expanded back-office support",
    ],
    cta: "Get started with Pro",
  },
];

export function PricingPage() {
  const [billing, setBilling] = useState<BillingCycle>("monthly");

  return (
    <div className="min-h-screen bg-slate-50 text-foreground">
      <header className="border-b border-border/60 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <a
            href="https://brokerteq.com"
            className="text-lg font-semibold tracking-tight transition-opacity hover:opacity-80"
          >
            BTQ
          </a>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/login">Sign in</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-20 pt-14 md:pt-20">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            Choose the Brokerteq package that fits your brokerage
          </h1>
          <p className="mt-5 text-pretty text-lg text-muted-foreground md:text-xl">
            Built for brokerages that want best-in-class tools without bloated all-in-one software.
          </p>
          <p className="mt-4 text-pretty text-sm leading-relaxed text-muted-foreground md:text-base">
            BTQ is your system of record, with Lofty, Landvoice, and advanced transaction workflows
            built around the way real brokerages actually operate.
          </p>
        </div>

        <div className="mt-10 flex justify-center">
          <div
            role="tablist"
            aria-label="Billing cycle"
            className="inline-flex items-center rounded-full border border-border/80 bg-background p-1 shadow-sm"
          >
            <button
              type="button"
              role="tab"
              aria-selected={billing === "monthly"}
              onClick={() => setBilling("monthly")}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                billing === "monthly"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={billing === "annual"}
              onClick={() => setBilling("annual")}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                billing === "annual"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Annual
            </button>
          </div>
        </div>

        <div className="mt-10 grid gap-8 md:grid-cols-3">
          {PLANS.map((plan) => {
            const price = billing === "monthly" ? plan.priceMonthly : plan.priceAnnual;
            const suffix = billing === "monthly" ? "/mo" : "/yr";
            return (
              <Card
                key={plan.id}
                className="flex h-full flex-col border-border/80 bg-card shadow-sm transition-shadow hover:shadow-md"
              >
                <CardHeader className="gap-3">
                  <CardTitle className="text-xl font-semibold tracking-tight">{plan.name}</CardTitle>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-semibold tracking-tight">
                      ${price.toLocaleString("en-US")}
                    </span>
                    <span className="text-sm font-medium text-muted-foreground">{suffix}</span>
                  </div>
                  <CardDescription className="text-base leading-relaxed text-muted-foreground">
                    {plan.positioning}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 space-y-3 pt-0">
                  <ul className="space-y-3">
                    {plan.bullets.map((line) => (
                      <li key={line} className="flex gap-3 text-sm leading-snug text-foreground">
                        <Check
                          className="mt-0.5 size-4 shrink-0 text-primary"
                          aria-hidden
                        />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter className="flex-col gap-3 border-t border-border/60 pt-6">
                  <Button className="w-full" size="lg" asChild>
                    <Link to={`/signup?plan=${plan.id}&billing=${billing}`}>{plan.cta}</Link>
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
}
