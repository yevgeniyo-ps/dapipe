import type { OrgRole, OrgPermissions } from "@/lib/types/database";

export function getPermissions(role: OrgRole): OrgPermissions {
  switch (role) {
    case "owner":
      return {
        canManageMembers: true,
        canInviteMembers: true,
        canManageSettings: true,
        canManageResources: true,
        canWrite: true,
        isReadOnly: false,
      };
    case "admin":
      return {
        canManageMembers: false,
        canInviteMembers: true,
        canManageSettings: false,
        canManageResources: true,
        canWrite: true,
        isReadOnly: false,
      };
    case "member":
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
