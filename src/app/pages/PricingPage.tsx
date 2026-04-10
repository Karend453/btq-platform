import React from "react";
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

type Plan = {
  id: PlanId;
  name: string;
  price: number;
  positioning: string;
  bullets: string[];
  cta: string;
};

const PLANS: Plan[] = [
  {
    id: "core",
    name: "Core",
    price: 299,
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
    price: 350,
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
    price: 499,
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
  return (
    <div className="min-h-screen bg-slate-50 text-foreground">
      <header className="border-b border-border/60 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div className="text-lg font-semibold tracking-tight">BTQ</div>
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

        <div className="mt-14 grid gap-8 md:grid-cols-3">
          {PLANS.map((plan) => (
            <Card
              key={plan.id}
              className="flex h-full flex-col border-border/80 bg-card shadow-sm transition-shadow hover:shadow-md"
            >
              <CardHeader className="gap-3">
                <CardTitle className="text-xl font-semibold tracking-tight">{plan.name}</CardTitle>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-semibold tracking-tight">
                    ${plan.price}
                  </span>
                  <span className="text-sm font-medium text-muted-foreground">/mo</span>
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
                  <Link to={`/signup?plan=${plan.id}`}>{plan.cta}</Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
