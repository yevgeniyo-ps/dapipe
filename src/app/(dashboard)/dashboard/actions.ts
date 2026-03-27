"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import crypto from "crypto";

// ── API Keys ───────────────────────────────────────────────

export async function createApiKey(orgId: string, name: string) {
  const rawKey = `dp_${crypto.randomUUID().replace(/-/g, "")}`;
  const prefix = rawKey.slice(0, 10) + "...";
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

  const supabase = await createClient();
  const { error } = await supabase.from("api_keys").insert({
    org_id: orgId,
    key_hash: keyHash,
    key_prefix: prefix,
    name,
  });

  if (error) return { error: error.message, key: null };

  revalidatePath("/dashboard/settings/api-keys");
  return { error: null, key: rawKey };
}

export async function revokeApiKey(keyId: string) {
  const supabase = await createClient();
  await supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", keyId);

  revalidatePath("/dashboard/settings/api-keys");
}

export async function getApiKeys(orgId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("api_keys")
    .select("*")
    .eq("org_id", orgId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  return data || [];
}

// ── Policies ───────────────────────────────────────────────

export async function getPolicy(orgId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("policies")
    .select("*")
    .eq("org_id", orgId)
    .is("repo_id", null)
    .limit(1)
    .maybeSingle();
  return data;
}

export async function savePolicy(
  orgId: string,
  policyId: string | null,
  payload: {
    mode: string;
    allowed_domains: string[];
    blocked_domains: string[];
    blocked_ips: string[];
  }
) {
  const supabase = await createClient();
  const row = { org_id: orgId, repo_id: null, ...payload };

  if (policyId) {
    await supabase.from("policies").update(row).eq("id", policyId);
  } else {
    await supabase.from("policies").insert(row);
  }

  revalidatePath("/dashboard/policies");
}

// ── Settings ───────────────────────────────────────────────

export async function getOrg(orgId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", orgId)
    .maybeSingle();
  return data;
}

export async function saveOrg(orgId: string, name: string, slug: string) {
  const supabase = await createClient();
  await supabase
    .from("organizations")
    .update({ name, slug })
    .eq("id", orgId);

  revalidatePath("/dashboard/settings");
}
