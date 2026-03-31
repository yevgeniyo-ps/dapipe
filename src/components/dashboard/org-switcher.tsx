"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useOrg } from "@/components/org-context";
import { useSidebar } from "@/components/sidebar-context";
import { createOrg } from "@/app/(dashboard)/dashboard/actions";
import { cn } from "@/lib/utils";
import { Building2, ChevronDown, Check, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function OrgSwitcher() {
  const { orgId, memberships, switchOrg } = useOrg();
  const { collapsed } = useSidebar();
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const currentOrg = memberships.find((m) => m.org_id === orgId);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setError("");
    const slug = newName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const result = await createOrg(newName.trim(), slug);
    if (result.error) {
      setError(result.error);
      setCreating(false);
    } else {
      setShowCreate(false);
      setNewName("");
      setCreating(false);
      router.refresh();
    }
  };

  if (memberships.length <= 1 && !collapsed) {
    return (
      <div className="px-3 pb-1">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-[12px] font-medium text-muted-foreground truncate">
            {currentOrg?.org_name || "Organization"}
          </span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={cn("pb-1", collapsed ? "px-1.5" : "px-2")}>
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              "flex w-full items-center rounded-lg hover:bg-accent transition-colors cursor-pointer",
              collapsed ? "justify-center p-2.5" : "gap-2 px-3 py-2"
            )}
          >
            <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
            {!collapsed && (
              <>
                <span className="text-[13px] font-medium truncate flex-1 text-left">
                  {currentOrg?.org_name || "Organization"}
                </span>
                <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
              </>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side={collapsed ? "right" : "bottom"}
            align="start"
            className="min-w-[200px]"
          >
            {memberships.map((m) => (
              <DropdownMenuItem
                key={m.org_id}
                onClick={() => {
                  if (m.org_id !== orgId) switchOrg(m.org_id);
                }}
                className="text-[13px] gap-2"
              >
                <span className="flex-1 truncate">{m.org_name}</span>
                {m.org_id === orgId && (
                  <Check className="h-3.5 w-3.5 text-foreground shrink-0" />
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setShowCreate(true)}
              className="text-[13px] gap-2"
            >
              <Plus className="h-3.5 w-3.5" />
              Create organization
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Organization</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground mb-1 block">
                Organization name
              </label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Acme Corp"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
            {error && (
              <p className="text-[12px] text-red-400">{error}</p>
            )}
          </div>
          <DialogFooter>
            <Button onClick={handleCreate} disabled={creating || !newName.trim()} size="sm">
              {creating ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
