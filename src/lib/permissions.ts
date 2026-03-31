import type { OrgRole, OrgPermissions } from "@/lib/types/database";

export const ROLE_LABELS: Record<OrgRole, string> = {
  admin: "Admin",
  power: "Power",
  readonly: "Read-only",
};

export function getPermissions(role: OrgRole): OrgPermissions {
  switch (role) {
    case "admin":
      return {
        canManageMembers: true,
        canInviteMembers: true,
        canManageSettings: true,
        canManageResources: true,
        canWrite: true,
        isReadOnly: false,
      };
    case "power":
      return {
        canManageMembers: false,
        canInviteMembers: true,
        canManageSettings: false,
        canManageResources: true,
        canWrite: true,
        isReadOnly: false,
      };
    case "readonly":
      return {
        canManageMembers: false,
        canInviteMembers: false,
        canManageSettings: false,
        canManageResources: false,
        canWrite: false,
        isReadOnly: true,
      };
  }
}
