"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

const tiers = [
  {
    name: "Free",
    price: "$0",
    description: "For open source and small teams",
    features: [
      "Up to 3 repos",
      "Monitor mode",
      "GitHub step summaries",
      "Community support",
    ],
    cta: "Join waitlist",
    highlight: false,
  },
  {
    name: "Pro",
    price: "$29",
    period: "/mo",
    description: "For teams shipping production software",
    features: [
      "Unlimited repos",
      "Monitor + restrict modes",
      "Centralized policy management",
      "Historical reports & analytics",
      "API access",
      "Email support",
    ],
    cta: "Join waitlist",
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    description: "For organizations with compliance needs",
    features: [
      "Everything in Pro",
      "SSO / SAML",
      "Threat intel feeds",
      "Dedicated support",
      "SLA guarantees",
      "On-prem option",
    ],
    cta: "Contact us",
    highlight: false,
  },
];

export function Pricing() {
  return (
    <section className="py-20 sm:py-24">
      <div className="mx-auto max-w-5xl px-6">
        <h2 className="text-center text-3xl font-bold tracking-tight">
          Pricing
        </h2>
        <p className="mt-4 text-center text-muted-foreground">
          All plans are coming soon. Join the waitlist for early access.
        </p>
        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {tiers.map((tier) => (
            <Card
              key={tier.name}
              className={
                tier.highlight
                  ? "ring-2 ring-primary relative"
                  : "relative"
              }
            >
              {tier.highlight && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
                  Most popular
                </Badge>
              )}
              <CardHeader>
                <CardTitle className="text-lg">{tier.name}</CardTitle>
                <div className="mt-2">
                  <span className="text-3xl font-bold">{tier.price}</span>
                  {tier.period && (
                    <span className="text-muted-foreground">{tier.period}</span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {tier.description}
                </p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 mb-6">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-green-500 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <a
                  href="#waitlist"
                  className={cn(
                    buttonVariants({
                      variant: tier.highlight ? "default" : "outline",
                    }),
                    "w-full"
                  )}
                >
                  {tier.cta}
                </a>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
