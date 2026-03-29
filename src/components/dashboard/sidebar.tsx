"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutDashboard,
  GitFork,
  Shield,
  FileBarChart,
  Rocket,
  ClipboardList,
  Settings,
  Key,
  Users,
  LogOut,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Logo } from "@/components/logo";
import { useSidebar } from "@/components/sidebar-context";

const navigation = [
  { name: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { name: "Repos", href: "/dashboard/repos", icon: GitFork },
  { name: "Egress Rules", href: "/dashboard/policies", icon: Shield },
  { name: "Reports", href: "/dashboard/reports", icon: FileBarChart },
  { name: "Deploy", href: "/dashboard/deploy", icon: Rocket },
  { name: "Audit", href: "/dashboard/audit", icon: ClipboardList },
];

const settingsNav = [
  { name: "API Keys", href: "/dashboard/settings/api-keys", icon: Key },
  { name: "Members", href: "/dashboard/settings/members", icon: Users },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
];

interface SidebarProps {
  user?: {
    email?: string;
    avatar_url?: string;
    full_name?: string;
  };
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { collapsed, toggle } = useSidebar();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  const initials = user?.full_name
    ? user.full_name.split(" ").map((n) => n[0]).join("").toUpperCase()
    : user?.email?.[0]?.toUpperCase() || "?";

  return (
    <aside
      className={cn(
        "hidden lg:flex lg:flex-col fixed top-3 left-3 bottom-3 z-50 rounded-2xl border bg-sidebar overflow-visible transition-[width] duration-200 ease-in-out",
        collapsed ? "w-[56px]" : "w-[200px]"
      )}
    >
      {/* Collapse toggle */}
      <button
        onClick={toggle}
        className="absolute -right-3.5 top-1/2 -translate-y-1/2 z-[101] flex h-7 w-7 items-center justify-center rounded-full border bg-sidebar hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer"
      >
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className="transition-transform duration-200"
          style={{ transform: collapsed ? "rotate(180deg)" : "none" }}
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>

      {/* Logo */}
      <div className={cn("flex h-[72px] items-center border-b transition-all duration-200", collapsed ? "justify-center px-0" : "px-5")}>
        {collapsed ? (
          <span className="text-[28px] font-bold select-none">d<span className="text-[#8e8e93]">.</span></span>
        ) : (
          <Logo size="md" />
        )}
      </div>

      {/* Navigation */}
      <nav className={cn("flex-1 py-4 space-y-0.5 overflow-hidden", collapsed ? "px-1.5" : "px-2")}>
        {navigation.map((item) => {
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center rounded-lg",
                collapsed ? "justify-center p-3" : "gap-3 px-3 py-2.5",
                active ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <item.icon className="h-[18px] w-[18px] stroke-[2] shrink-0" />
              {!collapsed && <span className="text-[13px]">{item.name}</span>}
            </Link>
          );
        })}

        <div className="pt-5">
          {!collapsed && (
            <p className="px-3 pb-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-[0.05em]">
              Settings
            </p>
          )}
          <div className="space-y-0.5">
            {settingsNav.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "flex items-center rounded-lg",
                    collapsed ? "justify-center p-3" : "gap-3 px-3 py-2.5",
                    active ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <item.icon className="h-[18px] w-[18px] stroke-[2] shrink-0" />
                  {!collapsed && <span className="text-[13px]">{item.name}</span>}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* User menu */}
      {user && (
        <div className={cn("border-t", collapsed ? "p-2" : "p-3")}>
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                "flex w-full items-center rounded-lg hover:bg-accent transition-colors cursor-pointer",
                collapsed ? "justify-center p-2" : "gap-3 px-2 py-2"
              )}
            >
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarImage src={user.avatar_url} alt={user.full_name || ""} />
                <AvatarFallback className="bg-accent text-[11px]">{initials}</AvatarFallback>
              </Avatar>
              {!collapsed && (
                <div className="min-w-0 text-left">
                  <p className="text-[13px] font-medium truncate">{user.full_name || user.email}</p>
                  {user.full_name && <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>}
                </div>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" className="min-w-[200px]">
              {collapsed && (
                <div className="px-3 py-2 border-b mb-1">
                  <p className="text-[13px] font-medium">{user.full_name || user.email}</p>
                  {user.full_name && <p className="text-[11px] text-muted-foreground">{user.email}</p>}
                </div>
              )}
              <DropdownMenuItem onClick={handleSignOut} className="text-[13px] gap-2">
                <LogOut className="h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </aside>
  );
}
