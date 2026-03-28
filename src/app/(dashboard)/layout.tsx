import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/dashboard/sidebar";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Topbar } from "@/components/dashboard/topbar";
import { OrgProvider } from "@/components/org-context";
import { SidebarProvider } from "@/components/sidebar-context";

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
      <SidebarProvider>
        <Sidebar
          user={{
            email: user.email,
            avatar_url: user.user_metadata?.avatar_url,
            full_name: user.user_metadata?.full_name,
          }}
        />
        <DashboardShell>
          <Topbar />
          <main className="px-6 pb-8">{children}</main>
        </DashboardShell>
      </SidebarProvider>
    </OrgProvider>
  );
}
