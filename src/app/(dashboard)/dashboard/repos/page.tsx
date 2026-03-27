import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export default async function ReposPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: membership } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", user!.id)
    .limit(1)
    .maybeSingle();

  const { data: repos } = await supabase
    .from("repos")
    .select("*")
    .eq("org_id", membership?.org_id)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Repos</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monitored repositories</CardTitle>
          <CardDescription>
            Repos are auto-registered when the DaPipe action runs with an API
            key.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!repos || repos.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No repos registered yet. Add the DaPipe action with your API key
              to a repository.
            </p>
          ) : (
            <div className="space-y-2">
              {repos.map((repo) => (
                <Link
                  key={repo.id}
                  href={`/dashboard/repos/${repo.id}`}
                  className="flex items-center justify-between rounded-md border p-3 hover:bg-accent/50 transition-colors"
                >
                  <span className="text-sm font-medium">{repo.full_name}</span>
                  <Badge variant={repo.is_active ? "secondary" : "outline"}>
                    {repo.is_active ? "active" : "inactive"}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
