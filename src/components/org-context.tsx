"use client";

import { createContext, useContext, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getPermissions } from "@/lib/permissions";
import type { OrgRole, OrgPermissions, OrgMembership } from "@/lib/types/database";
import { switchOrg as switchOrgAction } from "@/app/(dashboard)/dashboard/actions";

interface OrgContextValue {
  orgId: string;
  role: OrgRole;
  permissions: OrgPermissions;
  memberships: OrgMembership[];
  switchOrg: (orgId: string) => void;
}

const OrgContext = createContext<OrgContextValue | null>(null);

export function OrgProvider({
  orgId,
  role,
  memberships,
  children,
}: {
  orgId: string;
  role: OrgRole;
  memberships: OrgMembership[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const permissions = getPermissions(role);

  const handleSwitchOrg = useCallback(
    async (newOrgId: string) => {
      await switchOrgAction(newOrgId);
      router.refresh();
    },
    [router]
  );

  return (
    <OrgContext.Provider
      value={{ orgId, role, permissions, memberships, switchOrg: handleSwitchOrg }}
    >
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error("useOrg must be used within OrgProvider");
  return ctx;
}

/** @deprecated Use useOrg().orgId instead */
export function useOrgId() {
  const ctx = useContext(OrgContext);
  return ctx?.orgId ?? null;
}
