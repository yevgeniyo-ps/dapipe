import { readFileSync } from "fs";
import { join } from "path";
import { createServiceClient } from "@/lib/supabase/server";

let cachedScript: string | null = null;

export async function GET(request: Request) {
  const apiKey = request.headers.get("x-dapipe-api-key");
  if (!apiKey) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: orgId } = await supabase.rpc("lookup_org_by_api_key", {
    raw_key: apiKey,
  });
  if (!orgId) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!cachedScript) {
    cachedScript = readFileSync(
      join(process.cwd(), "scripts/remote-setup.sh"),
      "utf-8"
    );
  }

  return new Response(cachedScript, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
