"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Loader2 } from "lucide-react";

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [useCase, setUseCase] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, company, use_case: useCase }),
      });

      if (res.ok) {
        setStatus("success");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <section id="waitlist" className="py-20 sm:py-24 bg-card/50">
        <div className="mx-auto max-w-lg px-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
            <Check className="h-6 w-6 text-green-500" />
          </div>
          <h3 className="text-2xl font-bold">You&apos;re on the list!</h3>
          <p className="mt-2 text-muted-foreground">
            We&apos;ll reach out when your spot is ready.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section id="waitlist" className="py-20 sm:py-24 bg-card/50">
      <div className="mx-auto max-w-lg px-6">
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Join the waitlist</CardTitle>
            <p className="text-sm text-muted-foreground">
              Get early access to DaPipe&apos;s SaaS platform.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Input
                placeholder="Company (optional)"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
              <Textarea
                placeholder="How would you use DaPipe? (optional)"
                value={useCase}
                onChange={(e) => setUseCase(e.target.value)}
                rows={3}
              />
              <Button type="submit" className="w-full" disabled={status === "loading"}>
                {status === "loading" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {status === "loading" ? "Joining..." : "Join waitlist"}
              </Button>
              {status === "error" && (
                <p className="text-sm text-red-400 text-center">
                  Something went wrong. Please try again.
                </p>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
