"use client";

import { Menu } from "lucide-react";
import { Logo } from "@/components/logo";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Sidebar } from "./sidebar";

export function Topbar() {
  return (
    <header className="flex h-14 items-center gap-4 px-6 lg:hidden">
      <Sheet>
        <SheetTrigger className="inline-flex items-center justify-center rounded-md p-2 hover:bg-accent transition-colors">
          <Menu className="h-5 w-5" />
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-[200px] bg-sidebar border-border">
          <Sidebar />
        </SheetContent>
      </Sheet>
      <Logo size="md" />
    </header>
  );
}
