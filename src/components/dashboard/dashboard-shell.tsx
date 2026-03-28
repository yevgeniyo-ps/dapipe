"use client";

import { useSidebar } from "@/components/sidebar-context";
import { cn } from "@/lib/utils";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  return (
    <div
      className={cn(
        "min-h-screen bg-background transition-[margin-left] duration-200 ease-in-out",
        collapsed ? "lg:ml-[80px]" : "lg:ml-[224px]"
      )}
    >
      {children}
    </div>
  );
}
