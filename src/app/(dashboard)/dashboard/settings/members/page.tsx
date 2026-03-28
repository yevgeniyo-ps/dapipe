import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";

export default async function MembersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: membership } = await supabase.from("org_members").select("org_id").eq("user_id", user!.id).limit(1).maybeSingle();
  const { data: members } = await supabase.from("org_members").select("*").eq("org_id", membership?.org_id).order("created_at", { ascending: true });

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
