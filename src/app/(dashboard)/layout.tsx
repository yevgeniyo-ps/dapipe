import { createClient, createServiceClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/dashboard/sidebar";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Topbar } from "@/components/dashboard/topbar";
import { OrgProvider } from "@/components/org-context";
import { SidebarProvider } from "@/components/sidebar-context";
import type { OrgRole, OrgMembership } from "@/lib/types/database";

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

  const { data: approved } = await supabase.rpc("is_approved");
  if (!approved) redirect("/waitlist");

  // Use service client for membership query to avoid RLS join issues
  const service = createServiceClient();
  const { data: allMemberships } = await service
    .from("org_members")
    .select("org_id, role, organizations(name, slug)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  // Build memberships list
  const memberships: OrgMembership[] = (allMemberships || []).map(
    (m: any) => ({
      org_id: m.org_id,
      org_name: m.organizations?.name || "Unknown",
      org_slug: m.organizations?.slug || "",
      role: m.role as OrgRole,
    })
  );

  let orgId: string | undefined;
  let role: OrgRole = "owner";

  if (memberships.length > 0) {
    // Check cookie for preferred org
    const cookieStore = await cookies();
    const preferredOrg = cookieStore.get("dapipe-org")?.value;

    const preferred = preferredOrg
      ? memberships.find((m) => m.org_id === preferredOrg)
      : null;

    if (preferred) {
      orgId = preferred.org_id;
      role = preferred.role;
    } else {
      orgId = memberships[0].org_id;
      role = memberships[0].role;
    }
  }

  // Auto-create org for new users with no memberships
  if (!orgId) {
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
      role = "owner";
      memberships.push({
        org_id: org.id,
        org_name: name,
        org_slug: slug,
        role: "owner",
      });
    }
  }

  return (
    <OrgProvider orgId={orgId!} role={role} memberships={memberships}>
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
