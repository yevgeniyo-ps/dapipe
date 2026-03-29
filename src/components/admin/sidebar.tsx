"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutDashboard,
  Package,
  Building2,
  ShieldAlert,
  Github,
  UserCog,
  LogOut,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSidebar } from "@/components/sidebar-context";

const navigation = [
  { name: "Overview", href: "/admin", icon: LayoutDashboard },
  { name: "Binaries", href: "/admin/binaries", icon: Package },
  { name: "Organizations", href: "/admin/orgs", icon: Building2 },
  { name: "Network Rules", href: "/admin/endpoints", icon: ShieldAlert },
  { name: "GitHub App", href: "/admin/github-app", icon: Github },
  { name: "Admins", href: "/admin/admins", icon: UserCog },
];

interface AdminSidebarProps {
  user?: {
    email?: string;
    avatar_url?: string;
    full_name?: string;
  };
}

export function AdminSidebar({ user }: AdminSidebarProps) {
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

      {/* Admin banner */}
      <div className={cn("flex items-center justify-center rounded-t-2xl border-b border-amber-500/20 bg-amber-500/10 transition-all duration-200", collapsed ? "py-2" : "py-1.5")}>
        {collapsed ? (
          <span className="text-[10px] font-semibold text-amber-400 uppercase">BO</span>
        ) : (
          <span className="text-[11px] font-medium text-amber-400 tracking-wide uppercase">Admin Backoffice</span>
        )}
      </div>

      {/* Logo */}
      <div className={cn("flex h-[56px] items-center border-b transition-all duration-200", collapsed ? "justify-center px-0" : "px-5")}>
        {collapsed ? (
          <span className="text-[24px] font-bold select-none">d<span className="text-[#8e8e93]">.</span></span>
        ) : (
          <span className="font-bold tracking-tight select-none text-[24px]">
            dapipe<span className="text-[#8e8e93]">.</span>
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className={cn("flex-1 py-4 space-y-0.5 overflow-hidden", collapsed ? "px-1.5" : "px-2")}>
        {navigation.map((item) => {
          const active = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));
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
