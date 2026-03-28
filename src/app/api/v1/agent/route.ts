import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const apiKey = request.headers.get("x-dapipe-api-key");
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing x-dapipe-api-key header" },
      { status: 401 }
    );
  }

  const supabase = createServiceClient();

  // Validate API key
  const { data: orgId, error: lookupError } = await supabase.rpc(
    "lookup_org_by_api_key",
    { raw_key: apiKey }
  );

  if (lookupError || !orgId) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const arch = searchParams.get("arch") || "x86_64";
  const version = searchParams.get("version") || "latest";

  if (!["x86_64", "arm64"].includes(arch)) {
    return NextResponse.json(
      { error: "Invalid arch. Must be x86_64 or arm64" },
      { status: 400 }
    );
  }

  // Look up the binary
  let query = supabase.from("agent_binaries").select("*");
  if (version === "latest") {
    query = query.eq("is_latest", true).eq("arch", arch);
  } else {
    query = query.eq("version", version).eq("arch", arch);
  }

  const { data: binary, error: binaryError } = await query.limit(1).single();

  if (binaryError || !binary) {
    return NextResponse.json(
      { error: `No binary found for arch=${arch} version=${version}` },
      { status: 404 }
    );
  }

  // Download from Supabase Storage
  const { data: fileData, error: downloadError } = await supabase.storage
    .from("agent")
    .download(binary.storage_path);

  if (downloadError || !fileData) {
    return NextResponse.json(
      { error: "Failed to download binary from storage" },
      { status: 500 }
    );
  }

  // Log the download (fire and forget)
  supabase
    .from("agent_downloads")
    .insert({ org_id: orgId, version: binary.version, arch })
    .then(() => {});

  const arrayBuffer = await fileData.arrayBuffer();

  return new Response(Buffer.from(arrayBuffer), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="dapipe_hook.so"`,
      "Cache-Control": "private, max-age=3600",
      "X-DaPipe-Version": binary.version,
      "X-DaPipe-SHA256": binary.sha256_hash || "",
    },
  });
}
