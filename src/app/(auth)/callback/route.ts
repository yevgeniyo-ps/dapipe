import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  // Use x-forwarded-host on Vercel, fall back to host header
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
      // Check if user is approved
      const { data: approved } = await supabase.rpc("is_approved");
      if (!approved) {
        return NextResponse.redirect(`${origin}/waitlist`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }

    // Log exchange error for debugging
    console.error("Auth code exchange failed:", error.message);
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
