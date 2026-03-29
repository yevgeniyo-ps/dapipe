"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Trash2 } from "lucide-react";
import {
  listEndpoints,
  addEndpoint,
  removeEndpoint,
} from "../actions";

interface Endpoint {
  id: string;
  domain: string;
  type: string;
  source: string | null;
  description: string | null;
  created_at: string;
}

export default function EndpointsPage() {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"malicious" | "safe">("malicious");
  const [domain, setDomain] = useState("");
  const [source, setSource] = useState("");
  const [description, setDescription] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadEndpoints();
  }, []);

  async function loadEndpoints() {
    try {
      const result = await listEndpoints();
      setEndpoints((result.endpoints || []) as Endpoint[]);
    } finally {
      setLoading(false);
    }
  }

  const filtered = endpoints.filter((e) => e.type === activeTab);

  const handleAdd = async () => {
    if (!domain.trim()) {
      setError("Domain is required.");
      return;
    }
    setAdding(true);
    setError(null);
    try {
      const result = await addEndpoint(
        domain.trim(),
        activeTab,
        source.trim() || undefined,
        description.trim() || undefined,
      );
      if (result?.error) {
        setError(result.error);
      } else {
        setDomain("");
        setSource("");
        setDescription("");
        await loadEndpoints();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to add endpoint");
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (id: string) => {
    if (!confirm("Remove this endpoint?")) return;
    await removeEndpoint(id);
    await loadEndpoints();
  };

  if (loading)
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );

  return (
    <div className="space-y-6">
      <h1 className="text-[20px] font-semibold">Egress Rules</h1>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
          {error}
        </div>
      )}

      {/* Tab toggle */}
      <div className="flex gap-1 rounded-lg bg-muted p-[3px] w-fit">
        {(["malicious", "safe"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
              activeTab === tab
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "malicious" ? "Malicious" : "Safe"}
            <span className="ml-1.5 text-[11px] text-muted-foreground">
              ({endpoints.filter((e) => e.type === tab).length})
            </span>
          </button>
        ))}
      </div>

      {/* Add form */}
      <div className="rounded-2xl border p-5 space-y-4">
        <h3 className="text-[14px] font-semibold">
          Add {activeTab} endpoint
        </h3>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="text-[13px] font-medium text-secondary-foreground mb-2 block">
              Domain
            </label>
            <Input
              placeholder="e.g. evil.example.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
            />
          </div>
          <div className="w-[180px]">
            <label className="text-[13px] font-medium text-secondary-foreground mb-2 block">
              Source
            </label>
            <Input
              placeholder="optional"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            />
          </div>
          <div className="w-[240px]">
            <label className="text-[13px] font-medium text-secondary-foreground mb-2 block">
              Description
            </label>
            <Input
              placeholder="optional"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <Button onClick={handleAdd} disabled={adding} size="sm">
            {adding ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Add
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border overflow-hidden">
        {filtered.length === 0 ? (
          <p className="text-[13px] text-muted-foreground py-12 text-center">
            No {activeTab} endpoints.
          </p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b">
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">
                  Domain
                </th>
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">
                  Source
                </th>
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">
                  Description
                </th>
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">
                  Added
                </th>
                <th className="px-4 py-3 text-right text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ep) => (
                <tr key={ep.id} className="border-b last:border-0">
                  <td className="px-4 py-3 text-[13px] font-mono font-medium">
                    {ep.domain}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-muted-foreground">
                    {ep.source || "--"}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-muted-foreground max-w-[300px] truncate">
                    {ep.description || "--"}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-muted-foreground">
                    {new Date(ep.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleRemove(ep.id)}
                    >
                      <Trash2 className="mr-1 h-3 w-3" />
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
