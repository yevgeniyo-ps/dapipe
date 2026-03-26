"use client";

import { Shield, ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";

export function Hero() {
  return (
    <section className="relative overflow-hidden py-24 sm:py-32">
      <div className="mx-auto max-w-4xl px-6 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
          <Shield className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
          Stop supply chain attacks from{" "}
          <span className="text-red-400">stealing your CI secrets</span>
        </h1>
        <p className="mt-6 text-lg leading-8 text-muted-foreground max-w-2xl mx-auto">
          DaPipe monitors every outbound connection in your GitHub Actions
          pipelines. Define what&apos;s allowed, block everything else. Catch
          compromised dependencies before they exfiltrate your secrets.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <a
            href="#waitlist"
            className={cn(buttonVariants({ size: "lg" }))}
          >
            Join the waitlist
            <ArrowRight className="ml-2 h-4 w-4" />
          </a>
          <Link
            href="https://github.com/prompt-security/ps-ci-mon"
            className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
          >
            View on GitHub
          </Link>
        </div>
      </div>
    </section>
  );
}
