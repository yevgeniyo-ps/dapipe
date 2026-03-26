export function TrivyDemo() {
  return (
    <section className="py-20 sm:py-24 bg-card/50">
      <div className="mx-auto max-w-4xl px-6">
        <h2 className="text-center text-3xl font-bold tracking-tight">
          Real-world: Trivy supply chain attack
        </h2>
        <p className="mt-4 text-center text-muted-foreground max-w-2xl mx-auto">
          In March 2025, the popular Trivy scanner was compromised to exfiltrate
          CI secrets to attacker-controlled C2 domains. Here&apos;s what DaPipe
          sees:
        </p>

        <div className="mt-10 rounded-xl border bg-black/80 p-6 font-mono text-sm overflow-x-auto">
          <div className="mb-4 flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-red-500" />
            <div className="h-3 w-3 rounded-full bg-yellow-500" />
            <div className="h-3 w-3 rounded-full bg-green-500" />
            <span className="ml-2 text-muted-foreground text-xs">
              GitHub Actions — CI run #1847
            </span>
          </div>

          <div className="space-y-1">
            <Line status="allowed" domain="github.com" />
            <Line status="allowed" domain="registry.npmjs.org" />
            <Line status="allowed" domain="api.github.com" />
            <Line status="allowed" domain="ghcr.io" />
            <Line status="blocked" domain="pfrr.icu" />
            <Line status="blocked" domain="efrr.icu" />
            <Line status="blocked" domain="trfrr.icu" />
          </div>

          <div className="mt-4 border-t border-white/10 pt-4">
            <span className="text-red-400">
              DaPipe: 3 blocked domain(s) — CI secrets protected
            </span>
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          The compromised Trivy action tried to reach C2 domains{" "}
          <code className="text-red-400">pfrr.icu</code>,{" "}
          <code className="text-red-400">efrr.icu</code>,{" "}
          <code className="text-red-400">trfrr.icu</code>. DaPipe blocked all
          three.
        </p>
      </div>
    </section>
  );
}

function Line({ status, domain }: { status: "allowed" | "blocked"; domain: string }) {
  const isBlocked = status === "blocked";
  return (
    <div className={isBlocked ? "text-red-400" : "text-green-400"}>
      <span className="text-muted-foreground select-none">
        {isBlocked ? "[BLOCKED] " : "[  OK   ] "}
      </span>
      <span>connect → {domain}:443</span>
      {isBlocked && (
        <span className="text-red-500/70 ml-4">← C2 domain</span>
      )}
    </div>
  );
}
