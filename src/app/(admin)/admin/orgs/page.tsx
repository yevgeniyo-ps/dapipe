"use client";

import { useEffect, useState } from "react";
import { Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { listOrgs } from "../actions";

interface Org {
  id: string;
  name: string;
  slug: string;
  members_count: number;
  repos_count: number;
  reports_count: number;
  last_report_at: string | null;
  created_at: string;
}

export default function OrgsPage() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const result = await listOrgs();
        setOrgs((result.orgs || []) as Org[]);
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

  return (
    <div className="space-y-6">
      <h1 className="text-[20px] font-semibold">Organizations</h1>

      <div className="rounded-2xl border overflow-hidden">
        {orgs.length === 0 ? (
          <p className="text-[13px] text-muted-foreground py-12 text-center">
            No organizations yet.
          </p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b">
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px] w-8"></th>
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">
                  Slug
                </th>
                <th className="px-4 py-3 text-center text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">
                  Members
                </th>
                <th className="px-4 py-3 text-center text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">
                  Repos
                </th>
                <th className="px-4 py-3 text-center text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">
                  Reports
                </th>
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">
                  Last Active
                </th>
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">
                  Created
                </th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((org) => {
                const isExpanded = expandedId === org.id;
                return (
                  <>
                    <tr
                      key={org.id}
                      className="border-b last:border-0 hover:bg-accent cursor-pointer transition-colors"
                      onClick={() =>
                        setExpandedId(isExpanded ? null : org.id)
                      }
                    >
                      <td className="px-4 py-3">
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-[13px] font-medium">
                        {org.name}
                      </td>
                      <td className="px-4 py-3 text-[12px] font-mono text-muted-foreground">
                        {org.slug}
                      </td>
                      <td className="px-4 py-3 text-center text-[13px] text-secondary-foreground">
                        {org.members_count}
                      </td>
                      <td className="px-4 py-3 text-center text-[13px] text-secondary-foreground">
                        {org.repos_count}
                      </td>
                      <td className="px-4 py-3 text-center text-[13px] text-secondary-foreground">
                        {org.reports_count}
                      </td>
                      <td className="px-4 py-3 text-[13px] text-muted-foreground">
                        {org.last_report_at
                          ? new Date(org.last_report_at).toLocaleDateString()
                          : "--"}
                      </td>
                      <td className="px-4 py-3 text-[13px] text-muted-foreground">
                        {new Date(org.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${org.id}-detail`} className="border-b last:border-0">
                        <td colSpan={8} className="px-8 py-4 bg-accent/30">
                          <div className="grid grid-cols-2 gap-4 text-[13px]">
                            <div>
                              <span className="text-muted-foreground">ID:</span>{" "}
                              <span className="font-mono text-[12px]">
                                {org.id}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">
                                Full name:
                              </span>{" "}
                              {org.name}
                            </div>
                            <div>
                              <span className="text-muted-foreground">
                                Members:
                              </span>{" "}
                              {org.members_count}
                            </div>
                            <div>
                              <span className="text-muted-foreground">
                                Repos:
                              </span>{" "}
                              {org.repos_count}
                            </div>
                            <div>
                              <span className="text-muted-foreground">
                                Total reports:
                              </span>{" "}
                              {org.reports_count}
                            </div>
                            <div>
                              <span className="text-muted-foreground">
                                Created:
                              </span>{" "}
                              {new Date(org.created_at).toLocaleString()}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
