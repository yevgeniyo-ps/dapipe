"use client";

import { useEffect, useState } from "react";
import { useOrg } from "@/components/org-context";
import { getOrg, saveOrg } from "../actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Save } from "lucide-react";

export default function SettingsPage() {
  const { orgId, permissions } = useOrg();
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) { setLoading(false); return; }
    async function load() {
      try {
        const org = await getOrg(orgId!);
        if (org) { setOrgName(org.name); setOrgSlug(org.slug); }
      } finally { setLoading(false); }
    }
    load();
  }, [orgId]);

  const handleSave = async () => {
    if (!orgId) return;
    setSaving(true);
    await saveOrg(orgId, orgName, orgSlug);
    setSaving(false);
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="text-[20px] font-semibold">Settings</h1>

      <div className="rounded-2xl border p-5 space-y-5">
        <div>
          <label className="text-[13px] font-medium text-secondary-foreground mb-2 block">Name</label>
          <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} />
        </div>
        <div>
          <label className="text-[13px] font-medium text-secondary-foreground mb-2 block">Slug</label>
          <Input value={orgSlug} onChange={(e) => setOrgSlug(e.target.value)} />
        </div>
        {permissions.canManageSettings && (
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save
          </Button>
        )}
      </div>
    </div>
  );
}
