import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { OrgProvider } from "@/components/org-context";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Run approval check and membership check in parallel
  const [{ data: approved }, { data: memberships }] = await Promise.all([
    supabase.rpc("is_approved"),
    supabase
      .from("org_members")
      .select("org_id")
      .eq("user_id", user.id)
      .limit(1),
  ]);

  if (!approved) redirect("/waitlist");

  let orgId = memberships?.[0]?.org_id;

  if (!orgId) {
    // Use service client to bypass RLS for initial org + member creation.
    // The user session client cannot insert into organizations (no INSERT
    // policy) and the org_members INSERT policy requires an existing
    // membership, creating a chicken-and-egg problem for the first member.
    const service = createServiceClient();

    const name =
      user.user_metadata?.full_name ||
      user.email?.split("@")[0] ||
      "My Org";
    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, "-");

    const { data: org } = await service
      .from("organizations")
      .insert({ name, slug })
      .select()
      .single();

    if (org) {
      await service
        .from("org_members")
        .insert({ org_id: org.id, user_id: user.id, role: "owner" });
      orgId = org.id;
    }
  }

  return (
    <OrgProvider orgId={orgId!}>
      <div className="flex h-screen">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar
            user={{
              email: user.email,
              avatar_url: user.user_metadata?.avatar_url,
              full_name: user.user_metadata?.full_name,
            }}
          />
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
    </OrgProvider>
  );
}
