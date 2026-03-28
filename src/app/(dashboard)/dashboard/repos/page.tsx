import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export default async function ReposPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: membership } = await supabase
    .from("org_members").select("org_id").eq("user_id", user!.id).limit(1).maybeSingle();
  const { data: repos } = await supabase
    .from("repos").select("*").eq("org_id", membership?.org_id).order("created_at", { ascending: false });

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
