import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AdminSidebar } from "@/components/admin/sidebar";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { SidebarProvider } from "@/components/sidebar-context";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) redirect("/dashboard");

  return (
    <SidebarProvider>
      <AdminSidebar
        user={{
          email: user.email,
          avatar_url: user.user_metadata?.avatar_url,
          full_name: user.user_metadata?.full_name,
        }}
      />
      <DashboardShell>
        <main className="px-6 py-6">{children}</main>
      </DashboardShell>
    </SidebarProvider>
  );
}
