import type { OrgRole } from "@/lib/types/database";
import { createClient } from "@/lib/supabase/server";

export async function requireRole(
  orgId: string,
  allowedRoles: OrgRole[]
): Promise<{ userId: string; role: OrgRole }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: membership } = await supabase
    .from("org_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .single();

  if (!membership || !allowedRoles.includes(membership.role as OrgRole))
    throw new Error("Forbidden");

  return { userId: user.id, role: membership.role as OrgRole };
}
