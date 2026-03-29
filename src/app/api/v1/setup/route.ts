import { readFileSync } from "fs";
import { join } from "path";

let cachedScript: string | null = null;

export async function GET() {
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
