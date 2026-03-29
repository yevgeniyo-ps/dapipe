"use client";

import { useEffect, useState, useCallback } from "react";
import { useInterval } from "@/lib/use-interval";
import { useOrgId } from "@/components/org-context";
import { getMembers } from "../../actions";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

export default function MembersPage() {
  const orgId = useOrgId();
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!orgId) return;
    try {
      setMembers(await getMembers(orgId));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { load(); }, [load]);
  useInterval(load, 10000);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-[20px] font-semibold">Members</h1>

      <div className="rounded-2xl border overflow-hidden">
        {!members || members.length === 0 ? (
          <p className="text-[13px] text-muted-foreground py-12 text-center">No members found.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b">
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">User</th>
                <th className="px-4 py-3 text-right text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">Role</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id} className="border-b last:border-0">
                  <td className="px-4 py-3 text-[12px] font-mono text-secondary-foreground">{member.user_id}</td>
                  <td className="px-4 py-3 text-right"><Badge variant="outline">{member.role}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
