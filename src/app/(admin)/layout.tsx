import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AdminSidebar } from "@/components/admin/sidebar";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { SidebarProvider } from "@/components/sidebar-context";

export const metadata: Metadata = {
  title: "dapipe admin",
  icons: {
    icon: "/admin/icon.svg",
  },
};

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
        <div className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-red-600 px-4 py-1.5 text-[12px] font-semibold text-white tracking-wide uppercase">
          Admin Backoffice
        </div>
        <main className="px-6 py-6">{children}</main>
      </DashboardShell>
    </SidebarProvider>
  );
}
