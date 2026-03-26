"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  GitFork,
  Shield,
  FileBarChart,
  Settings,
  Key,
  Users,
} from "lucide-react";

const navigation = [
  { name: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { name: "Repos", href: "/dashboard/repos", icon: GitFork },
  { name: "Policies", href: "/dashboard/policies", icon: Shield },
  { name: "Reports", href: "/dashboard/reports", icon: FileBarChart },
];

const settingsNav = [
  { name: "API Keys", href: "/dashboard/settings/api-keys", icon: Key },
  { name: "Members", href: "/dashboard/settings/members", icon: Users },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:border-r lg:bg-card">
      <div className="flex h-14 items-center gap-2 border-b px-6">
        <Shield className="h-5 w-5 text-primary" />
        <span className="font-semibold">DaPipe</span>
      </div>
      <nav className="flex-1 px-4 py-4 space-y-1">
        {navigation.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          );
        })}

        <div className="pt-4">
          <p className="px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Settings
          </p>
          <div className="mt-2 space-y-1">
            {settingsNav.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.name}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </aside>
  );
}
