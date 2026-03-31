import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const hostname = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  const isBo = hostname.startsWith("bo.");
  const next = searchParams.get("next") ?? (isBo ? "/admin" : "/dashboard");

  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const origin = forwardedHost
    ? `${proto}://${forwardedHost}`
    : `${proto}://${host}`;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Skip approval check for invitation flow (invite page auto-approves)
      const isInviteFlow = next.startsWith("/invite");

      if (!isInviteFlow) {
        const { data: approved } = await supabase.rpc("is_approved");
        if (!approved) {
          return NextResponse.redirect(`${origin}/waitlist`);
        }
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
