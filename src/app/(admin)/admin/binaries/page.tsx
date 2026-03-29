"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Loader2, Upload, Trash2, Star } from "lucide-react";
import {
  listBinaries,
  uploadBinary,
  setLatestBinary,
  deleteBinary,
} from "../actions";

interface Binary {
  id: string;
  version: string;
  arch: string;
  file_size: number | null;
  sha256_hash: string | null;
  storage_path: string;
  is_latest: boolean;
  release_notes: string;
  download_count: number;
  created_at: string;
}

export default function BinariesPage() {
  const [binaries, setBinaries] = useState<Binary[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [version, setVersion] = useState("");
  const [arch, setArch] = useState("x86_64");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadBinaries();
  }, []);

  async function loadBinaries() {
    try {
      const result = await listBinaries();
      setBinaries((result.binaries || []) as Binary[]);
    } finally {
      setLoading(false);
    }
  }

  const handleUpload = async () => {
    if (!version.trim() || !file) {
      setError("Version and file are required.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("version", version.trim());
      formData.append("arch", arch);
      formData.append("file", file);
      const result = await uploadBinary(formData);
      if (result?.error) {
        setError(result.error);
      } else {
        setVersion("");
        setFile(null);
        await loadBinaries();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleSetLatest = async (id: string) => {
    await setLatestBinary(id);
    await loadBinaries();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this binary? This cannot be undone.")) return;
    await deleteBinary(id);
    await loadBinaries();
  };

  function formatBytes(bytes: number | null): string {
    if (bytes === null || bytes === undefined) return "--";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (loading)
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );

  return (
    <div className="space-y-6">
      <h1 className="text-[20px] font-semibold">Agent Binaries</h1>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
          {error}
        </div>
      )}

      {/* Upload form */}
      <div className="rounded-2xl border p-5 space-y-4">
        <h3 className="text-[14px] font-semibold">Upload new binary</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-[13px] font-medium text-secondary-foreground mb-2 block">
              Version
            </label>
            <Input
              placeholder="e.g. 0.1.0"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              className="w-[160px]"
            />
          </div>
          <div>
            <label className="text-[13px] font-medium text-secondary-foreground mb-2 block">
              Architecture
            </label>
            <Select value={arch} onValueChange={(v) => v && setArch(v)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="x86_64">x86_64</SelectItem>
                <SelectItem value="arm64">arm64</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[13px] font-medium text-secondary-foreground mb-2 block">
              File
            </label>
            <Input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-[260px]"
            />
          </div>
          <Button onClick={handleUpload} disabled={uploading} size="sm">
            {uploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            Upload
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border overflow-hidden">
        {binaries.length === 0 ? (
          <p className="text-[13px] text-muted-foreground py-12 text-center">
            No binaries uploaded yet.
          </p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b">
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">
                  Version
                </th>
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">
                  Arch
                </th>
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">
                  Size
                </th>
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">
                  Release Notes
                </th>
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">
                  Downloads
                </th>
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">
                  Uploaded
                </th>
                <th className="px-4 py-3 text-right text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {binaries.map((b) => (
                <tr key={b.id} className="border-b last:border-0">
                  <td className="px-4 py-3 text-[13px] font-medium">
                    {b.version}
                  </td>
                  <td className="px-4 py-3 text-[13px] font-mono text-muted-foreground">
                    {b.arch}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-muted-foreground">
                    {formatBytes(b.file_size)}
                  </td>
                  <td className="px-4 py-3 text-[12px] text-muted-foreground max-w-[250px] truncate" title={b.release_notes}>
                    {b.release_notes || "--"}
                  </td>
                  <td className="px-4 py-3">
                    {b.is_latest ? (
                      <Badge variant="default" className="bg-emerald-600 text-white">
                        latest
                      </Badge>
                    ) : (
                      <span className="text-[12px] text-muted-foreground">
                        --
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-[13px] font-medium tabular-nums">
                    {b.download_count.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-muted-foreground">
                    {new Date(b.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {!b.is_latest && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleSetLatest(b.id)}
                        >
                          <Star className="mr-1 h-3 w-3" />
                          Set latest
                        </Button>
                      )}
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(b.id)}
                      >
                        <Trash2 className="mr-1 h-3 w-3" />
                        Delete
                      </Button>
                    </div>
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
