"use client";

import { useEffect, useState, useCallback } from "react";
import { useInterval } from "@/lib/use-interval";
import { useOrg } from "@/components/org-context";
import { getRepos } from "../actions";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import Link from "next/link";

export default function ReposPage() {
  const { orgId } = useOrg();
  const [repos, setRepos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!orgId) return;
    try {
      setRepos(await getRepos(orgId));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { load(); }, [load]);
  useInterval(load, 10000);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-[20px] font-semibold">Repos</h1>

      <div className="rounded-2xl border overflow-hidden">
        {!repos || repos.length === 0 ? (
          <p className="text-[13px] text-muted-foreground py-12 text-center">
            No repos registered yet. Add the DaPipe action with your API key.
          </p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b">
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">Repository</th>
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">Added</th>
                <th className="px-4 py-3 text-right text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">Status</th>
              </tr>
            </thead>
            <tbody>
              {repos.map((repo) => (
                <tr key={repo.id} className="border-b last:border-0 hover:bg-accent transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/repos/${repo.id}`} className="text-[14px] font-medium hover:underline">
                      {repo.full_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-muted-foreground">
                    {new Date(repo.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Badge variant={repo.is_active ? "secondary" : "outline"}>
                      {repo.is_active ? "active" : "inactive"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
