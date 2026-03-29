"use client";

import { useEffect, useState, useCallback } from "react";
import { useInterval } from "@/lib/use-interval";
import {
  Building2,
  GitFork,
  FileBarChart,
  ShieldAlert,
  Activity,
  Package,
  Loader2,
} from "lucide-react";
import { getAdminStats } from "./actions";

interface AdminStats {
  total_orgs: number;
  total_repos: number;
  total_reports: number;
  total_blocked_connections: number;
  reports_today: number;
  latest_binary_version: string | null;
}

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await getAdminStats();
      setStats(data as AdminStats);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useInterval(load, 10000);

  if (loading)
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );

  const statCards = [
    {
      label: "Organizations",
      value: stats?.total_orgs ?? 0,
      icon: Building2,
    },
    {
      label: "Repos",
      value: stats?.total_repos ?? 0,
      icon: GitFork,
    },
    {
      label: "Reports",
      value: stats?.total_reports ?? 0,
      icon: FileBarChart,
    },
    {
      label: "Blocked",
      value: stats?.total_blocked_connections ?? 0,
      icon: ShieldAlert,
    },
    {
      label: "Reports today",
      value: stats?.reports_today ?? 0,
      icon: Activity,
    },
    {
      label: "Latest binary",
      value: stats?.latest_binary_version || "none",
      icon: Package,
    },
  ];

  return (
    <div className="space-y-8">
      <h1 className="text-[20px] font-semibold">Admin Overview</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {statCards.map((stat) => (
          <div key={stat.label} className="rounded-2xl border p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-medium uppercase tracking-[0.5px] text-muted-foreground">
                {stat.label}
              </span>
              <stat.icon className="h-3.5 w-3.5 text-[#48484a]" />
            </div>
            <div className="text-[28px] font-semibold leading-none">
              {stat.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
