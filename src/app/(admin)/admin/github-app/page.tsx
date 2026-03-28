"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Github, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { getGitHubAppStatus } from "../actions";

interface EnvStatus {
  appId: boolean;
  privateKey: boolean;
  webhookSecret: boolean;
  clientId: boolean;
  clientSecret: boolean;
}

export default function GitHubAppPage() {
  const [status, setStatus] = useState<EnvStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await getGitHubAppStatus();
        setStatus(data);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading)
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );

  const envVars = [
    { label: "GITHUB_APP_ID", configured: status?.appId ?? false },
    { label: "GITHUB_APP_PRIVATE_KEY", configured: status?.privateKey ?? false },
    { label: "GITHUB_WEBHOOK_SECRET", configured: status?.webhookSecret ?? false },
    { label: "GITHUB_CLIENT_ID", configured: status?.clientId ?? false },
    { label: "GITHUB_CLIENT_SECRET", configured: status?.clientSecret ?? false },
  ];

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-[20px] font-semibold">GitHub App</h1>

      <div className="rounded-2xl border p-5 space-y-4">
        <div className="flex items-center gap-3">
          <Github className="h-8 w-8 text-muted-foreground" />
          <div>
            <h3 className="text-[14px] font-semibold">
              GitHub App management coming soon
            </h3>
            <p className="text-[13px] text-muted-foreground">
              Configure the GitHub App in Phase 3.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border p-5 space-y-4">
        <h3 className="text-[14px] font-semibold">Environment Variables</h3>
        <p className="text-[13px] text-muted-foreground">
          These environment variables must be set for the GitHub App to function.
        </p>
        <div className="space-y-2">
          {envVars.map((v) => (
            <div
              key={v.label}
              className="flex items-center justify-between rounded-lg border px-4 py-2.5"
            >
              <code className="text-[12px] font-mono">{v.label}</code>
              {v.configured ? (
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                  Configured
                </Badge>
              ) : (
                <Badge variant="destructive" className="gap-1">
                  <XCircle className="h-3 w-3" />
                  Not set
                </Badge>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
