import { FileText, Cpu, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const steps = [
  {
    icon: FileText,
    title: "Define your baseline",
    description:
      "List the domains your CI pipeline legitimately connects to. Or let DaPipe learn them automatically in monitor mode.",
  },
  {
    icon: Cpu,
    title: "Hook every connection",
    description:
      "DaPipe injects via LD_PRELOAD — zero config, zero code changes. Every outbound connection is logged with full process context.",
  },
  {
    icon: ShieldCheck,
    title: "Block the anomalies",
    description:
      "In restrict mode, only baselined domains are allowed. Compromised dependencies get blocked before they can phone home.",
  },
];

export function HowItWorks() {
  return (
    <section className="py-20 sm:py-24">
      <div className="mx-auto max-w-5xl px-6">
        <h2 className="text-center text-3xl font-bold tracking-tight">
          How it works
        </h2>
        <p className="mt-4 text-center text-muted-foreground max-w-2xl mx-auto">
          Three steps to secure your CI pipeline from supply chain attacks.
        </p>
        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {steps.map((step, i) => (
            <Card key={i} className="relative">
              <CardHeader>
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <step.icon className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-lg">
                  <span className="text-muted-foreground mr-2">
                    {i + 1}.
                  </span>
                  {step.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {step.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
